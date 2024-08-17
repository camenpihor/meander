import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const App = () => {
  const mapContainerRef = useRef(null);
  const [selectedTrees, setSelectedTrees] = useState([]);
  const popupRef = useRef(new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    closeOnMove: true,
    offset: [0, -15],
    anchor: "left",
    className: "text-lg font-medium"
  }));
  const startPoint = useRef(null);
  const endPoint = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-71.09299151011383, 42.38245089323975],
      zoom: 18,
      boxZoom: false
    });

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

          const onMouseDragMove = (event) => {
            if (!startPoint.current) return;
            endPoint.current = event.point;
            const minX = Math.min(startPoint.current.x, endPoint.current.x);
            const maxX = Math.max(startPoint.current.x, endPoint.current.x);
            const minY = Math.min(startPoint.current.y, endPoint.current.y);
            const maxY = Math.max(startPoint.current.y, endPoint.current.y);

            box.current.style.left = minX + "px";
            box.current.style.top = minY + "px";
            box.current.style.width = maxX - minX + "px";
            box.current.style.height = maxY - minY + "px";
          };
          const onMouseDragUp = (event) => {
            const minX = Math.min(startPoint.current.x, endPoint.current.x);
            const maxX = Math.max(startPoint.current.x, endPoint.current.x);
            const minY = Math.min(startPoint.current.y, endPoint.current.y);
            const maxY = Math.max(startPoint.current.y, endPoint.current.y);
            const boundingBox = [
              [minX, minY],
              [maxX, maxY],
            ];

            const trees = map.queryRenderedFeatures(boundingBox, {
              layers: ["unclustered-point"],
            });

            const groupedTrees = trees.reduce((groups, feature) => {
              const name = feature.properties.common_name;
              if (!groups[name]) { groups[name] = [] }
              groups[name].push(feature);
              return groups;
            }, {});

            setSelectedTrees(groupedTrees);
            map.dragPan.enable();
            document.body.removeChild(box.current);
            map.off("mousemove", onMouseDragMove);
          };
          map.on("mousedown", (event) => {
            if (!event.originalEvent.shiftKey) return;

            map.dragPan.disable();
            startPoint.current = event.point;
            box.current = document.createElement("div");
            box.current.style.position = "absolute";
            box.current.style.border = "2px dashed #8f8f8f";
            box.current.style.backgroundColor = "rgba(140, 140, 140, 0.1)";
            box.current.style.pointerEvents = "none";
            document.body.appendChild(box.current);

            map.on("mousemove", onMouseDragMove);
            map.once("mouseup", onMouseDragUp);
          });

          map.on("touchstart", "unclustered-point", (event) => {
            const coordinates = event.features[0].geometry.coordinates.slice();
            const commonName = event.features[0].properties.common_name;
            setTimeout(() => {
              popupRef.current
              .setLngLat(coordinates)
              .setText(commonName)
              .addTo(map);
            }, 100);
          });
          map.on("mouseenter", "unclustered-point", (event) => {
            const coordinates = event.features[0].geometry.coordinates.slice();
            const commonName = event.features[0].properties.common_name;
            popupRef.current
              .setLngLat(coordinates)
              .setText(commonName)
              .addTo(map);
          });
          map.on("touchend", "unclustered-point", () => {
            popupRef.current.remove();
          });
          map.on("mouseleave", "unclustered-point", () => {
            popupRef.current.remove();
          });
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
          <h3 className="text-lg font-bold mb-2">Selected Trees</h3>
          <ul>
            {Object.keys(selectedTrees).map((name, index) => (
              <li key={index} className="text-sm text-gray-700">
                <strong>{name}</strong> ({selectedTrees[name].length} trees)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default App;
