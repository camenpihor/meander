import { useEffect } from "react";
import { layerNames } from "../components/Map";

const useMapPointClick = ({ map, onClick }) => {
  useEffect(() => {
    if (!map) return;
    const handlePointClick = (event) => {
      event.preventDefault();
      onClick(event);
    };

    map.on("click", layerNames.points, handlePointClick);
    map.on("touchstart", layerNames.points, handlePointClick);

    return () => {
      map.off("click", layerNames.points, handlePointClick);
      map.off("touchstart", layerNames.points, handlePointClick);
    };
  }, [map, onClick]);
};

export default useMapPointClick;
