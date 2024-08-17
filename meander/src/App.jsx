import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const App = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [selectedTrees, setSelectedTrees] = useState([]);
  const [selectedTreeName, setSelectedTreeName] = useState(null);
  const popupRef = useRef(new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    closeOnMove: true,
    offset: [0, -15],
    anchor: "left",
    className: "text-lg font-medium"
  }));

  const highlightFeatures = async (treeName) => {
    if (mapRef.current) {
      mapRef.current.setFilter("highlighted-point", ["in", "common_name", treeName]);
      const source = mapRef.current.getSource("trees");
      const allClusters = mapRef.current.queryRenderedFeatures({ layers: ["clusters"] });
      const clusterIdsToHighlight = [];
      for (const cluster of allClusters) {
        const clusterId = cluster.properties.cluster_id;
        const leaves = await new Promise((resolve, reject) => {
          source.getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
            if (err) reject(err);
            resolve(leaves);
          });
        });
        if (leaves.some(leaf => leaf.properties.common_name === treeName)) {
          clusterIdsToHighlight.push(clusterId);
        }
      }
      mapRef.current.setFilter("highlighted-cluster", ["in", "cluster_id", ...clusterIdsToHighlight]);
      setSelectedTreeName(treeName)
    }
  };
  const createPopup = (event) => {
    const coordinates = event.features[0].geometry.coordinates.slice();
    const commonName = event.features[0].properties.common_name;
    setTimeout(() => {
      popupRef.current
      .setLngLat(coordinates)
      .setText(`${commonName} (${coordinates})`)
      .addTo(mapRef.current);
    }, 100);
  };

  const removePopup = () => {
    popupRef.current.remove();
  };

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-71.09299151011383, 42.38245089323975],
      zoom: 18,
      boxZoom: false
    });
    mapRef.current = map;

    map.on("load", () => {
      fetch("/assets/treeLocations.csv")
        .then((response) => response.text())
        .then((csvData) => {
          const parsedData = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
          }).data;

          const geojsonData = {
            type: "FeatureCollection",
            features: parsedData.map((location) => ({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [parseFloat(location.longitude), parseFloat(location.latitude)],
              },
              properties: {
                common_name: location.common_name,
              },
            })),
          };

          map.addSource("trees", {
            type: "geojson",
            data: geojsonData,
            cluster: true,
            clusterMaxZoom: 16,
            clusterRadius: 50,
          });

          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "trees",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#51bbd6",
              "circle-radius": 20,
            },
          });

          map.addLayer({
            id: "highlighted-cluster",
            type: "circle",
            source: "trees",
            filter: ["in", "cluster_id", ""],
            paint: {
              "circle-color": "#FFD580",
              "circle-radius": 20,
            },
          });

          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "trees",
            filter: ["has", "point_count"],
            layout: {
              "text-field": "{point_count_abbreviated}",
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
          });

          map.addLayer({
            id: "unclustered-point",
            type: "circle",
            source: "trees",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#11b4da",
              "circle-radius": 15,
            },
          });

          map.addLayer({
            id: "highlighted-point",
            type: "circle",
            source: "trees",
            filter: ["in", "common_name", ""],
            paint: {
              "circle-color": "#FFD580",
              "circle-radius": 15,
            },
          });

          const updateVisibleTrees = async () => {
            if (selectedTreeName) {
              highlightFeatures(selectedTreeName);
            }
            const clusters = map.queryRenderedFeatures({ layers: ["unclustered-point", "clusters"] });
            const groupedTrees = await clusters.reduce(async (accPromise, cluster) => {
              const groups = await accPromise;
              let features = [];
              if (cluster.properties.cluster) {
                const clusterId = cluster.properties.cluster_id;
                const source = map.getSource("trees");
                features = await new Promise((resolve, reject) => {
                  source.getClusterLeaves(clusterId, Infinity, 0, (error, leaves) => {
                    if (error) reject(error);
                    resolve(leaves);
                  });
                });
              } else {
                features = [cluster];
              }
              features.forEach(feature => {
                const name = feature.properties.common_name;
                if (!groups[name]) {
                  groups[name] = [];
                }
                groups[name].push(feature);
              });
              return groups;
            }, Promise.resolve({}));
            setSelectedTrees(Object.entries(groupedTrees).sort((a, b) => b[1].length - a[1].length));
          };

          updateVisibleTrees();
          map.on("moveend", updateVisibleTrees);
          map.on("touchstart", "unclustered-point", createPopup);
          map.on("mouseenter", "unclustered-point", createPopup);
          map.on("touchend", "unclustered-point", removePopup);
          map.on("mouseleave", "unclustered-point", removePopup);
          map.on("mouseenter", "clusters", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseenter", "unclustered-point", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "clusters", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseleave", "unclustered-point", () => {
            map.getCanvas().style.cursor = "";
          });
        });
    });
    return () => {
      map.remove();
    };
  }, []);

  return (
    <div>
      <div ref={mapContainerRef} style={{ width: "100vw", height: "100vh" }} />
      {Object.keys(selectedTrees).length > 0 && (
        <div className="absolute top-0 left-0 bg-white p-4 m-4 shadow-lg max-h-screen overflow-y-auto">
          <h3 className="text-lg font-bold mb-2">Visible Trees</h3>
          <ul>
            {selectedTrees.map(([name, trees], index) => (
              <li
                key={index}
                className={`text-sm text-gray-700 cursor-pointer hover:bg-blue-200 ${selectedTreeName === name ? 'bg-orange-300' : ''}`}
                onClick={() => highlightFeatures(name)}
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
