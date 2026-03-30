import { useEffect } from "react";
import { debounce } from "lodash";

const useMapMovement = ({ map, onMovement, delay = 300 }) => {
  useEffect(() => {
    if (!map) return;
    const debouncedOnMovement = debounce(onMovement, delay);
    map.on("moveend", debouncedOnMovement);
    return () => {
      map.off("moveend", debouncedOnMovement);
    };
  }, [map, onMovement, delay]);
};

export default useMapMovement;
