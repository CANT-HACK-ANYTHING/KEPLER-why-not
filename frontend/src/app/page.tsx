"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChargingSessionManager } from "@/components/ChargingSessionManager";
import { DriverWalletTopupModal } from "@/components/DriverWalletTopupModal";
import { RouteNavigationModal, NavStation } from "@/components/RouteNavigationModal";
import { Coordinates, calculateDistanceKm, DEFAULT_DRIVER_COORDS } from "@/lib/geoUtils";

export interface Station extends NavStation {
  status: "Available" | "Charging";
  color: "mint" | "peach" | "blue" | "emerald";
  coords: { x: number; y: number };
  hardwareNote?: string;
  baseRate?: number;
  gridAvailability?: "SURPLUS" | "NORMAL" | "STRAINED" | "BATTERY" | string;
  powerSource?: string;
  tariffReason?: string;
}

const initialStations: Station[] = [
  {
    id: "node_esp32_01",
    name: "VIT Campus Solar Relay",
    host: "Rajesh Kumar (VIT Solar Grid)",
    place: "Near VIT Main Gate, Tiruvalam Road, Katpadi",
    power: "3.3 kW",
    rate: 8.00,
    baseRate: 10.00,
    gridAvailability: "SURPLUS",
    powerSource: "SOLAR",
    tariffReason: "Surplus Green Solar / Off-Peak (20% Discount)",
    status: "Available",
    initials: "VC",
    color: "mint",
    latitude: 12.9692,
    longitude: 79.1559,
    coords: { x: 50, y: 35 },
    hardwareNote: "100% Rooftop solar + PZEM-004T with shaded 2W bay",
  },
  {
    id: "node_esp32_02",
    name: "Katpadi Junction Charging Point",
    host: "Murugan S. (Station Relay)",
    place: "Near Katpadi Railway Station, NH-46",
    power: "3.3 kW",
    rate: 12.50,
    baseRate: 12.50,
    gridAvailability: "NORMAL",
    powerSource: "GRID",
    tariffReason: "Standard Grid Power Availability",
    status: "Available",
    initials: "KJ",
    color: "blue",
    latitude: 12.9783,
    longitude: 79.1450,
    coords: { x: 42, y: 28 },
    hardwareNote: "24/7 Chai point beside station parking, 30A relay",
  },
  {
    id: "node_esp32_03",
    name: "Sripuram Golden Temple Hub",
    host: "Lakshmi Narayani Trust",
    place: "Malaikodi, Sripuram Temple Road",
    power: "7.2 kW",
    rate: 6.80,
    baseRate: 8.50,
    gridAvailability: "SURPLUS",
    powerSource: "SOLAR",
    tariffReason: "Solar Pilgrim Trust Subsidy (20% Off)",
    status: "Available",
    initials: "SG",
    color: "peach",
    latitude: 12.8998,
    longitude: 79.1162,
    coords: { x: 35, y: 65 },
    hardwareNote: "Dual Type-2 Fast AC with pilgrimage visitor parking",
  },
  {
    id: "node_esp32_04",
    name: "Vellore Fort Heritage Tap",
    host: "Kannan Heritage Cafeteria",
    place: "Opp. Vellore Fort East Gate, Anna Salai",
    power: "3.3 kW",
    rate: 11.00,
    baseRate: 11.00,
    gridAvailability: "NORMAL",
    powerSource: "GRID",
    tariffReason: "Standard City Grid Availability",
    status: "Available",
    initials: "VF",
    color: "emerald",
    latitude: 12.9205,
    longitude: 79.1325,
    coords: { x: 46, y: 52 },
    hardwareNote: "Heritage moat parking with shaded tree canopy",
  },
  {
    id: "node_esp32_05",
    name: "Bagayam Rural Clean Hub",
    host: "Dr. Anand Green Energy",
    place: "Near CMC Bagayam Campus, College Hill",
    power: "3.3 kW",
    rate: 7.60,
    baseRate: 9.50,
    gridAvailability: "SURPLUS",
    powerSource: "SOLAR",
    tariffReason: "Clean Campus Micro-Grid Solar (20% Off)",
    status: "Available",
    initials: "BR",
    color: "mint",
    latitude: 12.8710,
    longitude: 79.1350,
    coords: { x: 48, y: 78 },
    hardwareNote: "Solar battery buffer, open for public 2W/3W charging",
  },
  {
    id: "node_esp32_06",
    name: "Ranipet Industrial Corridor Relay",
    host: "Ranipet Fleet Co-op",
    place: "SIPCOT Phase 1, Chennai Highway, Ranipet",
    power: "7.4 kW",
    rate: 17.55,
    baseRate: 13.00,
    gridAvailability: "STRAINED",
    powerSource: "GRID",
    tariffReason: "SIPCOT Industrial Peak Load Surge (+35%)",
    status: "Available",
    initials: "RI",
    color: "blue",
    latitude: 12.9275,
    longitude: 79.3330,
    coords: { x: 80, y: 48 },
    hardwareNote: "Heavy-duty 32A industrial line for commercial cargo 3W",
  },
  {
    id: "node_esp32_07",
    name: "Ambur Leather Town Node",
    host: "Ismail Leather Works",
    place: "NH-48 Bypass, Near Star Biryani, Ambur",
    power: "3.3 kW",
    rate: 14.40,
    baseRate: 12.00,
    gridAvailability: "BATTERY",
    powerSource: "HYBRID",
    tariffReason: "Highway Battery Backup Inverter (+20%)",
    status: "Available",
    initials: "AL",
    color: "peach",
    latitude: 12.7905,
    longitude: 78.7160,
    coords: { x: 12, y: 88 },
    hardwareNote: "Highway rest stop node with 24/7 tea & tire check",
  },
  {
    id: "node_esp32_08",
    name: "Sholinghur Hill Temple Relay",
    host: "Govindarajan Temple Inn",
    place: "Foot of Yoga Narasimha Swamy Hill, Sholinghur",
    power: "3.3 kW",
    rate: 14.18,
    baseRate: 10.50,
    gridAvailability: "STRAINED",
    powerSource: "GRID",
    tariffReason: "Hill Route Peak Grid Strain (+35%)",
    status: "Available",
    initials: "SH",
    color: "emerald",
    latitude: 13.1140,
    longitude: 79.4240,
    coords: { x: 88, y: 15 },
    hardwareNote: "Solar off-grid battery backed charging tap",
  },
  {
    id: "node_esp32_09",
    name: "Walajah Highway Toll Dhaba",
    host: "Highway King Dhaba Tap",
    place: "NH-48 Toll Plaza Corridor, Walajapet",
    power: "7.2 kW",
    rate: 16.80,
    baseRate: 14.00,
    gridAvailability: "BATTERY",
    powerSource: "HYBRID",
    tariffReason: "Toll Plaza High-Power Inverter Storage (+20%)",
    status: "Available",
    initials: "WH",
    color: "mint",
    latitude: 12.9810,
    longitude: 79.3620,
    coords: { x: 84, y: 32 },
    hardwareNote: "24/7 Dhaba dining with fenced overnight EV charging bay",
  },
  {
    id: "node_esp32_10",
    name: "Gudiyatham Agricultural Feeder",
    host: "Venkatesan Agro Solar",
    place: "Agricultural Market Yard, Gudiyatham Bypass",
    power: "3.3 kW",
    rate: 7.20,
    baseRate: 9.00,
    gridAvailability: "SURPLUS",
    powerSource: "SOLAR",
    tariffReason: "Agro Solar Cooperative Surplus (20% Off)",
    status: "Available",
    initials: "GA",
    color: "blue",
    latitude: 12.9460,
    longitude: 78.8710,
    coords: { x: 22, y: 45 },
    hardwareNote: "Subsidized farm community tariff with solar canopy",
  },
];

export default function Home() {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [navStation, setNavStation] = useState<NavStation | null>(null);
  const [driverBalance, setDriverBalance] = useState<number>(500.0);
  const [driverCoords, setDriverCoords] = useState<Coordinates>(DEFAULT_DRIVER_COORDS);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locateStatus, setLocateStatus] = useState<string>("Katpadi / Vellore (Active GPS)");

  // Filtering & Search States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterType, setFilterType] = useState<"ALL" | "SURPLUS" | "CHEAP" | "FAST" | "NEAREST">("ALL");

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
          const merged: Station[] = data.map((n: any) => {
            const preset = initialStations.find((s) => s.id === n.id) || initialStations[0];
            const effectiveRate = n.effective_rate_per_kwh ?? n.rate_per_kwh ?? preset.rate;
            const baseRate = n.base_rate_per_kwh ?? preset.baseRate ?? preset.rate;
            const gridAvail = (n.grid_availability || preset.gridAvailability || "NORMAL").toUpperCase();
            const tariffReason = n.tariff_reason || preset.tariffReason || "Standard Grid Availability";
            return {
              id: n.id,
              name: n.name,
              host: n.host_name,
              place: n.location,
              power: `${n.max_power_kw || 3.3} kW`,
              rate: effectiveRate,
              baseRate: baseRate,
              gridAvailability: gridAvail,
              powerSource: n.power_source || preset.powerSource || "GRID",
              tariffReason: tariffReason,
              status: n.is_active ? "Available" : "Charging",
              initials: n.name
                .split(" ")
                .map((w: string) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
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
          setLocateStatus("Katpadi / Vellore Core (Default Corridor)");
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
    if (filterType === "SURPLUS") {
      result = result.filter(
        (st) => (st.gridAvailability?.toUpperCase() === "SURPLUS") || st.rate < 10.0
      );
    } else if (filterType === "CHEAP") {
      result = result.filter((st) => st.rate <= 10.0);
    } else if (filterType === "FAST") {
      result = result.filter((st) => parseFloat(st.power) >= 3.3);
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
    <div className="w-full min-h-screen bg-slate-900 text-slate-100 pb-16">
      {/* Topup & Navigation Modals */}
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Top Header / Driver Status Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">
                Offline-First P2P Mesh • Dynamic Grid Tariffs Active
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Vellore EV Mesh Network
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              10 verified decentralized charging stations with live dynamic grid power availability tariffs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLocateMe}
              disabled={isLocating}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition"
            >
              <span>📍</span>
              <span>{isLocating ? "Acquiring GPS..." : locateStatus}</span>
            </button>
            <Link
              href="/map"
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 transition"
            >
              <span>🗺️ Hex Map (10)</span>
              <span>↗</span>
            </Link>
          </div>
        </div>

        {/* Driver Wallet & Mesh Quick Stats Hero */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          {/* Driver Wallet Card */}
          <div className="md:col-span-2 bg-gradient-to-br from-slate-800 to-slate-850 border border-slate-700/80 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  DRIVER PRE-FUNDED ESCROW WALLET
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-black text-white">₹{driverBalance.toFixed(2)}</span>
                  <span className="text-xs text-slate-400 font-mono">INR Available</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-300">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                    AR
                  </span>
                  <span>Anaya Rao (EV Driver • user_88)</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-emerald-400 font-medium">✓ Dynamic Tariff Escrow Secured</span>
                </div>
              </div>

              <button
                onClick={() => setIsTopupOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>+</span>
                <span>Top Up Wallet</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-700/60 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Nodes In Range</span>
                <span className="font-bold text-white text-sm">10 Stations</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Dynamic Grid Rates</span>
                <span className="font-bold text-emerald-400 text-sm">₹6.80 - ₹17.55</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Simulated BLE</span>
                <span className="font-bold text-emerald-400 text-sm">ESP32 Ready</span>
              </div>
            </div>
          </div>

          {/* Quick Connect / Map Portal Card */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
                <span>INTERACTIVE HEX MAP</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                  10 LOCATIONS
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Full Corridor Spatial Discovery
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Leaflet map indexing Katpadi, VIT, Sripuram, Vellore Fort, Bagayam, Ranipet, Ambur, Sholinghur, Walajah, and Gudiyatham.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/map"
                className="w-full text-center bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs py-2.5 rounded-xl border border-slate-600 transition flex items-center justify-center gap-2"
              >
                <span>🗺️ Open Full Hex Map</span>
                <span>→</span>
              </Link>
              <button
                onClick={() => openStationDrawer(stations[0])}
                className="w-full text-center bg-slate-900/80 hover:bg-slate-900 text-slate-300 font-semibold text-xs py-2 rounded-xl border border-slate-700 transition"
              >
                ⚡ Start BLE Charge at VIT Relay
              </button>
            </div>
          </div>
        </div>

        {/* Station Search & Filter Toolbar */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 mb-6 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by place (VIT, Katpadi, Sripuram, Fort, Ranipet, Ambur)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            {[
              { id: "ALL", label: `All (${stations.length})` },
              { id: "SURPLUS", label: "🟢 Surplus Solar (<₹10)" },
              { id: "CHEAP", label: "Under ₹10 🏷️" },
              { id: "FAST", label: "Fast (3.3+ kW) ⚡" },
              { id: "NEAREST", label: "Nearest First 📍" },
            ].map((f) => {
              const isActive = filterType === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id as any)}
                  className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition ${
                    isActive
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                      : "bg-slate-900/80 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Station Feed Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Verified Charging Stations</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-slate-700 font-mono">
                {displayedStations.length} available
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tariffs adjust dynamically based on local solar generation and grid strain.
            </p>
          </div>
        </div>

        {/* Station Grid (10 Real Vellore Locations) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedStations.map((st) => {
            const distanceKm = calculateDistanceKm(driverCoords, {
              latitude: st.latitude,
              longitude: st.longitude,
            });

            return (
              <div
                key={st.id}
                onClick={() => openStationDrawer(st)}
                className="bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg transition duration-200 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header: Node ID & Status */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-700/80 border border-slate-600 text-emerald-400 flex items-center justify-center font-black text-sm group-hover:scale-105 transition">
                        {st.initials}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm group-hover:text-emerald-300 transition">
                          {st.name}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-1">{st.host}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                        st.status === "Available"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {st.status}
                    </span>
                  </div>

                  {/* Grid Power Availability Badge */}
                  {st.gridAvailability && (
                    <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          st.gridAvailability === "SURPLUS"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : st.gridAvailability === "STRAINED"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : st.gridAvailability === "BATTERY"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                        }`}
                      >
                        {st.gridAvailability === "SURPLUS" && "🟢 Surplus Solar (-20%)"}
                        {st.gridAvailability === "STRAINED" && "🔴 Grid Strain (+35%)"}
                        {st.gridAvailability === "BATTERY" && "⚡ Battery Backup (+20%)"}
                        {st.gridAvailability === "NORMAL" && "🟡 Normal Grid"}
                      </span>
                      {st.tariffReason && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={st.tariffReason}>
                          {st.tariffReason}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Location Address */}
                  <div className="flex items-start gap-1.5 text-xs text-slate-300 mb-2">
                    <span className="text-slate-400 shrink-0">📍</span>
                    <span className="line-clamp-2">{st.place}</span>
                  </div>

                  {/* Hardware / Energy Note */}
                  {st.hardwareNote && (
                    <div className="text-[11px] text-slate-400 bg-slate-900/60 rounded-lg px-2.5 py-1.5 border border-slate-800 mb-4 line-clamp-2">
                      <span className="text-emerald-400 font-semibold">✓ </span>
                      {st.hardwareNote}
                    </div>
                  )}
                </div>

                <div>
                  {/* Tariff & Power Strip */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-700/60 mb-3 text-xs">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-black text-white">₹{st.rate.toFixed(2)}</span>
                        {st.baseRate && Math.abs(st.baseRate - st.rate) > 0.01 && (
                          <span className="text-xs text-slate-500 line-through">₹{st.baseRate.toFixed(2)}</span>
                        )}
                        <span className="text-slate-400 text-[11px]"> / kWh</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="bg-slate-900 text-slate-300 font-mono text-[11px] px-2 py-0.5 rounded border border-slate-700">
                        ⚡ {st.power}
                      </span>
                      <span className="bg-blue-500/15 text-blue-400 font-mono text-[11px] px-2 py-0.5 rounded border border-blue-500/30">
                        🚗 {distanceKm} km
                      </span>
                    </div>
                  </div>

                  {/* Actions: Navigate + Charge */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={(e) => openRouteModal(st, e)}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1"
                    >
                      <span>📍 Navigate</span>
                    </button>
                    <button
                      onClick={() => openStationDrawer(st)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-xl shadow-md shadow-emerald-900/30 transition flex items-center justify-center gap-1"
                    >
                      <span>Charge ⚡</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide-out Charging Drawer Overlay */}
      {selectedStation && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={closeStationDrawer}
        >
          <div
            className="w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto flex flex-col shadow-2xl animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                  {selectedStation.id}
                </span>
                <h2 className="text-xl font-black text-white mt-2">{selectedStation.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hosted by {selectedStation.host} • 📍 {selectedStation.place}
                </p>
              </div>
              <button
                onClick={closeStationDrawer}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition"
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
    </div>
  );
}
