"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ChargingNode } from "@/types";
import { Zap, ShieldCheck, AlertTriangle, BatteryCharging, Radio } from "lucide-react";

interface MapViewerProps {
  nodes: ChargingNode[];
  selectedNode: ChargingNode | null;
  onSelectNode: (node: ChargingNode) => void;
}

// Custom Marker Generator
function createNodeIcon(status: string) {
  let colorClass = "bg-emerald-500 border-emerald-300 pulse-available";
  let iconSvg = "⚡";

  if (status === "busy") {
    colorClass = "bg-amber-500 border-amber-300 pulse-busy";
    iconSvg = "⏳";
  } else if (status === "offline_fault") {
    colorClass = "bg-rose-500 border-rose-300";
    iconSvg = "⚠️";
  }

  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `
      <div class="flex items-center justify-center w-10 h-10 rounded-full border-2 text-white shadow-xl ${colorClass}">
        <span class="text-base font-bold">${iconSvg}</span>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 13, { duration: 1.5 });
  }, [center, map]);
  return null;
}

export default function MapViewer({ nodes, selectedNode, onSelectNode }: MapViewerProps) {
  const defaultCenter: [number, number] = [15.35, 74.95];
  const activeCenter: [number, number] = selectedNode
    ? [selectedNode.latitude, selectedNode.longitude]
    : defaultCenter;

  return (
    <div className="relative w-full h-full min-h-[450px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      <MapContainer
        center={defaultCenter}
        zoom={11}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
        style={{ minHeight: "100%", height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {selectedNode && <MapRecenter center={activeCenter} />}

        {nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          return (
            <Marker
              key={node.id}
              position={[node.latitude, node.longitude]}
              icon={createNodeIcon(node.status)}
              eventHandlers={{
                click: () => onSelectNode(node),
              }}
            >
              <Popup className="custom-popup" closeButton={false}>
                <div className="p-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 min-w-[210px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-emerald-400 flex items-center gap-1">
                      <Radio className="w-3.5 h-3.5 animate-pulse" />
                      {node.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{node.address_reference}</p>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs py-1 px-2 bg-slate-800 rounded-lg mb-2">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Tariff</span>
                      <span className="font-bold text-emerald-300">₹{node.tariff_per_kwh}/kWh</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Power</span>
                      <span className="font-bold text-sky-300">{node.max_power_kw} kW</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectNode(node)}
                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    Select Station
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Network Legend */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-800 shadow-xl text-xs space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          Offline Mesh Nodes
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Busy
        </div>
      </div>
    </div>
  );
}
