import { useEffect } from "react";
import mapboxgl from "mapbox-gl";
import useMapZoom from "../hooks/useMapZoom";

const markerHeight = 10;
const markerRadius = 10;
const linearOffset = 10;
const popupOffsets = {
  top: [0, markerHeight],
  "top-left": [0, 0],
  "top-right": [0, 0],
  bottom: [0, -markerHeight],
  "bottom-left": [linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
  "bottom-right": [-linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
  left: [markerRadius, (markerHeight - markerRadius) * -1],
  right: [-markerRadius, (markerHeight - markerRadius) * -1],
};

const Popup = ({ coordinates, content, map, onClose, ...popupProps }) => {
  useEffect(() => {
    const popup = new mapboxgl.Popup({
      offset: popupOffsets,
      closeButton: false,
      ...popupProps,
    })
      .setLngLat(coordinates)
      .setDOMContent(content)
      .addTo(map);

    if (onClose) {
      popup.on("close", onClose);
    }
    return () => {
      if (onClose) {
        popup.off("close", onClose);
      }
      popup.remove();
    };
  }, [coordinates, content, map, onClose, popupProps]);

  useMapZoom({
    map: map,
    onZoom: onClose,
    delay: 100,
  });

  return null;
};

export default Popup;
