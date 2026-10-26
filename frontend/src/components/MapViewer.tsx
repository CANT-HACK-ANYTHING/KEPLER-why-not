'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ChargingNode, NodeStatus, Theme } from '@/types/node';
import { Navigation, Hexagon, Layers } from 'lucide-react';
import { getHexagonPolygon, MACRO_HEX_SECTORS, getDistanceKm } from '@/lib/hexSpatial';

interface MapViewerProps {
  nodes: ChargingNode[];
  selectedNode: ChargingNode | null;
  onSelectNode: (node: ChargingNode) => void;
  theme?: Theme;
  onLocationDetected?: (coords: [number, number]) => void;
}

// Custom SVG-based Leaflet DivIcons for clean status pins
const createCustomPin = (status: NodeStatus, isSelected: boolean) => {
  const colorMap = {
    available: {
      bg: '#10b981', // emerald-500
      glow: 'rgba(16, 185, 129, 0.45)',
      ring: '#059669',
    },
    busy: {
      bg: '#f59e0b', // amber-500
      glow: 'rgba(245, 158, 11, 0.45)',
      ring: '#d97706',
    },
    offline_fault: {
      bg: '#ef4444', // red-500
      glow: 'rgba(239, 68, 68, 0.45)',
      ring: '#dc2626',
    },
  };

  const { bg, glow, ring } = colorMap[status] || colorMap.available;
  const size = isSelected ? 44 : 36;
  const strokeWidth = isSelected ? 3 : 2;

  const html = `
    <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      ${status === 'available' ? `<div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${glow}; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
      <div style="
        position: relative;
        width: ${size - 8}px;
        height: ${size - 8}px;
        border-radius: 50%;
        background: #171717;
        border: ${strokeWidth}px solid ${isSelected ? '#ffffff' : ring};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px ${glow};
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${bg}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-ev-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Custom SVG-based Leaflet DivIcon for User Live Location
const createUserLocationPin = () => {
  return L.divIcon({
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(37, 99, 235, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: absolute; width: 30px; height: 30px; border-radius: 50%; background: rgba(37, 99, 235, 0.25); border: 2px solid rgba(255, 255, 255, 0.9);"></div>
        <div style="position: relative; width: 16px; height: 16px; border-radius: 50%; background: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(37, 99, 235, 0.9);"></div>
      </div>
    `,
    className: 'user-loc-marker',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
};

// Component to handle smooth fly-to on node selection or user location
function MapController({ 
  selectedNode, 
  userLocation 
}: { 
  selectedNode: ChargingNode | null; 
  userLocation: [number, number] | null;
}) {
  const map = useMap();
  const [hasAutocentered, setHasAutocentered] = useState(false);

  // Auto-center on user's live location on first detection
  useEffect(() => {
    if (userLocation && !hasAutocentered && !selectedNode) {
      map.flyTo(userLocation, 14, { duration: 1.5 });
      setHasAutocentered(true);
    }
  }, [userLocation, hasAutocentered, selectedNode, map]);

  // Fly to selected node when user taps a pin
  useEffect(() => {
    if (selectedNode) {
      map.flyTo([selectedNode.latitude, selectedNode.longitude], 14, {
        duration: 1.2,
      });
    }
  }, [selectedNode, map]);

  return null;
}

// Floating Locate Me Button directly on the map
function RecenterButton({ userLocation, onManualLocate }: { userLocation: [number, number] | null; onManualLocate: () => void }) {
  const map = useMap();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userLocation) {
      map.flyTo(userLocation, 15, { duration: 1.2 });
    } else {
      onManualLocate();
    }
  };

  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '90px', marginRight: '16px', zIndex: 850 }}>
      <button
        type="button"
        onClick={handleClick}
        title="Recenter on My Live Location"
        aria-label="Recenter on My Live Location"
        className="w-12 h-12 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-300 dark:border-neutral-700 shadow-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 hover:scale-105 active:scale-95 transition-all pointer-events-auto"
      >
        <Navigation className="w-5 h-5 fill-blue-500/20" />
      </button>
    </div>
  );
}

export default function MapViewer({ nodes, selectedNode, onSelectNode, theme = 'light', onLocationDetected }: MapViewerProps) {
  // Center near Vellore, Tamil Nadu
  const defaultCenter: [number, number] = [12.9165, 79.1325];
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [hexTierMode, setHexTierMode] = useState<'all' | 'micro' | 'off'>('all');
  const isDark = theme === 'dark';

  // Standard full-detail OpenStreetMap layout in all modes (100% free, no API key)
  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const onPos = (pos: GeolocationPosition) => {
    const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
    setUserLocation(coords);
    onLocationDetected?.(coords);
  };

  const requestLocation = () => {
    try {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        alert('Geolocation is not supported or permitted on this network connection.');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        onPos,
        (err) => {
          console.warn('Coarse location attempt failed:', err.message);
          try {
            navigator.geolocation.getCurrentPosition(
              onPos,
              () => {
                alert('Location permission was granted, but your operating system could not pinpoint coordinates. Note: Browsers block geolocation over insecure HTTP connections on other laptops.');
              },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          } catch {}
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    } catch (e) {
      console.warn('Manual location query blocked:', e);
    }
  };

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) return;

      let watchId: number | null = null;

      // Safe immediate check
      try {
        navigator.geolocation.getCurrentPosition(
          onPos,
          () => {},
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      } catch (err) {
        console.warn('Initial geolocation attempt skipped (HTTP or policy restriction):', err);
      }

      // Safe continuous watch
      try {
        watchId = navigator.geolocation.watchPosition(
          onPos,
          (err) => {
            console.warn('Live watch position update failed/delayed:', err.message);
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
        );
      } catch (err) {
        console.warn('WatchPosition skipped:', err);
      }

      return () => {
        if (watchId !== null) {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {}
        }
      };
    } catch (globalErr) {
      console.warn('Geolocation initialization bypassed safely:', globalErr);
    }
  }, []);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      {/* Standard OpenStreetMap layout converted to Night Mode in Dark Theme */}
      {isDark && (
        <style>{`
          .leaflet-tile-pane {
            filter: invert(100%) hue-rotate(180deg) brightness(88%) contrast(92%) !important;
          }
          .leaflet-container {
            background: #18181b !important;
          }
        `}</style>
      )}

      <MapContainer
        center={defaultCenter}
        zoom={9}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
        style={{ background: isDark ? '#18181b' : '#f3f4f6' }}
      >
        <MapController selectedNode={selectedNode} userLocation={userLocation} />
        <RecenterButton userLocation={userLocation} onManualLocate={requestLocation} />

        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
          maxZoom={19}
        />

        {/* User Current Location Indicator */}
        {userLocation && (
          <Marker position={userLocation} icon={createUserLocationPin()}>
            <Popup>
              <div style={{ textAlign: 'center', padding: '4px' }}>
                <strong style={{ color: '#2563eb', fontSize: '13px' }}>📍 You Are Here</strong>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  {userLocation[0].toFixed(4)}° N, {userLocation[1].toFixed(4)}° E
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Tier 1: Large Macro Hexagonal Clusters (Regional Sectors with 3 stations each) */}
        {hexTierMode === 'all' && MACRO_HEX_SECTORS.map((sector) => {
          const macroCoords = getHexagonPolygon(sector.centerLat, sector.centerLng, sector.radiusKm);
          const isUserInSector = userLocation
            ? getDistanceKm(userLocation[0], userLocation[1], sector.centerLat, sector.centerLng) <= sector.radiusKm
            : sector.id === 'macro_sector_vlr_central';

          return (
            <Polygon
              key={`macro-${sector.id}`}
              positions={macroCoords}
              pathOptions={{
                color: isUserInSector ? '#06b6d4' : sector.color,
                weight: isUserInSector ? 3 : 2,
                dashArray: '8, 8',
                fillColor: sector.color,
                fillOpacity: isUserInSector ? 0.08 : 0.03,
              }}
            >
              <Popup>
                <div style={{ padding: '6px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#06b6d4', fontWeight: 'bold' }}>
                    Tier 1 Macro Hexagon
                  </span>
                  <h4 style={{ fontSize: '13px', fontWeight: 'bold', margin: '3px 0' }}>{sector.name}</h4>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0' }}>
                    Sector: {sector.code} • Radius: {sector.radiusKm} km
                  </p>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>
                    Contains {sector.stationIds.length} Charging Stations (Priority Sector)
                  </div>
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* Tier 2: Micro Hexagonal Spatial Coverage Cells for each Station */}
        {(hexTierMode === 'all' || hexTierMode === 'micro') && nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          const polygonCoords = getHexagonPolygon(node.latitude, node.longitude, node.coverageRadiusKm || 2.4);

          const colorMap = {
            available: '#10b981',
            busy: '#f59e0b',
            offline_fault: '#ef4444',
          };
          const color = colorMap[node.status] || '#10b981';

          return (
            <Polygon
              key={`hex-${node.id}`}
              positions={polygonCoords}
              pathOptions={{
                color: isSelected ? '#ffffff' : color,
                weight: isSelected ? 3 : 1.5,
                fillColor: color,
                fillOpacity: isSelected ? 0.28 : 0.12,
                dashArray: isSelected ? '4, 4' : undefined,
              }}
              eventHandlers={{
                click: () => onSelectNode(node),
              }}
            />
          );
        })}

        {/* RelayEV Charging Nodes */}
        {nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          return (
            <Marker
              key={node.id}
              position={[node.latitude, node.longitude]}
              icon={createCustomPin(node.status, isSelected)}
              eventHandlers={{
                click: () => onSelectNode(node),
              }}
            />
          );
        })}
      </MapContainer>

      {/* Floating Multi-Tier Hex Grid Layer Toggle Button */}
      <div className="absolute top-36 right-4 sm:top-28 sm:right-6 z-[850] pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setHexTierMode((curr) => {
              if (curr === 'all') return 'micro';
              if (curr === 'micro') return 'off';
              return 'all';
            });
          }}
          title="Cycle Hexagonal Grid Tiers (Macro + Micro / Micro Only / Off)"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border shadow-lg transition-all active:scale-95 ${
            hexTierMode === 'all'
              ? isDark
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40 shadow-cyan-500/20'
                : 'bg-cyan-50 text-cyan-700 border-cyan-300 shadow-cyan-600/10'
              : hexTierMode === 'micro'
                ? isDark
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : isDark
                  ? 'bg-neutral-900/90 text-neutral-400 border-neutral-700'
                  : 'bg-white/95 text-gray-500 border-gray-300'
          }`}
        >
          <Hexagon className={`w-3.5 h-3.5 ${hexTierMode !== 'off' ? 'fill-cyan-500/20 text-cyan-500' : ''}`} />
          <span>
            {hexTierMode === 'all'
              ? '⬡ Tiers 1 & 2 Active'
              : hexTierMode === 'micro'
                ? '⬡ Micro Cells Only'
                : '⬡ Hex Grid Off'}
          </span>
        </button>
      </div>
    </div>
  );
}
