'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { MapContainerProps } from './MapContainer';

const MapLoadingSkeleton: React.FC<{ className?: string }> = ({ className = 'h-full w-full' }) => (
  <div className={`flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg border border-gray-200 dark:border-gray-700 min-h-[300px] ${className}`}>
    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
    <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Harita yükleniyor...</span>
  </div>
);

const LeafletMap = dynamic(() => import('./MapContainer'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});

export interface DynamicMapProps extends MapContainerProps {}

export const DynamicMap: React.FC<DynamicMapProps> = (props) => {
  return <LeafletMap {...props} />;
};

export default DynamicMap;
