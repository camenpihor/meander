import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { debounce } from "lodash";
import "./App.css";
import NewTreeForm from "./components/TreeForm";
import {
  fetchTreeInfo,
  fetchTreeLocations,
  sendAddLocation,
  sendRemoveLocation,
  treeToFeature,
} from "./utils/api";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

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

const App = () => {
  const sourceNameRef = useRef("");
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const tappedPopupRef = useRef(
    new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      closeOnMove: false,
      offset: [0, -15],
      className: "text-medium",
    })
  );
  const treeInfo = useRef("");
  const mapboxButtonsRef = useRef(null);
  const lastTapRef = useRef({ point: { x: 0, y: 0 }, time: 0 });

  const [treeLocations, setTreeLocations] = useState([]);
  const [currentPosition, setCurrentPosition] = useState([]);
  const [visibleTrees, setVisibleTrees] = useState([]);
  const [highlightedTree, setHighlightedTree] = useState(null);
  const [isTreeListVisible, setIsTreeListVisible] = useState(false);
  const [isSurroundingPopups, setIsSurroundingPopups] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [newTreeCoordinates, setNewTreeCoordinates] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [layersLoaded, setLayersLoaded] = useState(false);

  const handleAddTreeCancel = () => {
    setNewTreeCoordinates([]);
    setIsFormVisible(false);
  };

  const handleTreeListClick = (treeName) => {
    if (treeName === highlightedTree) {
      treeName = null;
    }
    setHighlightedTree(treeName);
  };

  const createPopupContent = (tree, locationProperties) => {
    return `
      <div class="p-0">
        <div class="font-sans text-sm leading-tight relative">
          <h3 class="m-0 text-lg font-bold">${tree.common_name}</h3>
          <p class="text-gray-500 italic text-sm">(${tree.family} ${tree.latin_name})</p>
          <div class="my-2 pb-2">
            <p>${locationProperties.is_native ? "Native" : "Non-Native"}</p>
            <p>${tree.iucn_red_list_assessment}</p>
          </div>
        </div>
        <div class="absolute bottom-0 right-0 mb-2 mr-2 text-xs italic text-gray-400">
          ${locationProperties.source}
        </div>
      </div>
    `;
  };

  const handleRemoveTree = useCallback(
    async (locationId) => {
      let removedBy = window.prompt(
        "Please enter your name to confirm removal:",
        sourceNameRef.current
      );
      if (!removedBy) {
        return;
      }
      removedBy = removedBy.trimEnd();
      sourceNameRef.current = removedBy;
      await sendRemoveLocation(locationId, removedBy);
      const updatedFeatures = treeLocations.features.filter(
        (feature) => feature.properties.location_id !== locationId
      );
      setTreeLocations({
        ...treeLocations,
        features: updatedFeatures,
      });
    },
    [treeLocations]
  );

  const handleAddTree = useCallback(
    async (newTree) => {
      try {
        sourceNameRef.current = newTree.source;
        const addedTree = await sendAddLocation({
          tree_id: newTree.tree_id,
          latin_name: newTree.latin_name,
          common_name: newTree.common_name,
          latitude: newTree.latitude,
          longitude: newTree.longitude,
          source: newTree.source.trimEnd(),
          is_native: newTree.is_native,
        });
        setTreeLocations({
          ...treeLocations,
          features: [...treeLocations.features, treeToFeature(addedTree)],
        });
        setIsFormVisible(false);
      } catch (error) {
        console.error("Error adding new tree:", error);
      }
    },
    [treeLocations]
  );

  const createTreePopup = useCallback(
    ({ tree, locationProperties, coordinates, popup }) => {
      const popupContent = createPopupContent(tree, locationProperties);
      popup.setLngLat(coordinates).setHTML(popupContent).addTo(mapRef.current);
      popup._closeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        handleRemoveTree(locationProperties.location_id);
      });
      popup._closeButton.className =
        "absolute top-0 right-0 mt-2 mr-2 text-gray-500 hover:text-gray-800 focus:outline-none bg-white rounded-full shadow-md w-6 h-6 flex items-center justify-center";
      return () => {
        const closeButton = popup._closeButton;
        if (closeButton) {
          closeButton.removeEventListener("click");
        }
      };
    },
    [handleRemoveTree]
  );

  useEffect(() => {
    // load map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/camenpihor/cm0730bny011e01qqciye70j8",
      center: [-71.09299151011383, 42.38245089323975],
      zoom: 18,
      boxZoom: false,
      doubleClickZoom: false,
      performanceMetricsCollection: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      console.debug("map loaded");
      setMapLoaded(true);

      const geolocateControl = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: false,
        showUserHeading: true,
        fitBoundsOptions: { linear: true, maxZoom: 18 },
      });
      geolocateControl.on("geolocate", (position) => {
        const { longitude, latitude } = position.coords;
        setCurrentPosition([longitude, latitude]);
      });
      map.addControl(geolocateControl, "top-right");
      document.querySelector(".mapboxgl-ctrl-top-right").appendChild(mapboxButtonsRef.current);
    });
    return () => {
      map.remove();
      setMapLoaded(false);
    };
  }, []);

  useEffect(() => {
    // load data
    const fetchData = async () => {
      const locations = await fetchTreeLocations();
      treeInfo.current = await fetchTreeInfo();
      setTreeLocations(locations);
      setDataLoaded(true);
    };
    fetchData();
    console.debug("data loaded");
    return () => {
      setDataLoaded(false);
    };
  }, []);

  useEffect(() => {
    // load layers
    if (mapLoaded && dataLoaded) {
      mapRef.current.addSource("trees", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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
          paint: { "circle-color": "#34B5E5", "circle-radius": 10 },
        },
        {
          id: "highlighted-point",
          type: "circle",
          source: "trees",
          filter: ["in", "common_name", ""],
          paint: { "circle-color": "#FFD580", "circle-radius": 10 },
        },
      ];
      layers.forEach((layer) => mapRef.current.addLayer(layer));
      console.debug("layers loaded");
      setLayersLoaded(true);
    }
  }, [mapLoaded, dataLoaded]);

  useEffect(() => {
    // map event handlers
    const resetMap = () => {
      tappedPopupRef.current.remove();
      setNewTreeCoordinates([]);
      setIsFormVisible(false);
    };

    const clickedOnFeature = (point) => {
      const features = mapRef.current.queryRenderedFeatures(point, {
        layers: ["unclustered-point", "clusters"],
      });
      return features.length > 0;
    };

    const isSameLocation = (point1, point2) => {
      const tapThresholdPixels = 10;
      const tapDistanceX = Math.abs(point1.x - point2.x);
      const tapDistanceY = Math.abs(point1.y - point2.y);
      return tapDistanceX <= tapThresholdPixels && tapDistanceY <= tapThresholdPixels;
    };

    const handleDoubleTouch = (event) => {
      event.preventDefault();
      setNewTreeCoordinates(event.lngLat);
      setIsFormVisible(true);
    };

    const handleMapClick = (event) => {
      if (!clickedOnFeature(event.point)) {
        resetMap();
      }
    };

    const handleMapTouch = (event) => {
      const currentTime = new Date().getTime();
      const currentPoint = event.point;
      if (!clickedOnFeature(currentPoint)) {
        resetMap();

        const tapLength = currentTime - lastTapRef.current.time;
        const isDoubleTapTime = tapLength < 200 && tapLength > 0;
        const isDoubleTapSpace = isSameLocation(currentPoint, lastTapRef.current.point);
        if (isDoubleTapTime && isDoubleTapSpace) {
          handleDoubleTouch(event);
        } else {
          lastTapRef.current = { point: currentPoint, time: currentTime };
        }
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        resetMap();
      }
    };

    const handlePointClick = (event) => {
      if (event.features) {
        const feature = event.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const locationProperties = feature.properties;
        const tree = treeInfo.current[locationProperties.tree_id];
        createTreePopup({
          tree: tree,
          locationProperties: locationProperties,
          coordinates: coordinates,
          popup: tappedPopupRef.current,
        });
      }
    };

    if (mapRef.current && layersLoaded) {
      window.addEventListener("keydown", handleEscapeKey);
      mapRef.current.on("mouseenter", "unclustered-point", () => {
        mapRef.current.getCanvas().style.cursor = "pointer";
      });
      mapRef.current.on("mouseleave", "unclustered-point", () => {
        mapRef.current.getCanvas().style.cursor = "";
      });
      mapRef.current.on("mousedown", handleMapClick);
      mapRef.current.on("zoomstart", resetMap);
      mapRef.current.on("touchstart", handleMapTouch);
      mapRef.current.on("dblclick", handleDoubleTouch);
      mapRef.current.on("mousedown", "unclustered-point", handlePointClick);
      mapRef.current.on("touchstart", "unclustered-point", handlePointClick);
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.off("mouseenter", "unclustered-point", () => {
          mapRef.current.getCanvas().style.cursor = "pointer";
        });
        mapRef.current.off("mouseleave", "unclustered-point", () => {
          mapRef.current.getCanvas().style.cursor = "";
        });
        mapRef.current.off("mousedown", handleMapTouch);
        mapRef.current.off("touchstart", handleMapTouch);
        mapRef.current.off("touchstart", handleMapTouch);
        mapRef.current.off("dblclick", handleDoubleTouch);
        mapRef.current.off("mousedown", "unclustered-point", handlePointClick);
        mapRef.current.off("touchstart", "unclustered-point", handlePointClick);
      }
    };
  }, [layersLoaded, createTreePopup]);

  useEffect(() => {
    // data-change listener
    if (layersLoaded) {
      console.debug("updating map source data...");
      mapRef.current.getSource("trees").setData(treeLocations);
    }
  }, [layersLoaded, treeLocations]);

  useEffect(() => {
    // visible trees event handlers
    const fetchClusterFeatures = async (clusters) => {
      const clusterFeatures = [];
      for (const cluster of clusters) {
        const features = await getClusterFeatures(mapRef.current, cluster.properties.cluster_id);
        clusterFeatures.push(...features);
      }
      return clusterFeatures;
    };

    const deduplicateFeatures = (features) => {
      return [...new Map(features.map((feature) => [feature.id, feature])).values()];
    };

    const updateVisibleTrees = async () => {
      const visibleFeaturesPoints = deduplicateFeatures(
        // contains duplicates https://github.com/mapbox/mapbox-gl-js/issues/3099
        mapRef.current.queryRenderedFeatures({ layers: ["unclustered-point"] })
      );
      const visibleFeaturesClusters = await fetchClusterFeatures(
        mapRef.current.queryRenderedFeatures({ layers: ["clusters"] })
      );
      const visibleTreeCounts = visibleFeaturesPoints
        .concat(visibleFeaturesClusters)
        .reduce((counts, feature) => {
          const { common_name } = feature.properties;
          if (!counts[common_name]) counts[common_name] = 0;
          counts[common_name] += 1;
          return counts;
        }, {});
      setVisibleTrees(Object.entries(visibleTreeCounts).sort((a, b) => b[1].length - a[1].length));
    };

    const debouncedUpdateVisibleTrees = debounce(() => updateVisibleTrees(), 300);
    if (mapRef.current && isTreeListVisible) {
      updateVisibleTrees();
      mapRef.current.on("moveend", debouncedUpdateVisibleTrees);
      mapRef.current.on("zoomend", debouncedUpdateVisibleTrees);
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", debouncedUpdateVisibleTrees);
        mapRef.current.off("zoomend", debouncedUpdateVisibleTrees);
      }
    };
  }, [isTreeListVisible]);

  useEffect(() => {
    // respond to highlighted-tree change
    const highlightTree = async (treeName) => {
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
      mapRef.current.setFilter("highlighted-cluster", [
        "in",
        "cluster_id",
        ...clusterIdsToHighlight,
      ]);
    };
    const debouncedHighlightTree = debounce(() => highlightTree(highlightedTree), 300);
    if (mapRef.current && highlightedTree) {
      highlightTree(highlightedTree);
      mapRef.current.on("moveend", debouncedHighlightTree);
      mapRef.current.on("zoomend", debouncedHighlightTree);
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", debouncedHighlightTree);
        mapRef.current.off("zoomend", debouncedHighlightTree);
        mapRef.current.setFilter("highlighted-point", ["in", "common_name", ""]);
        mapRef.current.setFilter("highlighted-cluster", ["in", "cluster_id", ""]);
      }
    };
  }, [highlightedTree]);

  return (
    <div>
      <div ref={mapContainerRef} className="w-screen h-dvh" />
      <div>
        {isFormVisible && (
          <div>
            <div className="absolute top-0 left-0 w-full h-full bg-black opacity-50 pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-full z-50">
              <NewTreeForm
                treeList={treeInfo.current}
                coordinates={newTreeCoordinates}
                onSubmit={handleAddTree}
                onCancel={handleAddTreeCancel}
                defaultSource={sourceNameRef.current}
              />
            </div>
          </div>
        )}
      </div>
      <div
        className={`absolute top-0 left-0 bg-white p-4 shadow-lg max-h-screen overflow-y-auto z-40 transition-transform transform duration-500 ${isTreeListVisible ? "translate-x-0" : "-translate-x-[120%]"}`}
      >
        <h3 className="text-lg font-bold mb-2">Visible Trees</h3>
        <ul>
          {visibleTrees.map(([name, numTrees], index) => (
            <li
              key={index}
              className={`text-sm text-gray-700 cursor-pointer hover:bg-blue-200 ${highlightedTree === name ? "bg-orange-300" : ""}`}
              onClick={() => handleTreeListClick(name)}
            >
              <strong>{name}</strong> ({numTrees} trees)
            </li>
          ))}
        </ul>
      </div>

      {/* Hidden buttons to be added to the map control later */}
      <div ref={mapboxButtonsRef} className={`mapboxgl-ctrl mapboxgl-ctrl-group`}>
        <button className="relative z-30">
          <svg
            fill="currentColor"
            className={`h-full w-full ${isTreeListVisible ? "text-[rgb(52,181,229)]" : "text-[rgb(51,51,51)]"}`}
            viewBox="0 0 100 150"
            xmlns="http://www.w3.org/2000/svg"
            onClick={() => setIsTreeListVisible(!isTreeListVisible)}
          >
            <polygon points="50,20 20,70 80,70" />
            <polygon points="50,50 15,100 85,100" />
            <rect x="40" y="95" width="20" height="30" />
          </svg>
        </button>
        <button className="relative z-30">
          <svg
            fill="currentColor"
            className={`h-full w-full ${isSurroundingPopups ? "text-[rgb(52,181,229)]" : "text-[rgb(51,51,51)]"}`}
            viewBox="0 0 100 150"
            xmlns="http://www.w3.org/2000/svg"
            onClick={() => setIsSurroundingPopups(!isSurroundingPopups)}
          >
            <polygon points="50,20 20,70 80,70" />
            <polygon points="50,50 15,100 85,100" />
            <rect x="40" y="95" width="20" height="30" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default App;
