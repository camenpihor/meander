import { useEffect } from "react";
import { debounce } from "lodash";

const useGeolocate = ({ geolocator, onGeolocate, delay = 300 }) => {
  useEffect(() => {
    if (!geolocator) return;
    const debouncedOnGeolocate = debounce(onGeolocate, delay);
    geolocator.on("geolocate", debouncedOnGeolocate);
    return () => {
      geolocator.off("geolocate", debouncedOnGeolocate);
    };
  }, [geolocator, onGeolocate, delay]);
};

export default useGeolocate;
