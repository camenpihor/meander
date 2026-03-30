import { useEffect, useRef } from "react";

const useMapDoubleClick = ({ map, onDoubleClick }) => {
  const lastTapRef = useRef({});

  const isSameLocation = (point1, point2) => {
    const tapThresholdPixels = 10;
    const tapDistanceX = Math.abs(point1.x - point2.x);
    const tapDistanceY = Math.abs(point1.y - point2.y);
    return tapDistanceX <= tapThresholdPixels && tapDistanceY <= tapThresholdPixels;
  };

  useEffect(() => {
    if (!map) return;

    const handleDoubleClick = (event) => {
      event.preventDefault();
      onDoubleClick(event);
    };

    const handleDoubleTouch = (event) => {
      const currentTime = new Date().getTime();
      const currentPoint = event.point;

      const tapLength = currentTime - lastTapRef.current.time;
      if (
        tapLength < 200 &&
        tapLength > 0 &&
        isSameLocation(currentPoint, lastTapRef.current.point)
      ) {
        handleDoubleClick(event);
      } else {
        lastTapRef.current = { point: currentPoint, time: currentTime };
      }
    };

    map.on("dblclick", handleDoubleClick);
    map.on("touchstart", handleDoubleTouch);

    return () => {
      map.off("dblclick", handleDoubleClick);
      map.off("touchstart", handleDoubleTouch);
    };
  }, [map, onDoubleClick]);

  return null;
};

export default useMapDoubleClick;
