import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";
import { debounce } from "lodash";
import "./App.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const fetchTreeData = async () => {
  const response = await fetch(`${process.env.PUBLIC_URL}/assets/treeLocations.csv`);
  const csvData = await response.text();
  const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true }).data;
  const geojsonData = {
    type: "FeatureCollection",
    features: parsedData.map(({ longitude, latitude, common_name }, index) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      properties: {
        common_name,
        index
      },
    })),
  };
  return geojsonData;
};

const addTreeLayers = (map, geojsonData) => {
  map.addSource("trees", {
    type: "geojson",
    data: geojsonData,
    cluster: true,
    clusterMaxZoom: 16,
    clusterRadius: 50,
  });

  const layers = [
    {
      id: "clusters",
      type: "circle",
      source: "trees",
      filter: ["has", "point_count"],
      paint: { "circle-color": "#51bbd6", "circle-radius": 20 },
    },
    {
      id: "highlighted-cluster",
      type: "circle",
      source: "trees",
      filter: ["in", "cluster_id", ""],
      paint: { "circle-color": "#FFD580", "circle-radius": 20 },
    },
    {
      id: "cluster-count",
      type: "symbol",
      source: "trees",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
    },
    {
      id: "unclustered-point",
      type: "circle",
      source: "trees",
      filter: ["!", ["has", "point_count"]],
      paint: { "circle-color": "#11b4da", "circle-radius": 15 },
    },
    {
      id: "highlighted-point",
      type: "circle",
      source: "trees",
      filter: ["in", "common_name", ""],
      paint: { "circle-color": "#FFD580", "circle-radius": 15 },
    },
  ];
  layers.forEach((layer) => map.addLayer(layer));
};

const getClusterFeatures = (map, clusterId) => {
  const source = map.getSource("trees");
  return new Promise((resolve, reject) => {
    source.getClusterLeaves(clusterId, Infinity, 0, (error, leaves) => {
      if (error) {
        reject(error);
      } else {
        resolve(leaves || []);
      }
    });
  });
};

const updateVisibleTrees = async (map, setVisibleTrees) => {
  let trees = map.queryRenderedFeatures({layers: ["unclustered-point"]});
  trees = Array
    .from(new Set(trees.map(feature => feature.properties.index)))
    .map(index => trees.find(feature => feature.properties.index === index));
  const clusters = map.queryRenderedFeatures({layers: ["clusters"]});

  const groupedTrees = await trees.concat(clusters).reduce(async (groupsPromise, cluster) => {
    const groups = await groupsPromise;
    const features = cluster.properties.cluster ? await getClusterFeatures(map, cluster.properties.cluster_id) : [cluster];
    features.forEach(({ properties: { common_name } }) => {
      if (!groups[common_name]) groups[common_name] = [];
      groups[common_name].push(cluster);
    });
    return groups;
  }, Promise.resolve({}));

  setVisibleTrees(Object.entries(groupedTrees).sort((a, b) => b[1].length - a[1].length));
};

const App = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(
    new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: true,
      offset: [0, -15],
      className: "text-medium",
    })
  );
  const [visibleTrees, setVisibleTrees] = useState([]);
  const [highlightedTree, setHighlightedTree] = useState(null);

  const highlightTree = async (tree) => {
    if (mapRef.current && tree) {
      const allClusters = mapRef.current.queryRenderedFeatures({ layers: ["clusters"] });
      const clusterIdsToHighlight = [];

      for (const cluster of allClusters) {
        const clusterId = cluster.properties.cluster_id;
        const leaves = await getClusterFeatures(mapRef.current, clusterId);
        if (leaves.some((leaf) => leaf.properties.common_name === tree)) {
          clusterIdsToHighlight.push(clusterId);
        }
      }
      mapRef.current.setFilter("highlighted-point", ["in", "common_name", tree]);
      mapRef.current.setFilter("highlighted-cluster", ["in", "cluster_id", ...clusterIdsToHighlight]);
    }
  };

  const createTreePopup = (event) => {
    const coordinates = event.features[0].geometry.coordinates.slice();
    const commonName = event.features[0].properties.common_name;
    setTimeout(() => {
      popupRef.current
        .setLngLat(coordinates)
        .setText(commonName)
        .addTo(mapRef.current);
    }, 100);
  };

  const removeTreePopup = () => {
    popupRef.current.remove();
  };

  const updateMap = useCallback(async (tree) => {
    if (mapRef.current) {
      await highlightTree(tree);
      await updateVisibleTrees(mapRef.current, setVisibleTrees);
    }
  }, []);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-71.09299151011383, 42.38245089323975],
      zoom: 18,
      boxZoom: false,
    });
    mapRef.current = map;

    const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: false,
      showUserHeading: true,
    });
    map.addControl(geolocateControl, "bottom-right");

    map.on("load", async () => {
      geolocateControl.trigger();
      fetchTreeData().then(geojsonData => {
        addTreeLayers(map, geojsonData)
        map.once("idle", async () => {
          await updateVisibleTrees(map, setVisibleTrees);
        });
      });
      map.on("mouseenter", "unclustered-point", createTreePopup);
      map.on("mouseleave", "unclustered-point", removeTreePopup);
      map.on("touchstart", "unclustered-point", createTreePopup);
      map.on("touchend", "unclustered-point", removeTreePopup);
    });

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    const debouncedUpdateMap = debounce(() => updateMap(highlightedTree), 300);
    if (mapRef.current) {
      mapRef.current.on("moveend", debouncedUpdateMap);
      mapRef.current.on("zoomend", debouncedUpdateMap);
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", debouncedUpdateMap);
        mapRef.current.off("zoomend", debouncedUpdateMap);
      }
    };
  }, [highlightedTree, updateMap]);

  return (
    <div>
      <div ref={mapContainerRef} style={{ width: "100vw", height: "100vh" }} />
      {Object.keys(visibleTrees).length > 0 && (
        <div className="absolute top-0 left-0 bg-white p-4 m-4 shadow-lg max-h-screen overflow-y-auto">
          <h3 className="text-lg font-bold mb-2">Visible Trees</h3>
          <ul>
            {visibleTrees.map(([name, trees], index) => (
              <li
                key={index}
                className={`text-sm text-gray-700 cursor-pointer hover:bg-blue-200 ${highlightedTree === name ? "bg-orange-300" : ""}`}
                onClick={() => {
                  setHighlightedTree(name);
                  highlightTree(name);
                }}
              >
                <strong>{name}</strong> ({trees.length} trees)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default App;
