import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const App: React.FC = () => {
    return (
        <div style={{ height: '100vh', width: '100%' }}>
            <MapContainer
                center={[42.38245089323975, -71.09299151011383]}
                zoom={20}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
                maxZoom={22}
            >
                <TileLayer
                // https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
                // https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png
                // https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png
                // https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png
                // https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png
                // https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png
                // https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png
                // https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png
                // https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png
                // https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    maxZoom={22}
                />
                <Marker position={[42.38245089323975, -71.09299151011383]}>
                    <Popup>
                        Somerville, MA
                    </Popup>
                </Marker>
            </MapContainer>
        </div>
    );
};

export default App;
