"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChargingSessionManager } from "@/components/ChargingSessionManager";

interface Station {
  id: string;
  name: string;
  host: string;
  place: string;
  power: string;
  rate: number;
  status: "Available" | "Charging";
  initials: string;
  color: "mint" | "peach" | "blue" | "emerald";
  coords: { x: number; y: number }; // percentage on interactive map
}

const stations: Station[] = [
  {
    id: "RelayEV-Node-01",
    name: "Mohan’s Courtyard",
    host: "Mohan Ram (Solar + PZEM)",
    place: "Rampur village · 0.8 km",
    power: "3.2 kW",
    rate: 10.0,
    status: "Available",
    initials: "MC",
    color: "mint",
    coords: { x: 32, y: 44 }
  },
  {
    id: "RelayEV-Node-02",
    name: "Kavita’s Farmhouse",
    host: "Kavita Devi (30A Relay)",
    place: "Old highway · 2.4 km",
    power: "2.8 kW",
    rate: 12.0,
    status: "Available",
    initials: "KF",
    color: "peach",
    coords: { x: 68, y: 28 }
  },
  {
    id: "RelayEV-Node-03",
    name: "Village Co-op Hub",
    host: "Rampur Panchayat",
    place: "Market road · 3.1 km",
    power: "3.5 kW",
    rate: 8.5,
    status: "Available",
    initials: "VC",
    color: "blue",
    coords: { x: 48, y: 72 }
  },
  {
    id: "RelayEV-Node-04",
    name: "Sharma Dhaba Tap",
    host: "Ramesh Sharma",
    place: "NH-48 Milestone · 4.8 km",
    power: "3.3 kW",
    rate: 14.0,
    status: "Available",
    initials: "SD",
    color: "emerald",
    coords: { x: 82, y: 58 }
  }
];

export default function Home() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [synced, setSynced] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [driverBalance, setDriverBalance] = useState<number>(500.0);
  const [activeTab, setActiveTab] = useState<"map" | "grid">("map");

  // Fetch driver profile on initial load
  useEffect(() => {
    fetchDriverBalance();
  }, []);

  const fetchDriverBalance = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setDriverBalance(data.wallet_balance);
      }
    } catch {
      // Backend not running yet
    }
  };

  const openStationDrawer = (station: Station) => {
    setSelectedStation(station);
  };

  const closeStationDrawer = () => {
    setSelectedStation(null);
    fetchDriverBalance();
  };

  return (
    <main className="app-shell">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="RelayEV home">
          <span className="brand-mark">↗</span>
          <span>
            relay<span className="brand-light">ev</span>
          </span>
        </a>

        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {["Overview", "Find a charger", "My sessions", "Host a node"].map((item, index) => (
            <button
              key={item}
              className={`nav-item ${activeNav === item ? "selected" : ""}`}
              onClick={() => setActiveNav(item)}
            >
              <span className="nav-icon">{["◫", "⌖", "↻", "＋"][index]}</span>
              {item}
              {item === "My sessions" && <span className="nav-count">2</span>}
            </button>
          ))}
          <Link
            href="/charge"
            className="nav-item"
            style={{ textDecoration: "none", color: "#245f4e", fontWeight: 700 }}
          >
            <span className="nav-icon">⚡</span>Direct /charge Route
          </Link>
        </nav>

        <div className="sidebar-label network-label">NETWORK STATUS</div>
        <div className="network-status" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="pulse-dot" />
            <strong>Offline-First Mesh</strong>
          </div>
          <span style={{ fontSize: "10px", color: "#668575" }}>
            Cellular Dead Zone · Web Bluetooth Active
          </span>
        </div>

        <div className="sidebar-bottom">
          {/* Driver Wallet Card in Sidebar */}
          <div
            style={{
              background: "#edf5ed",
              border: "1px solid #d5e5d5",
              borderRadius: "10px",
              padding: "12px",
              marginBottom: "14px"
            }}
          >
            <div style={{ fontSize: "9px", letterSpacing: "1px", fontWeight: 700, color: "#4f7360" }}>
              DRIVER WALLET
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#19342f", margin: "2px 0" }}>
              ₹{driverBalance.toFixed(2)}
            </div>
            <div style={{ fontSize: "9px", color: "#6c8577" }}>
              user_88 (Anaya Rao)
            </div>
          </div>

          <div className="help-card">
            <span className="help-icon">✳</span>
            <strong>Power grows<br />when we share.</strong>
            <p>Every home can help keep the village moving.</p>
            <button onClick={() => openStationDrawer(stations[0])}>
              Start a charge <span>→</span>
            </button>
          </div>
          <button className="profile">
            <span className="avatar">AR</span>
            <span>
              <strong>Anaya Rao</strong>
              <small>EV Driver · user_88</small>
            </span>
            <span className="profile-dots">···</span>
          </button>
        </div>
      </aside>

      {/* Main Dashboard Area */}
      <section className="main-area" id="top">
        {/* Topbar */}
        <header className="topbar">
          <div className="breadcrumb">
            Rampur community <span>/</span> {activeNav}
          </div>
          <div className="topbar-right">
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#1e5343",
                background: "#e4efe5",
                padding: "4px 10px",
                borderRadius: "20px"
              }}
            >
              👛 Wallet: ₹{driverBalance.toFixed(2)}
            </span>
            <span className="today">Monday, 26 October</span>
            <button className="icon-button" aria-label="Notifications">
              ♧<i />
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
                YOUR LOCAL ENERGY NETWORK <span className="tiny-spark">✳</span>
              </div>
              <h1>
                Good morning, Anaya <span className="wave">✳</span>
              </h1>
              <p className="intro">
                A ₹1,500 decentralized P2P charging mesh for completely offline environments.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => openStationDrawer(stations[0])}
            >
              <span className="bolt">ϟ</span>
              Connect to a charger
              <span className="button-arrow">↗</span>
            </button>
          </div>

          {/* Interactive Charging Mesh Map */}
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #dce6d8",
              borderRadius: "14px",
              padding: "20px",
              marginBottom: "20px",
              boxShadow: "0 4px 18px rgba(25, 52, 47, 0.05)"
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
                    border: "1px solid #fde68a"
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
                    border: "1px solid #a7f3d0"
                  }}
                >
                  ⚡ {stations.length} Nodes Online
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
                border: "1px solid #d4e3d2"
              }}
            >
              {/* Mesh Route Connections (SVG Lines) */}
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              >
                {/* Connecting lines between nodes to illustrate Drive-By Data Mule Mesh */}
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
                  pointerEvents: "none"
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
                  pointerEvents: "none"
                }}
              />

              {/* Station Markers on Map */}
              {stations.map((st) => (
                <button
                  key={st.id}
                  onClick={() => openStationDrawer(st)}
                  style={{
                    position: "absolute",
                    left: `${st.coords.x}%`,
                    top: `${st.coords.y}%`,
                    transform: "translate(-50%, -50%)",
                    background: selectedStation?.id === st.id ? "#1b4d3e" : "#ffffff",
                    color: selectedStation?.id === st.id ? "#ffffff" : "#19342f",
                    border: "2px solid #286350",
                    borderRadius: "24px",
                    padding: "6px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(27, 77, 62, 0.2)",
                    fontSize: "11px",
                    fontWeight: 700,
                    transition: "all 0.2s ease",
                    zIndex: 10
                  }}
                  title={`Click to open Station Drawer for ${st.name}`}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: st.status === "Available" ? "#10b981" : "#f59e0b",
                      boxShadow: "0 0 6px #10b981"
                    }}
                  />
                  <span>{st.name}</span>
                  <span
                    style={{
                      background: selectedStation?.id === st.id ? "rgba(255,255,255,0.2)" : "#eaf3eb",
                      color: selectedStation?.id === st.id ? "#ffffff" : "#24614e",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      fontSize: "9px"
                    }}
                  >
                    ₹{st.rate}/kWh
                  </span>
                </button>
              ))}

              {/* Map Footer Helper */}
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "14px",
                  fontSize: "10px",
                  color: "#547365",
                  fontWeight: 600,
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(4px)",
                  padding: "4px 8px",
                  borderRadius: "6px"
                }}
              >
                💡 Click any station marker on the map to open the <strong>Station Drawer</strong> and start charging!
              </div>
            </div>
          </section>

          {/* Stats Grid */}
          <section className="stats-grid" aria-label="Network summary">
            <article className="stat-card">
              <div className="stat-top">
                <span>Nearby nodes</span>
                <span className="stat-icon green-icon">⌖</span>
              </div>
              <div className="stat-value">
                04 <small>in Rampur mesh</small>
              </div>
              <div className="stat-foot">
                <span className="mini-bars">
                  <i /><i /><i /><i /><i /><i /><i /><i />
                </span>
                <span>All 4 available now</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Energy shared this week</span>
                <span className="stat-icon yellow-icon">ϟ</span>
              </div>
              <div className="stat-value">
                48.6 <small>kWh</small>
              </div>
              <div className="stat-foot">
                <span className="trend">↗ 18%</span>
                <span>compared to last week</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Drive-By Data Mules</span>
                <span className="stat-icon lilac-icon">↻</span>
              </div>
              <div className="stat-value">
                03 <small>receipts synced</small>
              </div>
              <div className="stat-foot">
                <span className="pending-pill">
                  <i /> Self-healing offline mesh
                </span>
              </div>
            </article>
          </section>

          {/* Lower Grid: Station List & Offline Mule Panel */}
          <section className="lower-grid">
            <article className="panel station-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-eyebrow">A FEW STREETS AWAY</div>
                  <h3>
                    Nearby Host Chargers <span className="heading-count">04</span>
                  </h3>
                </div>
                <button
                  className="text-link"
                  onClick={() => openStationDrawer(stations[0])}
                >
                  Quick Open Drawer <span>→</span>
                </button>
              </div>

              <div className="station-list">
                {stations.map((station) => (
                  <div
                    className="station-row"
                    key={station.id}
                    onClick={() => openStationDrawer(station)}
                    style={{ cursor: "pointer", transition: "background 0.15s" }}
                  >
                    <div className={`station-avatar ${station.color}`}>
                      {station.initials}
                    </div>
                    <div className="station-info">
                      <strong>{station.name}</strong>
                      <span>{station.place} · Host: {station.host}</span>
                    </div>
                    <div className="station-power">
                      {station.power}
                      <small>₹{station.rate}/kWh</small>
                    </div>
                    <span
                      className={`station-status ${
                        station.status === "Available" ? "available" : "charging"
                      }`}
                    >
                      <i />
                      {station.status}
                    </span>
                    <button
                      className="row-arrow"
                      aria-label={`Open Station Drawer for ${station.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openStationDrawer(station);
                      }}
                    >
                      ↗
                    </button>
                  </div>
                ))}
              </div>
            </article>

            {/* Offline Data Mule Sync Panel */}
            <article className="panel sync-panel">
              <div className="sync-top">
                <span className="sync-icon">↻</span>
                <span className="sync-tag">OFFLINE DATA MULE</span>
              </div>
              <div className="section-eyebrow">DRIVE-BY MESH SYNC</div>
              <h3>
                Help the network<br />catch up.
              </h3>
              <p>
                Host chargers run without SIM cards or Wi-Fi. Your smartphone acts as a data mule, pulling offline signed receipts and syncing them back to the cloud.
              </p>
              <div className="sync-receipts">
                <span className="receipt-stack">
                  <i /><i /><i />
                </span>
                <span>
                  <strong>{synced ? "Receipts handed off" : "3 receipts queued"}</strong>
                  <small>
                    {synced ? "Synced to cloud database" : "Stored in node flash memory"}
                  </small>
                </span>
                <span className="receipt-arrow">→</span>
              </div>
              <button
                className="sync-button"
                onClick={() => setSynced(!synced)}
              >
                {synced ? "Mesh Sync Complete ✓" : "Simulate Drive-By Mule Sync"}
                <span>↗</span>
              </button>
              <div className="demo-note">
                <span>ⓘ</span> Earn ₹2.00 micro-reward per stranded receipt synced!
              </div>
            </article>
          </section>

          {/* Footer */}
          <footer className="footer">
            <span>
              ✳ &nbsp; RelayEV <span className="footer-sep">·</span> Rural EV Charging Mesh
            </span>
            <span>Zero-OPEX Hardware · Web Bluetooth API (WebBLE)</span>
          </footer>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* THE STATION DRAWER: Embedded on the main map as required by Role 3       */}
      {/* ========================================================================= */}
      {selectedStation && (
        <div
          className="station-drawer-backdrop"
          onClick={closeStationDrawer}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18, 38, 32, 0.65)",
            backdropFilter: "blur(5px)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 9999,
            animation: "fadeIn 0.2s ease"
          }}
        >
          {/* Drawer Sheet */}
          <div
            className="station-drawer-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "680px",
              height: "100vh",
              background: "#ffffff",
              boxShadow: "-8px 0 32px rgba(18, 38, 32, 0.25)",
              overflowY: "auto",
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              animation: "slideInRight 0.25s ease"
            }}
          >
            {/* Drawer Top Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                borderBottom: "1px solid #e5eee2",
                paddingBottom: "14px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "#245f4e",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "18px",
                    fontWeight: 700
                  }}
                >
                  ϟ
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#19342f" }}>
                    {selectedStation.name}
                  </h2>
                  <div style={{ fontSize: "11px", color: "#617d6e" }}>
                    Node ID: <strong>{selectedStation.id}</strong> · {selectedStation.place}
                  </div>
                </div>
              </div>

              <button
                onClick={closeStationDrawer}
                aria-label="Close station drawer"
                style={{
                  background: "#edf4eb",
                  border: 0,
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  color: "#285444",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center"
                }}
              >
                ✕
              </button>
            </div>

            {/* Embedded Charging Session Manager (Housing BleConnector & BleSimulator) */}
            <ChargingSessionManager
              initialNodeId={selectedStation.id}
              initialNodeName={selectedStation.name}
              ratePerKwh={selectedStation.rate}
              onClose={closeStationDrawer}
              onBalanceUpdated={(newBal) => setDriverBalance(newBal)}
            />

            {/* Architectural Explanatory Footer inside Drawer */}
            <div
              style={{
                marginTop: "24px",
                background: "#f7faf6",
                border: "1px solid #dbe6d7",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "11px",
                color: "#4e6a5c",
                lineHeight: 1.5
              }}
            >
              <div style={{ color: "#1b4d3e", fontWeight: 700, marginBottom: "6px" }}>
                How Role 3 WebBLE Solves Rural EV Dead Zones:
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                <li><strong>No Wi-Fi / Cellular on Node:</strong> The ESP32 node costs ₹1,500 with zero recurring SIM fees.</li>
                <li><strong>Cryptographic Escrow:</strong> Phone pushes a signed JWT token via WebBLE Characteristic (<code>beb5483e</code>) to close the 30A relay.</li>
                <li><strong>Live PZEM-004T Metering:</strong> Voltage, current, and energy delivered are tracked live until cutoff.</li>
                <li><strong>HMAC Signed Receipt:</strong> ESP32 signs the final bill and returns it to the phone for cloud settlement & refund!</li>
              </ul>
            </div>
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
