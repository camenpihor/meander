import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const App = () => {
  const mapContainerRef = useRef(null);
  const popupRef = useRef(new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    closeOnMove: true,
    offset: [0, -15],
    anchor: "left",
    className: "text-lg font-medium"
  }));

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-71.09299151011383, 42.38245089323975],
      zoom: 18,
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
              "circle-radius": 12,
            },
          });

          map.on("mouseenter", "unclustered-point", (event) => {
            const coordinates = event.features[0].geometry.coordinates.slice();
            const commonName = event.features[0].properties.common_name;
            popupRef.current
              .setLngLat(coordinates)
              .setText(commonName)
              .addTo(map);
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
    </div>
  );
};

export default App;
