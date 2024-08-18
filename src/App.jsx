import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";
import { debounce } from "lodash";
import "./App.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const NORMAL_MODE = 0;
const ADD_MODE = 1;
const DELETE_MODE = 2;

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
  const [currentPopupLocation, setCurrentPopupLocation] = useState([]);
  const additionalMapBoxButtonsRef = useRef(null);
  const [treeLocations, setTreeLocations] = useState([]);
  const [treeInfo, setTreeInfo] = useState([]);
  const [visibleTrees, setVisibleTrees] = useState([]);
  const [highlightedTree, setHighlightedTree] = useState(null);
  const [isTreeListVisible, setIsTreeListVisible] = useState(false);
  const [isHamburgerVisible, setIsHamburgerVisible] = useState(true);
  const [isHamburgerFadingOut, setIsHamburgerFadingOut] = useState(false);
  const [mapMode, setMapMode] = useState(0);

  const addTree = (event) => {
    console.log("adding tree", event)
    setMapMode(NORMAL_MODE)
  }

  const removeTree = (event) => {
    console.log("removing tree",  event.features[0].properties);
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

  const updateMapMode = (toMode) => {
    if (mapMode === toMode) {
      console.log("unsetting mode");
      setMapMode(NORMAL_MODE);
    } else {
      console.log("setting mode", toMode)
      setMapMode(toMode);
    }
  }

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
    document.querySelector('.mapboxgl-ctrl-top-right').appendChild(additionalMapBoxButtonsRef.current);

    map.on("load", () => {
      geolocateControl.trigger();
      addTreeLayers(map, treeLocations)
      map.once("idle", async () => {
        await updateVisibleTrees(map, setVisibleTrees);
      });
      mapRef.current.on("mouseenter", "unclustered-point", () => {mapRef.current.getCanvas().style.cursor = "pointer"});
      mapRef.current.on("mouseleave", "unclustered-point", () => {mapRef.current.getCanvas().style.cursor = ""});
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
        setCurrentPopupLocation(locationProperties.location_id);
        popupRef.current
          .setLngLat(coordinates)
          .setHTML(popupContent)
          .addTo(mapRef.current);
      }, 100);
    };

    const removeTreePopup = () => {
      setCurrentPopupLocation(null);
      popupRef.current.remove();
    };

    const handlePointMovement = (event) => {
      const newLocation = event.features[0].properties.location_id;
      if (currentPopupLocation !== newLocation) {
        createTreePopup(event);
      }
    };

    mapRef.current.on("mousemove", "unclustered-point", handlePointMovement);
    mapRef.current.on("mouseleave", "unclustered-point", removeTreePopup);
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
      {mapMode === DELETE_MODE && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-lg text-white bg-orange-500 p-2 rounded">
          Removing Tree...
        </div>
      )}
      {isHamburgerVisible && (
        <button
          className={`fixed top-4 left-4 bg-white border border-gray-300 p-2 rounded md:hidden z-50 transition-opacity duration-500 ${isHamburgerFadingOut ? 'opacity-0' : 'opacity-100'}`}
          onClick={toggleTreeList}
        >
          ☰
        </button>
      )}

      <div
        className={`absolute top-0 left-0 bg-white p-4 shadow-lg max-h-screen overflow-y-auto z-40 transition-transform transform duration-500 ${isTreeListVisible ? 'translate-x-0' : '-translate-x-[120%]'}`}
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
