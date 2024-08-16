import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

const accessToken: string = process.env.REACT_APP_MAPBOX_TOKEN!;
mapboxgl.accessToken = accessToken;


const App: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current as HTMLElement,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [-71.09299151011383, 42.38245089323975],
      zoom: 18,
    });
    return () => {
      map.remove();
    };
  }, []);

  return (
    <div>
      <div ref={mapContainerRef} style={{width: '100%', height: '100vh',}}/>
    </div>
  );
};

export default App;
