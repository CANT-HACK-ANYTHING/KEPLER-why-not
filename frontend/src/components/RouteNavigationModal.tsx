"use client";

import React, { useState } from "react";
import { Coordinates, calculateDistanceKm, getGoogleMapsNavigationUrl } from "@/lib/geoUtils";

export interface NavStation {
  id: string;
  name: string;
  host: string;
  place: string;
  power: string;
  rate: number;
  latitude: number;
  longitude: number;
  initials: string;
}

interface RouteNavigationModalProps {
  station: NavStation | null;
  driverCoords: Coordinates;
  isOpen: boolean;
  onClose: () => void;
  onStartCharging: (station: NavStation) => void;
}

export function RouteNavigationModal({
  station,
  driverCoords,
  isOpen,
  onClose,
  onStartCharging,
}: RouteNavigationModalProps) {
  const [targetKwh, setTargetKwh] = useState<number>(10);

  if (!isOpen || !station) return null;

  const distanceKm = calculateDistanceKm(driverCoords, {
    latitude: station.latitude,
    longitude: station.longitude,
  });

  // Rough estimation: 30 km/h average rural speed
  const driveMinutes = Math.max(2, Math.round((distanceKm / 30) * 60));
  const estimatedCost = +(targetKwh * station.rate).toFixed(2);
  const powerKw = parseFloat(station.power) || 3.3;
  const chargeHours = +(targetKwh / powerKw).toFixed(1);

  const googleMapsUrl = getGoogleMapsNavigationUrl(
    { latitude: station.latitude, longitude: station.longitude },
    station.name
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "16px",
          padding: "24px",
          width: "100%",
          maxWidth: "460px",
          color: "#f8fafc",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>🗺️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Route to {station.name}</h3>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>{station.id} • {station.host}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Distance & Drive Time Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(30, 64, 175, 0.25))",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "12px",
            padding: "16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#93c5fd", fontWeight: 600 }}>DRIVING DISTANCE</div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#60a5fa" }}>{distanceKm} km</div>
            <div style={{ fontSize: "10px", color: "#bfdbfe" }}>From your current GPS point</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#93c5fd", fontWeight: 600 }}>ESTIMATED TRAVEL</div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#60a5fa" }}>~{driveMinutes} mins</div>
            <div style={{ fontSize: "10px", color: "#bfdbfe" }}>Via village rural corridor</div>
          </div>
        </div>

        {/* Location & Power Specs */}
        <div style={{ background: "rgba(15, 23, 42, 0.7)", borderRadius: "10px", padding: "12px", marginBottom: "16px", fontSize: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#94a3b8" }}>Milestone:</span>
            <span style={{ fontWeight: 600, color: "#f8fafc" }}>📍 {station.place}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#94a3b8" }}>Hardware Rating:</span>
            <span style={{ fontWeight: 600, color: "#34d399" }}>⚡ {station.power} (30A Failsafe Relay)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Community Tariff:</span>
            <span style={{ fontWeight: 600, color: "#f8fafc" }}>₹{station.rate.toFixed(2)} / kWh</span>
          </div>
        </div>

        {/* Interactive Energy & Cost Estimator */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
            <label style={{ color: "#cbd5e1", fontWeight: 600 }}>Target Energy to Charge:</label>
            <span style={{ color: "#34d399", fontWeight: 800 }}>{targetKwh} kWh (~₹{estimatedCost})</span>
          </div>
          <input
            type="range"
            min="2"
            max="30"
            step="1"
            value={targetKwh}
            onChange={(e) => setTargetKwh(parseInt(e.target.value) || 10)}
            style={{ width: "100%", accentColor: "#10b981" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
            <span>2 kWh (Scooter)</span>
            <span>Est. ~{chargeHours} hrs</span>
            <span>30 kWh (Full EV Car)</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: "#2563eb",
              color: "#fff",
              textDecoration: "none",
              borderRadius: "10px",
              padding: "12px",
              fontSize: "14px",
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
            }}
          >
            🚗 Start GPS Navigation (Google Maps) ↗
          </a>

          <button
            onClick={() => {
              onClose();
              onStartCharging(station);
            }}
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "12px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            ⚡ Start Charging via Web Bluetooth
          </button>
        </div>
      </div>
    </div>
  );
}
