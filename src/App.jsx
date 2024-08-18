import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";
import { debounce } from "lodash";
import "./App.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const fetchTreeLocations = async () => {
  const response = await fetch(`${process.env.PUBLIC_URL}/assets/tree_locations.csv`);
  const csvData = await response.text();
  const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true }).data;
  const geojsonData = {
    type: "FeatureCollection",
    features: parsedData
      .filter(row => row.date_removed === null || row.date_removed.trim() === "")
      .map(({ location_id, tree_id, latin_name, common_name, is_native, longitude, latitude, source }) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
        properties: {
          location_id,
          tree_id,
          latin_name,
          source,
          common_name,
          is_native,
        },
      })),
  };
  return geojsonData;
};

const fetchTreeInfo = async () => {
  const response = await fetch(`${process.env.PUBLIC_URL}/assets/tree_information.csv`);
  const csvData = await response.text();
  const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true }).data;
  const treeInfo = parsedData.reduce((accumulator, row) => {
      accumulator[row.tree_id] = row;
      return accumulator;
  }, {});
  return treeInfo;
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
  const [treeLocations, setTreeLocations] = useState([]);
  const [treeInfo, setTreeInfo] = useState([]);
  const [visibleTrees, setVisibleTrees] = useState([]);
  const [highlightedTree, setHighlightedTree] = useState(null);
  const [isTreeListVisible, setIsTreeListVisible] = useState(false);
  const [isHamburgerVisible, setIsHamburgerVisible] = useState(true);
  const [isHamburgerFadingOut, setIsHamburgerFadingOut] = useState(false);

  const highlightTree = async (treeName) => {
    if (mapRef.current && treeName) {
      const allClusters = mapRef.current.queryRenderedFeatures({ layers: ["clusters"] });
      const clusterIdsToHighlight = [];

      for (const cluster of allClusters) {
        const clusterId = cluster.properties.cluster_id;
        const leaves = await getClusterFeatures(mapRef.current, clusterId);
        if (leaves.some((leaf) => leaf.properties.common_name === treeName)) {
          clusterIdsToHighlight.push(clusterId);
        }
      }
      mapRef.current.setFilter("highlighted-point", ["in", "common_name", treeName]);
      mapRef.current.setFilter("highlighted-cluster", ["in", "cluster_id", ...clusterIdsToHighlight]);
    } else {
      mapRef.current.setFilter("highlighted-point", ["in", "common_name", ""]);
      mapRef.current.setFilter("highlighted-cluster", ["in", "cluster_id", ""]);
    }
  };

  function createPopupContent(tree, properties) {
    return `
      <div class="font-sans text-sm leading-tight">
        <h3 class="m-0 text-lg font-bold">${properties.common_name}</h3>
        <p class="text-gray-500 italic text-sm">(${tree.family} ${properties.latin_name})</p>
        <div class="my-4 pb-2" />
        <p>${properties.is_native === 'True' ? 'Native' : 'Non-Native'}</p>
        <p>${tree.iucn_red_list_assessment}</p>
        </div>
        <div class="absolute bottom-0 right-0 mb-2 mr-2 text-xs italic text-gray-400">${properties.source}</div>
      </div>
    `;
  }

  const updateMap = useCallback(async (treeName) => {
    if (mapRef.current) {
      await highlightTree(treeName);
      await updateVisibleTrees(mapRef.current, setVisibleTrees);
    }
  }, []);

  const handleTreeListClick = (treeName) => {
    if (treeName === highlightedTree) {
      treeName = null
    }
    setHighlightedTree(treeName);
    highlightTree(treeName);
  };

  const toggleTreeList = () => {
    setIsHamburgerFadingOut(!isHamburgerFadingOut);
    setIsTreeListVisible(!isTreeListVisible);
    setTimeout(() => {
      setIsHamburgerVisible(!isHamburgerVisible);
      setIsHamburgerFadingOut(isHamburgerFadingOut);
    }, 500)
  };

  useEffect(() => {
    fetchTreeInfo().then(data => setTreeInfo(data));
    fetchTreeLocations().then(data => setTreeLocations(data));
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
    map.addControl(geolocateControl, "top-right");

    map.on("load", () => {
      geolocateControl.trigger();
      addTreeLayers(map, treeLocations)
      map.once("idle", async () => {
        await updateVisibleTrees(map, setVisibleTrees);
      });
      map.on("mouseenter", "unclustered-point", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "unclustered-point", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("touchstart", () => {
        setIsTreeListVisible(false);
        setIsHamburgerVisible(true);
        setIsHamburgerFadingOut(false);
      });
    });

    return () => {
      map.remove();
    };
  }, [treeLocations]);

  useEffect(() => {
    const createTreePopup = (event) => {
      const coordinates = event.features[0].geometry.coordinates.slice();
      const locationProperties = event.features[0].properties;
      const tree = treeInfo[locationProperties.tree_id]
      const popupContent = createPopupContent(tree, locationProperties);
      setTimeout(() => {
        popupRef.current
          .setLngLat(coordinates)
          .setHTML(popupContent)
          .addTo(mapRef.current);
      }, 100);
    };

    const removeTreePopup = () => {
      popupRef.current.remove();
    };

    mapRef.current.on("mouseenter", "unclustered-point", createTreePopup);
    mapRef.current.on("mouseleave", "unclustered-point", removeTreePopup);
    mapRef.current.on("touchstart", "unclustered-point", createTreePopup);
    mapRef.current.on("touchend", "unclustered-point", removeTreePopup);
  }, [treeInfo])

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
      <div ref={mapContainerRef} className="w-screen h-screen" />
      {isHamburgerVisible && (
        <button
          className={`fixed top-4 left-4 bg-white border border-gray-300 p-2 rounded md:hidden z-50 transition-opacity duration-500 ${isHamburgerFadingOut ? 'opacity-0' : 'opacity-100'}`}
          onClick={toggleTreeList}
        >
          ☰
        </button>
      )}

      <div
        className={`absolute top-0 left-0 bg-white p-4 shadow-lg max-h-screen overflow-y-auto z-40 transition-transform transform duration-500 ${isTreeListVisible ? 'translate-x-0' : '-translate-x-[120%]'} md:translate-x-0 md:block`}
      >
        <h3 className="text-lg font-bold mb-2">Visible Trees</h3>
        <ul>
          {visibleTrees.map(([name, trees], index) => (
            <li
              key={index}
              className={`text-sm text-gray-700 cursor-pointer hover:bg-blue-200 ${highlightedTree === name ? "bg-orange-300" : ""}`}
              onClick={() => handleTreeListClick(name)}
            >
              <strong>{name}</strong> ({trees.length} trees)
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default App;
