import { useEffect } from "react";
const useMapLoaded = ({ map, onLoad }) => {
  useEffect(() => {
    if (!map) return;

    if (map.isStyleLoaded()) {
      onLoad();
      return;
    }
    map.on("load", onLoad);

    return () => {
      map.off("load", onLoad);
    };
  }, [map, onLoad]);
};

export default useMapLoaded;
