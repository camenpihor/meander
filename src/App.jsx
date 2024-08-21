import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";
import { debounce } from "lodash";
import "./App.css";
import NewTreeForm from "./components/NewTreeForm";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const NORMAL_MODE = 0;
const ADD_MODE = 1;
const DELETE_MODE = 2;

const readCSV = async (filepath) => {
  const response = await fetch(filepath);
  const csvData = await response.text();
  const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true }).data;
  return parsedData
}

const treeToFeature = (tree) => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates: [parseFloat(tree.longitude), parseFloat(tree.latitude)],
  },
  properties: {
    location_id: tree.location_id,
    tree_id: tree.tree_id,
    latin_name: tree.latin_name,
    source: tree.source,
    common_name: tree.common_name,
    is_native: tree.is_native,
  },
});

export const fetchTreeLocations = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/trees`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const trees = await response.json();
    const geojsonData = {
      type: "FeatureCollection",
      features: trees.map(treeToFeature),
    };
    return geojsonData
  } catch (error) {
    console.error("Error fetching trees:", error);
    throw error;
  }
};

const fetchTreeInfo = async () => {
  const data = await readCSV(`${process.env.PUBLIC_URL}/assets/tree_information.csv`);
  const treeInfo = data.reduce((accumulator, row) => {
      accumulator[row.tree_id] = row;
      return accumulator;
  }, {});
  return treeInfo;
};

export const sendRemoveLocation = async (locationId, removedBy) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/trees/remove/${locationId}`, {
      method: "PUT",
      headers: {
          "Content-Type": "application/json",
      },
      body: JSON.stringify({ removed_by: removedBy }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`Error removing tree with location_id ${locationId}:`, error);
    throw error;
  }
};

export const sendAddLocation = async ({ tree_id, latin_name, common_name, latitude, longitude, source, is_native }) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/trees`, {
      method: "POST",
      headers: {
          "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tree_id: tree_id,
        latin_name: latin_name,
        common_name: common_name,
        latitude: latitude,
        longitude: longitude,
        source: source,
        is_native: is_native,
        date_added: new Date().toISOString()
      }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error adding new tree:", error);
    throw error;
  }
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
    .from(new Set(trees.map(feature => feature.properties.location_id)))
    .map(location_id => trees.find(feature => feature.properties.location_id === location_id));
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
  const [currentPopupLocation, setCurrentPopupLocation] = useState([]);
  const additionalMapBoxButtonsRef = useRef(null);
  const [treeLocations, setTreeLocations] = useState([]);
  const [treeInfo, setTreeInfo] = useState([]);
  const [visibleTrees, setVisibleTrees] = useState([]);
  const [highlightedTree, setHighlightedTree] = useState(null);
  const [mapMode, setMapMode] = useState(0);
  const [isTreeListVisible, setIsTreeListVisible] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [newTreeCoordinates, setNewTreeCoordinates] = useState([]);

  const handleAddTreeCancel = () => {
    setNewTreeCoordinates([]);
    setIsFormVisible(false);
    setMapMode(NORMAL_MODE);
  }

  const handleAddTreeSubmit = async (newTree) => {
    try {
      const addedTree = await sendAddLocation({
        tree_id: newTree.tree_id,
        latin_name: newTree.latin_name,
        common_name: newTree.common_name,
        latitude: newTree.latitude,
        longitude: newTree.longitude,
        source: newTree.source,
        is_native: newTree.is_native,
      });
      setTreeLocations({
          ...treeLocations,
          features: [...treeLocations.features, treeToFeature(addedTree)]
      });
      setIsFormVisible(false);
      setMapMode(NORMAL_MODE);
    } catch (error) {
      console.error("Error adding new tree:", error);
    }
  };

  const addTree = (event) => {
    setNewTreeCoordinates(event.lngLat);
    setIsFormVisible(true);
  }

  const removeTree = async (event) => {
    const locationId = event.features[0].properties.location_id
    const removedBy = window.prompt("Please enter your name to confirm removal:");
    if (!removedBy) {
        alert("Removal canceled.");
        return;
    }
    await sendRemoveLocation(locationId, removedBy);
    const updatedFeatures = treeLocations.features.filter(
        feature => feature.properties.location_id !== locationId
    );
    setTreeLocations({
        ...treeLocations,
        features: updatedFeatures
    });
    setMapMode(NORMAL_MODE)
  }

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

  function createPopupContent(tree, properties) {
    return `
      <div class="font-sans text-sm leading-tight">
        <h3 class="m-0 text-lg font-bold">${properties.common_name}</h3>
        <p class="text-gray-500 italic text-sm">(${tree.family} ${properties.latin_name})</p>
        <div class="my-4 pb-2" />
        <p>${properties.is_native === "True" ? "Native" : "Non-Native"}</p>
        <p>${tree.iucn_red_list_assessment}</p>
        </div>
        <div class="absolute bottom-0 right-0 mb-2 mr-2 text-xs italic text-gray-400">${properties.source}</div>
      </div>
    `;
  }

  const updateMapMode = (toMode) => {
    if (mapMode === toMode) {
      setMapMode(NORMAL_MODE);
    } else {
      setMapMode(toMode);
    }
  }

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
    document.querySelector(".mapboxgl-ctrl-top-right").appendChild(additionalMapBoxButtonsRef.current);

    map.on("load", async () => {
      setIsTreeListVisible(window.innerWidth > 768);
      geolocateControl.trigger();
      const trees = await fetchTreeInfo();
      const locations = await fetchTreeLocations();
      setTreeLocations(locations);
      setTreeInfo(trees);
      addTreeLayers(map, locations);
      map.once("idle", async () => {
        await updateVisibleTrees(map, setVisibleTrees);
      });
      map.on("mouseenter", "unclustered-point", () => {map.getCanvas().style.cursor = "pointer"});
      map.on("mouseleave", "unclustered-point", () => {map.getCanvas().style.cursor = ""});
      map.on("touchstart", () => {
        setIsTreeListVisible(false);
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && mapRef.current.getSource("trees") && treeLocations) {
      mapRef.current.getSource("trees").setData(treeLocations);
    }
  }, [treeLocations])

  useEffect(() => {
    const createTreePopup = (event) => {
      if (!event.features) return;
      const coordinates = event.features[0].geometry.coordinates.slice();
      const locationProperties = event.features[0].properties;
      const tree = treeInfo[locationProperties.tree_id]
      const popupContent = createPopupContent(tree, locationProperties);
      setCurrentPopupLocation(locationProperties.location_id);
      popupRef.current
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(mapRef.current);
    };

    const removeTreePopup = () => {
      popupRef.current.remove();
      setCurrentPopupLocation(null);
    };

    const handlePointMovement = (event) => {
      if (!event.features) return;
      const newLocation = event.features[0].properties.location_id;
      if (currentPopupLocation !== newLocation) {
        createTreePopup(event);
      }
    };

    const handlePointLeave = () => {
      setTimeout(() => {
        removeTreePopup();
      }, 50);
    };

    mapRef.current.on("mousemove", "unclustered-point", handlePointMovement);
    mapRef.current.on("mouseleave", "unclustered-point", handlePointLeave);
    mapRef.current.on("touchstart", "unclustered-point", createTreePopup);
    mapRef.current.on("touchend", "unclustered-point", removeTreePopup);

    return () => {
      mapRef.current.off("mousemove", "unclustered-point", handlePointMovement);
      mapRef.current.off("mouseleave", "unclustered-point", removeTreePopup);
      mapRef.current.off("touchstart", "unclustered-point", createTreePopup);
      mapRef.current.off("touchend", "unclustered-point", removeTreePopup);
    }
  }, [treeInfo, currentPopupLocation])

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

  useEffect(() => {
    if (mapRef.current) {
      if (mapMode === NORMAL_MODE) {
        setIsTreeListVisible(true);
      } else if (mapMode === ADD_MODE) {
        setIsTreeListVisible(false);
        mapRef.current.on("click", addTree);
        mapRef.current.on("touchend", addTree);
      } else if (mapMode === DELETE_MODE) {
        setIsTreeListVisible(false);
        mapRef.current.on("click", "unclustered-point", removeTree);
        mapRef.current.on("touchend", "unclustered-point", removeTree);
      }
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.off("click", "unclustered-point", removeTree);
        mapRef.current.off("touchend", "unclustered-point", removeTree);
        mapRef.current.off("click", addTree);
        mapRef.current.off("touchend", addTree);
      }
    };
  }, [mapMode]);

  return (
    <div>
      <div ref={mapContainerRef} className="w-screen h-screen" />
      {mapMode !== NORMAL_MODE && (
        <div className="absolute top-0 left-0 w-full h-full bg-black opacity-50 pointer-events-none"></div>
      )}
      {mapMode === ADD_MODE && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-lg text-white bg-orange-500 p-2 rounded">
          Adding Tree...
        </div>
      )}
      {mapMode === ADD_MODE && isFormVisible && (
        <div className="absolute top-0 left-0 w-full h-full z-50">
          <NewTreeForm treeList={treeInfo} coordinates={newTreeCoordinates} onSubmit={handleAddTreeSubmit} onCancel={handleAddTreeCancel} />
        </div>
      )}
      {mapMode === DELETE_MODE && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-lg text-white bg-orange-500 p-2 rounded">
          Removing Tree...
        </div>
      )}
      <div>
        <button
          className={`fixed top-4 left-4 bg-white border border-gray-300 p-2 rounded transition-opacity md:hidden duration-500 ${isTreeListVisible ? "opacity-0" : "opacity-100"} z-30`}
          onClick={() => {setIsTreeListVisible(true)}}
        >
          ☰
        </button>
        <div className={`absolute top-0 left-0 bg-white p-4 shadow-lg max-h-screen overflow-y-auto z-40 transition-transform transform duration-500 ${isTreeListVisible ? "translate-x-0": "-translate-x-[120%]" }`}>
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

      {/* Hidden buttons to be added to the map control later */}
      <div ref={additionalMapBoxButtonsRef} className="mapboxgl-ctrl mapboxgl-ctrl-group">
        <button className="mapboxgl-ctrl-zoom-in" title="Add Tree" onClick={() => updateMapMode(ADD_MODE)}>
          <span className={`mapboxgl-ctrl-icon ${mapMode === ADD_MODE ? "bg-orange-300" : ""}`} aria-hidden="true" title="Zoom in"></span>
        </button>
        <button className="mapboxgl-ctrl-zoom-out" title="Remove Tree" onClick={() => updateMapMode(DELETE_MODE)}>
          <span className={`mapboxgl-ctrl-icon ${mapMode === DELETE_MODE ? "bg-orange-300" : ""}`} aria-hidden="true" title="Zoom out"></span>
        </button>
      </div>
    </div>
  );
};

export default App;
