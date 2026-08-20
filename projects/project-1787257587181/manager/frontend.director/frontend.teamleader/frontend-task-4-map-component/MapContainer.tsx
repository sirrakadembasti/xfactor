'use client';

import React, { useEffect } from 'react';
import {
  MapContainer as LeafletMapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet varsayılan marker ikon yolu düzeltmesi
const fixLeafletDefaultIcon = () => {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
};

export interface MapMarker {
  id: string | number;
  position: [number, number];
  title?: string;
  description?: string;
  icon?: L.Icon | L.DivIcon;
  onClick?: () => void;
}

export interface MapContainerProps {
  center?: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  markers?: MapMarker[];
  tileLayerUrl?: string;
  attribution?: string;
  className?: string;
  style?: React.CSSProperties;
  scrollWheelZoom?: boolean;
  onMapClick?: (latlng: { lat: number; lng: number }) => void;
  onMapReady?: (map: L.Map) => void;
  children?: React.ReactNode;
}

function MapEventsHandler({
  onMapClick,
  center,
  zoom
}: {
  onMapClick?: (latlng: { lat: number; lng: number }) => void;
  center?: [number, number];
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, zoom ?? map.getZoom());
    }
  }, [center, zoom, map]);

  useMapEvents({
    click: (e) => {
      if (onMapClick) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });

  return null;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  center = [39.925533, 32.866287], // Türkiye / Ankara varsayılan merkezi
  zoom = 6,
  minZoom = 3,
  maxZoom = 18,
  markers = [],
  tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  className = 'h-full w-full rounded-lg',
  style,
  scrollWheelZoom = true,
  onMapClick,
  children
}) => {
  useEffect(() => {
    fixLeafletDefaultIcon();
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ minHeight: '300px', ...style }}>
      <LeafletMapContainer
        center={center}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        scrollWheelZoom={scrollWheelZoom}
        className="h-full w-full"
      >
        <TileLayer url={tileLayerUrl} attribution={attribution} />
        <MapEventsHandler onMapClick={onMapClick} center={center} zoom={zoom} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={marker.icon}
            eventHandlers={{
              click: () => marker.onClick && marker.onClick()
            }}
          >
            {(marker.title || marker.description) && (
              <Popup>
                <div className="text-sm">
                  {marker.title && <h4 className="font-bold text-gray-900">{marker.title}</h4>}
                  {marker.description && <p className="text-gray-600 mt-1">{marker.description}</p>}
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        {children}
      </LeafletMapContainer>
    </div>
  );
};

export default MapContainer;
