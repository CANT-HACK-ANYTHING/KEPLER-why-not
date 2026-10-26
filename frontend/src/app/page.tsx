"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChargingSessionManager } from "@/components/ChargingSessionManager";
import { DriverWalletTopupModal } from "@/components/DriverWalletTopupModal";
import { RouteNavigationModal, NavStation } from "@/components/RouteNavigationModal";
import { Coordinates, calculateDistanceKm, DEFAULT_DRIVER_COORDS } from "@/lib/geoUtils";

interface Station extends NavStation {
  status: "Available" | "Charging";
  color: "mint" | "peach" | "blue" | "emerald";
  coords: { x: number; y: number }; // Percentage coordinates on schematic vector map
  hardwareNote?: string;
}

const initialStations: Station[] = [
  {
    id: "RelayEV-Node-01",
    name: "Mohan's Courtyard",
    host: "Mohan Ram (Solar + PZEM)",
    place: "Rampur village • 0.8 km",
    power: "3.2 kW",
    rate: 10.0,
    status: "Available",
    initials: "MC",
    color: "mint",
    latitude: 28.614,
    longitude: 77.209,
    coords: { x: 32, y: 44 },
    hardwareNote: "100% Solar-powered off-grid node",
  },
  {
    id: "RelayEV-Node-02",
    name: "Kavita's Farmhouse",
    host: "Kavita Devi (30A Relay)",
    place: "Old highway • 2.4 km",
    power: "2.8 kW",
    rate: 12.0,
    status: "Available",
    initials: "KF",
    color: "peach",
    latitude: 28.618,
    longitude: 77.215,
    coords: { x: 68, y: 28 },
    hardwareNote: "30A Failsafe with shaded parking",
  },
  {
    id: "RelayEV-Node-03",
    name: "Village Co-op Hub",
    host: "Rampur Panchayat",
    place: "Market road • 3.1 km",
    power: "3.5 kW",
    rate: 8.5,
    status: "Available",
    initials: "VC",
    color: "blue",
    latitude: 28.611,
    longitude: 77.202,
    coords: { x: 48, y: 72 },
    hardwareNote: "Subsidized community tariff",
  },
  {
    id: "RelayEV-Node-04",
    name: "Sharma Dhaba Tap",
    host: "Ramesh Sharma",
    place: "NH-48 Milestone • 4.8 km",
    power: "3.3 kW",
    rate: 14.0,
    status: "Available",
    initials: "SD",
    color: "emerald",
    latitude: 28.625,
    longitude: 77.228,
    coords: { x: 82, y: 58 },
    hardwareNote: "24/7 Chai dhaba with high-power relay",
  },
];

export default function Home() {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [navStation, setNavStation] = useState<NavStation | null>(null);
  const [driverBalance, setDriverBalance] = useState<number>(500.0);
  const [driverCoords, setDriverCoords] = useState<Coordinates>(DEFAULT_DRIVER_COORDS);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locateStatus, setLocateStatus] = useState<string>("Rampur Village (Simulated GPS)");
  const [activeTab, setActiveTab] = useState<"map" | "grid">("map");

  // Filtering & Search States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterType, setFilterType] = useState<"ALL" | "CHEAP" | "FAST" | "NEAREST">("ALL");

  // Modals
  const [isTopupOpen, setIsTopupOpen] = useState<boolean>(false);
  const [isNavModalOpen, setIsNavModalOpen] = useState<boolean>(false);

  useEffect(() => {
    fetchDriverBalance();
    fetchLiveNodes();
  }, []);

  const fetchDriverBalance = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setDriverBalance(data.wallet_balance);
      }
    } catch {
      // Backend offline fallback
    }
  };

  const fetchLiveNodes = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/nodes");
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          // Merge with coordinates and display colors
          const merged: Station[] = data.map((n: any, idx: number) => {
            const preset = initialStations[idx % initialStations.length];
            return {
              id: n.id,
              name: n.name,
              host: n.host_name,
              place: n.location,
              power: `${n.max_power_kw} kW`,
              rate: n.rate_per_kwh,
              status: n.is_active ? "Available" : "Charging",
              initials: n.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
              color: preset.color,
              latitude: n.latitude || preset.latitude,
              longitude: n.longitude || preset.longitude,
              coords: preset.coords,
              hardwareNote: preset.hardwareNote,
            };
          });
          setStations(merged);
        }
      }
    } catch {
      // Keep initial stations
    }
  };

  // Driver GPS Geolocation
  const handleLocateMe = () => {
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: Coordinates = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          setDriverCoords(coords);
          setLocateStatus(`GPS Locked (${coords.latitude.toFixed(4)}°N, ${coords.longitude.toFixed(4)}°E)`);
          setIsLocating(false);
          setFilterType("NEAREST");
        },
        (err) => {
          console.warn("GPS error:", err.message);
          setLocateStatus("GPS unavailable in dead zone · Using Rampur center");
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setLocateStatus("Geolocation not supported");
    }
  };

  // Filtered & Sorted Stations
  const displayedStations = useMemo(() => {
    let result = [...stations];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (st) =>
          st.name.toLowerCase().includes(q) ||
          st.host.toLowerCase().includes(q) ||
          st.place.toLowerCase().includes(q) ||
          st.id.toLowerCase().includes(q)
      );
    }

    // Filter Chips
    if (filterType === "CHEAP") {
      result = result.filter((st) => st.rate <= 10.0);
    } else if (filterType === "FAST") {
      result = result.filter((st) => parseFloat(st.power) >= 3.2);
    } else if (filterType === "NEAREST") {
      result.sort((a, b) => {
        const distA = calculateDistanceKm(driverCoords, { latitude: a.latitude, longitude: a.longitude });
        const distB = calculateDistanceKm(driverCoords, { latitude: b.latitude, longitude: b.longitude });
        return distA - distB;
      });
    }

    return result;
  }, [stations, searchQuery, filterType, driverCoords]);

  const openStationDrawer = (station: Station) => {
    setSelectedStation(station);
  };

  const closeStationDrawer = () => {
    setSelectedStation(null);
    fetchDriverBalance();
  };

  const openRouteModal = (station: Station, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNavStation(station);
    setIsNavModalOpen(true);
  };

  return (
    <main className="app-shell">
      {/* Modals */}
      <DriverWalletTopupModal
        currentBalance={driverBalance}
        isOpen={isTopupOpen}
        onClose={() => setIsTopupOpen(false)}
        onBalanceUpdated={(newBal) => setDriverBalance(newBal)}
      />

      <RouteNavigationModal
        station={navStation}
        driverCoords={driverCoords}
        isOpen={isNavModalOpen}
        onClose={() => setIsNavModalOpen(false)}
        onStartCharging={(st) => {
          const found = stations.find((s) => s.id === st.id);
          if (found) openStationDrawer(found);
        }}
      />

      {/* Left Sidebar */}
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="RelayEV home">
          <span className="brand-badge">⚡</span>
          <span className="brand-text">
            <strong>Relay</strong>
            <span>EV</span>
          </span>
        </a>

        {/* Offline Mesh Badge */}
        <div
          style={{
            background: "#eef7ee",
            border: "1px solid #d4e8d4",
            borderRadius: "10px",
            padding: "10px 12px",
            margin: "12px 0 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#1e5343" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
            <strong>Offline-First Mesh Active</strong>
          </div>
          <span style={{ fontSize: "10px", color: "#668575" }}>
            Cellular Dead Zone · Web Bluetooth Ready
          </span>
        </div>

        <div className="sidebar-bottom">
          {/* Driver Wallet Card in Sidebar */}
          <div
            style={{
              background: "#edf5ed",
              border: "1px solid #d5e5d5",
              borderRadius: "10px",
              padding: "14px",
              marginBottom: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "9px", letterSpacing: "1px", fontWeight: 700, color: "#4f7360" }}>
                DRIVER WALLET
              </div>
              <button
                onClick={() => setIsTopupOpen(true)}
                style={{
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                + Top Up
              </button>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#19342f", margin: "4px 0" }}>
              ₹{driverBalance.toFixed(2)}
            </div>
            <div style={{ fontSize: "10px", color: "#6c8577" }}>
              Anaya Rao (EV Driver · user_88)
            </div>
          </div>

          <div className="help-card">
            <span className="help-icon">✳</span>
            <strong>Power grows<br />when we share.</strong>
            <p>Community micro-grids empowering rural mobility with zero SIM OPEX.</p>
            <button onClick={() => openStationDrawer(stations[0])}>
              Start a charge <span>→</span>
            </button>
          </div>
          <div className="profile">
            <span className="avatar">AR</span>
            <span>
              <strong>Anaya Rao</strong>
              <small>EV Driver · user_88</small>
            </span>
          </div>
        </div>
      </aside>

      {/* Main Dashboard Area */}
      <section className="main-area" id="top">
        {/* Topbar */}
        <header className="topbar">
          <div className="breadcrumb">
            Rampur Corridor <span>/</span> Driver Mesh Navigation
          </div>
          <div className="topbar-right">
            <button
              onClick={() => setIsTopupOpen(true)}
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#1e5343",
                background: "#e4efe5",
                padding: "6px 12px",
                borderRadius: "20px",
                border: "1px solid #c2dec4",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              👛 Wallet: ₹{driverBalance.toFixed(2)} <span style={{ color: "#059669" }}>+ Top Up</span>
            </button>
            <button
              onClick={handleLocateMe}
              disabled={isLocating}
              style={{
                background: "#ffffff",
                border: "1px solid #dce6d8",
                borderRadius: "20px",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#1b4d3e",
                cursor: "pointer",
              }}
            >
              📍 {isLocating ? "Locating GPS..." : locateStatus}
            </button>
            <span className="top-avatar">AR</span>
          </div>
        </header>

        {/* Content */}
        <div className="content">
          {/* Welcome Header */}
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                PEER-TO-PEER COMMUNITY CHARGING <span className="tiny-spark">✳</span>
              </div>
              <h1>
                Good morning, Anaya <span className="wave">✳</span>
              </h1>
              <p className="intro">
                A ₹1,500 decentralized P2P charging mesh engineered for rural India and cellular dead zones.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="primary-button"
                onClick={() => openStationDrawer(stations[0])}
              >
                <span className="bolt">ϟ</span>
                Connect to Node #01
                <span className="button-arrow">↗</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #dce6d8",
              borderRadius: "14px",
              padding: "16px 20px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            }}
          >
            {/* Search Input */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "260px" }}>
              <span style={{ fontSize: "16px" }}>🔍</span>
              <input
                type="text"
                placeholder="Search village, host (Mohan, Kavita), or landmark..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: "13px",
                  color: "#19342f",
                }}
              />
            </div>

            {/* Filter Chips */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                { id: "ALL", label: "All Stations" },
                { id: "CHEAP", label: "Under ₹10 🏷️" },
                { id: "FAST", label: "3.2+ kW Fast ⚡" },
                { id: "NEAREST", label: "Nearest First 📍" },
              ].map((f) => {
                const isActive = filterType === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilterType(f.id as any)}
                    style={{
                      background: isActive ? "#1b4d3e" : "#f1f6f1",
                      color: isActive ? "#ffffff" : "#4e6a5c",
                      border: isActive ? "1px solid #1b4d3e" : "1px solid #d8e5d6",
                      borderRadius: "18px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Charging Mesh Map */}
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #dce6d8",
              borderRadius: "14px",
              padding: "20px",
              marginBottom: "20px",
              boxShadow: "0 4px 18px rgba(25, 52, 47, 0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "10px", letterSpacing: "1.2px", fontWeight: 700, color: "#618070", textTransform: "uppercase" }}>
                  COMMUNITY MESH MAP · CELLULAR DEAD ZONE
                </div>
                <h3 style={{ margin: "2px 0 0", fontFamily: "Georgia, serif", fontSize: "20px", fontWeight: 600 }}>
                  Live Rampur P2P Charging Nodes
                </h3>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span
                  style={{
                    background: "#fef3c7",
                    color: "#92400e",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "1px solid #fde68a",
                  }}
                >
                  📡 0 Bars (Dead Zone) · Web Bluetooth Active
                </span>
                <span
                  style={{
                    background: "#ecfdf5",
                    color: "#065f46",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "1px solid #a7f3d0",
                  }}
                >
                  ⚡ {displayedStations.length} Nodes Shown
                </span>
              </div>
            </div>

            {/* Vector Map Canvas */}
            <div
              style={{
                position: "relative",
                height: "280px",
                background: "radial-gradient(ellipse at 50% 50%, #e2eee0 0%, #edf4ec 60%, #f6faf5 100%)",
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid #d4e3d2",
              }}
            >
              {/* Mesh Route Connections (SVG Lines) */}
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              >
                <line x1="32%" y1="44%" x2="68%" y2="28%" stroke="#8eb899" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
                <line x1="32%" y1="44%" x2="48%" y2="72%" stroke="#8eb899" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
                <line x1="48%" y1="72%" x2="82%" y2="58%" stroke="#8eb899" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
                <line x1="68%" y1="28%" x2="82%" y2="58%" stroke="#8eb899" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
              </svg>

              {/* Terrain Roadways Decoration */}
              <div
                style={{
                  position: "absolute",
                  left: "10%",
                  top: "40%",
                  width: "80%",
                  height: "20px",
                  borderTop: "2px dashed #bdd4be",
                  transform: "rotate(-6deg)",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "40%",
                  top: "10%",
                  width: "20px",
                  height: "80%",
                  borderLeft: "2px dashed #bdd4be",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              />

              {/* Station Markers on Map */}
              {displayedStations.map((st) => {
                const distanceKm = calculateDistanceKm(driverCoords, {
                  latitude: st.latitude,
                  longitude: st.longitude,
                });
                const isSelected = selectedStation?.id === st.id;

                return (
                  <div
                    key={st.id}
                    style={{
                      position: "absolute",
                      left: `${st.coords.x}%`,
                      top: `${st.coords.y}%`,
                      transform: "translate(-50%, -50%)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      zIndex: isSelected ? 30 : 10,
                    }}
                  >
                    <button
                      onClick={() => openStationDrawer(st)}
                      style={{
                        background: isSelected ? "#1b4d3e" : "#ffffff",
                        color: isSelected ? "#ffffff" : "#19342f",
                        border: "2px solid #286350",
                        borderRadius: "24px",
                        padding: "6px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(27, 77, 62, 0.2)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: st.status === "Available" ? "#10b981" : "#f59e0b",
                        }}
                      />
                      <span style={{ fontSize: "12px", fontWeight: 700 }}>{st.name}</span>
                      <span style={{ fontSize: "10px", opacity: 0.8 }}>₹{st.rate}/kWh</span>
                    </button>

                    {/* Quick Navigate Pin Tag */}
                    <button
                      onClick={(e) => openRouteModal(st, e)}
                      style={{
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                        padding: "2px 8px",
                        fontSize: "9px",
                        fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(37,99,235,0.3)",
                      }}
                    >
                      🚗 {distanceKm} km
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Station Cards Grid */}
          <div className="section-header">
            <div>
              <span className="section-eyebrow">STATIONS READY FOR CHARGING</span>
              <h2>Available Community Nodes ({displayedStations.length})</h2>
            </div>
            <span style={{ fontSize: "12px", color: "#618070" }}>
              Click station to pair over Web Bluetooth or navigate
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            {displayedStations.map((st) => {
              const distanceKm = calculateDistanceKm(driverCoords, {
                latitude: st.latitude,
                longitude: st.longitude,
              });

              return (
                <div
                  key={st.id}
                  onClick={() => openStationDrawer(st)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #dce6d8",
                    borderRadius: "14px",
                    padding: "18px",
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.03)";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          background: "#e4efe5",
                          color: "#1b4d3e",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          fontSize: "13px",
                        }}
                      >
                        {st.initials}
                      </span>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#19342f" }}>
                          {st.name}
                        </h4>
                        <div style={{ fontSize: "11px", color: "#618070" }}>{st.host}</div>
                      </div>
                    </div>
                    <span
                      style={{
                        background: "#ecfdf5",
                        color: "#065f46",
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      {st.status}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: "#4f7360", marginBottom: "8px" }}>
                    📍 {st.place}
                  </div>

                  {st.hardwareNote && (
                    <div style={{ fontSize: "11px", color: "#6c8577", fontStyle: "italic", marginBottom: "12px" }}>
                      ✓ {st.hardwareNote}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #edf4ec", paddingTop: "12px" }}>
                    <div>
                      <span style={{ fontSize: "18px", fontWeight: 800, color: "#19342f" }}>
                        ₹{st.rate.toFixed(2)}
                      </span>
                      <span style={{ fontSize: "11px", color: "#618070" }}> / kWh</span>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={(e) => openRouteModal(st, e)}
                        style={{
                          background: "#eff6ff",
                          color: "#2563eb",
                          border: "1px solid #bfdbfe",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        🚗 {distanceKm} km
                      </button>
                      <button
                        onClick={() => openStationDrawer(st)}
                        style={{
                          background: "#1b4d3e",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          padding: "6px 12px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Charge ϟ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Slide-out Station Drawer */}
      {selectedStation && (
        <div
          className="drawer-overlay"
          onClick={closeStationDrawer}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(3px)",
            zIndex: 99,
            display: "flex",
            justifyContent: "flex-end",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            className="drawer-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "480px",
              height: "100%",
              background: "#ffffff",
              padding: "24px",
              overflowY: "auto",
              boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
              animation: "slideInRight 0.25s ease",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "1px solid #eef2ed",
                paddingBottom: "16px",
                marginBottom: "20px",
              }}
            >
              <div>
                <span
                  style={{
                    background: "#e4efe5",
                    color: "#1e5343",
                    padding: "3px 8px",
                    borderRadius: "12px",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {selectedStation.id}
                </span>
                <h2
                  style={{
                    margin: "6px 0 2px",
                    fontFamily: "Georgia, serif",
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "#19342f",
                  }}
                >
                  {selectedStation.name}
                </h2>
                <div style={{ fontSize: "12px", color: "#618070" }}>
                  Hosted by {selectedStation.host} • 📍 {selectedStation.place}
                </div>
              </div>
              <button
                onClick={closeStationDrawer}
                style={{
                  background: "#f0f4f0",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* Embedded Charging Session Manager */}
            <ChargingSessionManager
              initialNodeId={selectedStation.id}
              initialNodeName={selectedStation.name}
              ratePerKwh={selectedStation.rate}
              onClose={closeStationDrawer}
              onBalanceUpdated={(newBal) => setDriverBalance(newBal)}
            />
          </div>
        </div>
      )}

      {/* Drawer Animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </main>
  );
}
