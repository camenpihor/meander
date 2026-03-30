import { useEffect } from "react";
import { debounce } from "lodash";

const useMapZoom = ({ map, onZoom, delay = 300 }) => {
  useEffect(() => {
    if (!map) return;
    const debouncedOnZoom = debounce(onZoom, delay);
    map.on("zoomstart", debouncedOnZoom);
    return () => {
      map.off("zoomstart", debouncedOnZoom);
    };
  }, [map, onZoom, delay]);
};

export default useMapZoom;
