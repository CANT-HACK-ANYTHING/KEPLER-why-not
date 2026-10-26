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
  baseRate?: number;
  gridAvailability?: "SURPLUS" | "NORMAL" | "STRAINED" | "BATTERY" | string;
  powerSource?: string;
  tariffMultiplier?: number;
  tariffReason?: string;
  badgeColor?: string;
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

        {/* Dynamic Grid Availability & Tariff Indicator */}
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            borderRadius: "10px",
            background:
              station.gridAvailability === "SURPLUS"
                ? "rgba(16, 185, 129, 0.12)"
                : station.gridAvailability === "STRAINED"
                ? "rgba(239, 68, 68, 0.12)"
                : station.gridAvailability === "BATTERY"
                ? "rgba(245, 158, 11, 0.12)"
                : "rgba(59, 130, 246, 0.12)",
            border: `1px solid ${
              station.gridAvailability === "SURPLUS"
                ? "rgba(16, 185, 129, 0.35)"
                : station.gridAvailability === "STRAINED"
                ? "rgba(239, 68, 68, 0.35)"
                : station.gridAvailability === "BATTERY"
                ? "rgba(245, 158, 11, 0.35)"
                : "rgba(59, 130, 246, 0.35)"
            }`,
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontWeight: 700, color: "#e2e8f0" }}>⚡ Grid Power Availability:</span>
            <span
              style={{
                fontWeight: 700,
                color:
                  station.gridAvailability === "SURPLUS"
                    ? "#34d399"
                    : station.gridAvailability === "STRAINED"
                    ? "#f87171"
                    : station.gridAvailability === "BATTERY"
                    ? "#fbbf24"
                    : "#60a5fa",
              }}
            >
              {station.gridAvailability === "SURPLUS"
                ? "🟢 High Solar Surplus (-20%)"
                : station.gridAvailability === "STRAINED"
                ? "🔴 Grid Strain Peak (+35%)"
                : station.gridAvailability === "BATTERY"
                ? "⚡ Inverter Battery Backup (+20%)"
                : "🟡 Normal Grid Stable"}
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
            {station.tariffReason || `Dynamic rate adjusted for local power conditions.`}
            {station.baseRate && station.baseRate !== station.rate && (
              <span style={{ marginLeft: "6px", color: "#cbd5e1" }}>
                (Base: ₹{station.baseRate.toFixed(2)} → Live: ₹{station.rate.toFixed(2)}/kWh)
              </span>
            )}
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
            <span style={{ color: "#94a3b8" }}>Effective Live Tariff:</span>
            <span style={{ fontWeight: 700, color: "#f8fafc" }}>₹{station.rate.toFixed(2)} / kWh</span>
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
            min={2}
            max={30}
            step={1}
            value={targetKwh}
            onChange={(e) => setTargetKwh(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#10b981", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            <span>2 kWh (Scooter)</span>
            <span>Est. ~{chargeHours} hrs</span>
            <span>30 kWh (Tata Nexon EV)</span>
          </div>
        </div>

        {/* Navigation & Action Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: "#334155",
              color: "#f8fafc",
              fontWeight: 700,
              fontSize: "13px",
              textAlign: "center",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            🧭 Open Maps
          </a>
          <button
            onClick={() => onStartCharging(station)}
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "13px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            ⚡ Start Charging
          </button>
        </div>
      </div>
    </div>
  );
}
