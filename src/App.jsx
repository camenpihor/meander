import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Popup from "./components/Popup";

import Map, { queryFeatures, queryPoints } from "./components/Map";
import Form from "./components/Form";
import List from "./components/List";
import {
  fetchTreeInformation,
  fetchTreeLocations,
  sendAddLocation,
  sendRemoveLocation,
  treeToFeature,
} from "./utils/api";
import useMapPointClick from "./hooks/useMapPointClick";
import useMapDoubleClick from "./hooks/useMapDoubleClick";
import useEscapeKey from "./hooks/useEscapeKey";
import useMapMovement from "./hooks/useMapMovement";
import "./App.css";
import { point, buffer, bbox } from "@turf/turf";
import useGeolocate from "./hooks/useGeolocate";

const App = () => {
  const mapboxButtonsRef = useRef(null);

  const [nearbyMeters, setNearbyMeters] = useState(3);
  const [map, setMap] = useState(null);
  const [geolocator, setGeolocator] = useState(null);
  const [tappedPopupData, setTappedPopupData] = useState(null);
  const [nearbyPopupData, setNearbyPopupData] = useState([]);
  const [treeGeojson, setTreeGeojson] = useState({});
  const [treeInformation, setTreeInformation] = useState({});
  const [clickedCoordinates, setClickedCoordinates] = useState(null);
  const [visibleTrees, setVisibleTrees] = useState({});
  const [selectedTreeName, setSelectedTreeName] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isListVisible, setIsListVisible] = useState(false);
  const [isNearbyPopupsVisible, setIsNearbyPopupsVisible] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [source, setSource] = useState("");
  const [userLocation, setUserLocation] = useState(null);

  const drawBoundingBox = (boundingBox) => {
    const [topLeft, bottomRight] = boundingBox;
    let boundingBoxDiv = document.getElementById("bounding-box");
    if (!boundingBoxDiv) {
      boundingBoxDiv = document.createElement("div");
      boundingBoxDiv.id = "bounding-box";
      document.body.appendChild(boundingBoxDiv);
    }
    boundingBoxDiv.style.position = "absolute";
    boundingBoxDiv.style.border = "1px dotted red";
    boundingBoxDiv.style.pointerEvents = "none";
    boundingBoxDiv.style.left = `${topLeft.x}px`;
    boundingBoxDiv.style.top = `${topLeft.y}px`;
    boundingBoxDiv.style.width = `${bottomRight.x - topLeft.x}px`;
    boundingBoxDiv.style.height = `${bottomRight.y - topLeft.y}px`;
    boundingBoxDiv.style.zIndex = "1000";
  };
  const createNearbyPopups = useCallback(async () => {
    if (userLocation === null) return;
    const [minLng, minLat, maxLng, maxLat] = bbox(
      buffer(point([userLocation.longitude, userLocation.latitude]), nearbyMeters, {
        units: "meters",
      })
    );
    const nearbyBox = [map.project([minLng, maxLat]), map.project([maxLng, minLat])];
    // drawBoundingBox(nearbyBox);
    const nearbyPoints = await queryPoints({ map: map, box: nearbyBox });
    const popupData = nearbyPoints.map((feature) => {
      return {
        coordinates: feature.geometry.coordinates.slice(),
        content: createPopupContent(feature.properties),
      };
    });
    setNearbyPopupData(popupData);
  }, [map, userLocation, nearbyMeters]);

  const handleNearbyPopupButton = useCallback(() => {
    if (!isNearbyPopupsVisible) {
      if (!["WAITING_ACTIVE", "ACTIVE_LOCK"].includes(geolocator._watchState)) {
        geolocator.trigger();
      }
      setIsNearbyPopupsVisible(true);
      createNearbyPopups();
    } else {
      setIsNearbyPopupsVisible(false);
      setNearbyPopupData([]);
      // document.getElementById("bounding-box").remove();
    }
  }, [map, isNearbyPopupsVisible]);

  const handleListButtonClick = useCallback(() => {
    if (!isListVisible) {
      updateVisibleTrees(map);
      setIsListVisible(true);
    } else {
      setIsListVisible(false);
    }
  }, [map, isListVisible]);

  const handleSelectTree = (treeName) => {
    if (treeName === selectedTreeName) {
      setSelectedTreeName(null);
    } else {
      setSelectedTreeName(treeName);
    }
  };

  const handleRemoveTree = useCallback(
    async (locationId) => {
      console.log("removing tree", locationId, "from", treeGeojson);
      let removedBy = window.prompt("Please enter your name to confirm removal:", source);
      if (!removedBy) {
        return;
      }
      removedBy = removedBy.trimEnd();
      setSource(removedBy);
      await sendRemoveLocation(locationId, removedBy);
      console.log("just checking", treeGeojson);
      const updatedFeatures = treeGeojson.features.filter(
        (feature) => feature.properties.location_id !== locationId
      );
      setTreeGeojson({
        ...treeGeojson,
        features: updatedFeatures,
      });
    },
    [treeGeojson]
  );

  const createPopupContent = useCallback(
    (properties) => {
      const tree = treeInformation[properties.tree_id];
      const content = (
        <div>
          <div className="py-0 pr-4">
            <button
              className="absolute top-0 right-0 hover:bg-red-300 bg-white rounded-full mt-2 mr-2 w-6 h-6 text-gray-500 hover:text-gray-800 focus:outline-none shadow-md"
              onClick={() => handleRemoveTree(properties.location_id)}
            >
              ×
            </button>
            <div className="font-sans text-sm leading-tight relative">
              <h3 className="m-0 text-lg font-bold">{tree.common_name}</h3>
              <div className="text-gray-500 italic text-xs first-letter:capitalize">
                {tree.latin_name} ({tree.family})
              </div>
              <div className="my-2 pb-2">
                <p>{properties.is_native ? "Native" : "Non-Native"}</p>
                <p>{tree.iucn_red_list_assessment}</p>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 mb-2 mr-2 text-xs italic text-gray-400">
            {properties.source}
          </div>
        </div>
      );
      const container = document.createElement("div");
      const portal = createPortal(content, container);
      createRoot(container).render(portal);
      return container;
    },
    [treeInformation]
  );

  const resetForm = () => {
    setClickedCoordinates(null);
    setIsFormVisible(false);
  };

  const resetTappedPopup = () => {
    setTappedPopupData(null);
  };

  const hideList = () => {
    setIsListVisible(false);
  };

  const onFormSubmit = useCallback(
    async (newTree) => {
      try {
        setSource(newTree.source.trimEnd());
        const addedTree = await sendAddLocation({
          tree_id: newTree.tree_id,
          latin_name: newTree.latin_name,
          common_name: newTree.common_name,
          latitude: newTree.latitude,
          longitude: newTree.longitude,
          source: newTree.source.trimEnd(),
          is_native: newTree.is_native,
        });
        console.log("adding trees to", treeGeojson);
        setTreeGeojson({
          ...treeGeojson,
          features: [...treeGeojson.features, treeToFeature(addedTree)],
        });
        console.log("cheking added tree", treeGeojson);
        resetForm();
      } catch (error) {
        console.error("Error adding new tree:", error);
      }
    },
    [treeGeojson]
  );

  const updateVisibleTrees = async (mapInstance) => {
    const features = await queryFeatures({ map: mapInstance, box: null });
    const treeCounts = features.reduce((counts, feature) => {
      const commonName = feature.properties.common_name;
      if (counts[commonName]) {
        counts[commonName]++;
      } else {
        counts[commonName] = 1;
      }
      return counts;
    }, {});
    setVisibleTrees(Object.fromEntries(Object.entries(treeCounts).sort((a, b) => b[1] - a[1])));
  };

  const handleMapLoad = () => {
    document.querySelector(".mapboxgl-ctrl-top-right").appendChild(mapboxButtonsRef.current);
  };

  const handleMapMovement = useCallback(() => {
    if (isListVisible) {
      updateVisibleTrees(map);
    }
  }, [map, isListVisible]);

  // fetch data
  useEffect(() => {
    console.debug("loading data...");
    const setData = async () => {
      const info = await fetchTreeInformation();
      setTreeInformation(info);

      const locations = await fetchTreeLocations();
      setTreeGeojson(locations);

      setIsDataLoaded(true);
      console.debug("data loaded", info, locations);
    };
    setData();
  }, []);

  // listen for map point clicks
  useMapPointClick({
    map: map,
    onClick: (event) => {
      setTappedPopupData({
        coordinates: event.features[0].geometry.coordinates.slice(),
        content: createPopupContent(event.features[0].properties),
      });
    },
  });

  // listen for map double click
  useMapDoubleClick({
    map: map,
    onDoubleClick: (event) => {
      setClickedCoordinates(event.lngLat);
      setIsFormVisible(true);
      hideList();
    },
  });

  // listen for escape key
  useEscapeKey(() => {
    resetForm();
    resetTappedPopup();
    hideList();
  });

  // listen for map movement
  useMapMovement({
    map: map,
    onMovement: handleMapMovement,
  });

  // listen for geolocate
  useGeolocate({ geolocator: geolocator, onGeolocate: (event) => setUserLocation(event.coords) });

  // listen for user location changes
  useEffect(() => {
    if (isNearbyPopupsVisible && userLocation) {
      createNearbyPopups();
    }
  }, [isNearbyPopupsVisible, userLocation]);

  return (
    <div>
      {!isDataLoaded && <div>Fetching data...</div>}
      {isDataLoaded && (
        <Map
          geojson={treeGeojson}
          selected={selectedTreeName}
          onLoad={handleMapLoad}
          setMap={setMap}
          setGeolocator={setGeolocator}
          toHighlight={selectedTreeName}
          className="w-screen h-dvh"
        />
      )}
      {tappedPopupData && (
        <Popup
          coordinates={tappedPopupData.coordinates}
          content={tappedPopupData.content}
          map={map}
          onClose={resetTappedPopup}
        />
      )}
      {nearbyPopupData.map((popup, index) => (
        <Popup
          key={index}
          coordinates={popup.coordinates}
          content={popup.content}
          map={map}
          onClose={() => {}}
        />
      ))}
      <List
        title={"Visible Trees"}
        elements={visibleTrees}
        selected={selectedTreeName}
        onSelect={handleSelectTree}
        className={`absolute top-0 left-0 h-full bg-white p-4 shadow-lg max-h-screen overflow-y-auto z-40 transition-transform transform ease-in duration-500 ${isListVisible ? "translate-x-0" : "-translate-x-[120%]"}`}
      />
      {isFormVisible && (
        <div className="absolute top-0 left-0 w-screen h-screen flex justify-center items-center overflow-y-auto">
          <div className="absolute top-0 left-0 w-full h-full bg-black opacity-50 pointer-events-none" />
          <div className="relative z-50 flex justify-center w-full max-w-lg mx-auto my-4">
            <Form
              objects={treeInformation}
              coordinates={clickedCoordinates}
              source={source}
              onSubmit={onFormSubmit}
              onCancel={resetForm}
            />
          </div>
        </div>
      )}
      {/* Hidden buttons to be added to the map control later */}
      <div className="hidden">
        <div ref={mapboxButtonsRef} className={`mapboxgl-ctrl mapboxgl-ctrl-group`}>
          <button className="relative z-30" onClick={handleListButtonClick}>
            <svg
              fill="currentColor"
              className={`h-full w-full ${isListVisible ? "text-[rgb(52,181,229)]" : "text-[rgb(51,51,51)]"}`}
              viewBox="0 0 100 150"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon points="50,20 20,70 80,70" />
              <polygon points="50,50 15,100 85,100" />
              <rect x="40" y="95" width="20" height="30" />
            </svg>
          </button>
          <button
            className="relative z-30 flex items-center justify-center"
            onClick={handleNearbyPopupButton}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`size-6 m-auto ${isNearbyPopupsVisible ? "text-[rgb(52,181,229)]" : "text-[rgb(51,51,51)]"}`}
            >
              <path d="M12 .75a8.25 8.25 0 0 0-4.135 15.39c.686.398 1.115 1.008 1.134 1.623a.75.75 0 0 0 .577.706c.352.083.71.148 1.074.195.323.041.6-.218.6-.544v-4.661a6.714 6.714 0 0 1-.937-.171.75.75 0 1 1 .374-1.453 5.261 5.261 0 0 0 2.626 0 .75.75 0 1 1 .374 1.452 6.712 6.712 0 0 1-.937.172v4.66c0 .327.277.586.6.545.364-.047.722-.112 1.074-.195a.75.75 0 0 0 .577-.706c.02-.615.448-1.225 1.134-1.623A8.25 8.25 0 0 0 12 .75Z" />
              <path
                fillRule="evenodd"
                d="M9.013 19.9a.75.75 0 0 1 .877-.597 11.319 11.319 0 0 0 4.22 0 .75.75 0 1 1 .28 1.473 12.819 12.819 0 0 1-4.78 0 .75.75 0 0 1-.597-.876ZM9.754 22.344a.75.75 0 0 1 .824-.668 13.682 13.682 0 0 0 2.844 0 .75.75 0 1 1 .156 1.492 15.156 15.156 0 0 1-3.156 0 .75.75 0 0 1-.668-.824Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
