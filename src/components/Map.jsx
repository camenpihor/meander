import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

export const sourceName = "source";
export const layerNames = {
  points: "point",
  clusters: "clusters",
  highlightedPoints: "highlighted-point",
  highlightedClusters: "highlighted-cluster",
};
const layers = [
  {
    id: layerNames.clusters,
    type: "circle",
    source: sourceName,
    filter: ["has", "point_count"],
    paint: { "circle-color": "#51bbd6", "circle-radius": 20 },
  },
  {
    id: layerNames.highlightedClusters,
    type: "circle",
    source: sourceName,
    filter: ["in", "cluster_id", ""],
    paint: { "circle-color": "#FFD580", "circle-radius": 20 },
  },
  {
    id: "cluster-count",
    type: "symbol",
    source: sourceName,
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12,
    },
  },
  {
    id: layerNames.points,
    type: "circle",
    source: sourceName,
    filter: ["!", ["has", "point_count"]],
    paint: { "circle-color": "#34B5E5", "circle-radius": 10 },
  },
  {
    id: layerNames.highlightedPoints,
    type: "circle",
    source: sourceName,
    filter: ["in", "common_name", ""],
    paint: { "circle-color": "#FFD580", "circle-radius": 10 },
  },
];

const dedupeBy = ({ objects, by }) => {
  const seen = new Set();
  return objects.filter(
    (element) => element[by] && !seen.has(element[by]) && seen.add(element[by])
  );
};

export const queryClusters = async ({ map, box }) => {
  const clusters = map.queryRenderedFeatures(box, { layers: [layerNames.clusters] });
  if (clusters.length === 0) return [];

  const getFeatures = (clusterId) =>
    new Promise((resolve, reject) => {
      map.getSource(sourceName).getClusterLeaves(clusterId, Infinity, 0, (error, leaves) => {
        if (error) reject(error);
        else resolve(leaves || []);
      });
    });

  const clusterFeatures = Object.fromEntries(
    await Promise.all(
      clusters.map(async (cluster) => {
        const leaves = await getFeatures(cluster.properties.cluster_id);
        return [cluster.properties.cluster_id, leaves];
      })
    )
  );
  return clusterFeatures;
};

export const queryPoints = async ({ map, box }) => {
  const points = map.queryRenderedFeatures(box, { layers: [layerNames.points] });
  // the points layer contains duplicates duplicates https://github.com/mapbox/mapbox-gl-js/issues/3099
  return dedupeBy({ objects: points, by: "id" });
};

export const queryFeatures = async ({ map, box }) => {
  if (!map) return;
  const visiblePoints = await queryPoints({ map: map, box: box });
  const visibleClusters = Object.values(await queryClusters({ map: map, box: box })).flat();
  return visiblePoints.concat(visibleClusters);
};

const Map = ({ geojson, onLoad, setMap, setGeolocator, toHighlight, className }) => {
  const containerRef = useRef(null);
  const ref = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const filterClusters = async (commonName) => {
    const clusters = await queryClusters({ map: ref.current });
    const filtered = Object.keys(clusters).filter((clusterId) =>
      clusters[clusterId].some((feature) => feature.properties.common_name === commonName)
    );
    return filtered.map(Number);
  };

  const resetHighlights = () => {
    if (ref.current) {
      ref.current.setFilter(layerNames.highlightedPoints, ["in", "common_name", ""]);
      ref.current.setFilter(layerNames.highlightedClusters, ["in", "cluster_id", ""]);
    }
  };

  // initialize the map
  useEffect(() => {
    console.debug("initializing map...");
    const map = new mapboxgl.Map({
      container: containerRef.current,
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
    ref.current = map;

    map.on("load", () => {
      const geolocateControl = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: false,
        showUserHeading: true,
        fitBoundsOptions: { linear: true, maxZoom: 18 },
      });
      setGeolocator(geolocateControl);
      map.addControl(geolocateControl, "top-right");
      map.addSource(sourceName, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
        cluster: true,
        clusterMaxZoom: 16,
        clusterRadius: 50,
      });
      layers.forEach((layer) => map.addLayer(layer));
      map.on("mouseenter", layerNames.points, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerNames.points, () => {
        map.getCanvas().style.cursor = "";
      });
      setIsLoaded(true);
      setMap(map);
      onLoad();
      console.debug("map loaded");
    });
    return () => {
      console.debug("unloading map...");
      setIsLoaded(false);
      map.remove();
    };
  }, []);

  // update source data
  useEffect(() => {
    if (!isLoaded) return;
    console.debug("updating source data...", geojson);
    ref.current.getSource(sourceName).setData(geojson);
  }, [isLoaded, geojson]);

  // update highlighted
  useEffect(() => {
    if (!isLoaded) return;

    const updateHighlights = () => {
      filterClusters(toHighlight).then((clusterIds) => {
        ref.current.setFilter(layerNames.highlightedClusters, ["in", "cluster_id", ...clusterIds]);
        ref.current.setFilter(layerNames.highlightedPoints, [
          "in",
          "common_name",
          toHighlight ?? "",
        ]);
      });
    };

    if (!toHighlight) {
      resetHighlights();
    } else {
      updateHighlights();
      ref.current.on("moveend", updateHighlights);
    }
    return () => {
      ref.current.off("moveend", updateHighlights);
    };
  }, [isLoaded, toHighlight]);

  return <div ref={containerRef} className={className} />;
};

export default Map;
