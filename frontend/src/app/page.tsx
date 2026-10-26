"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChargingNode, UserProfile } from "@/types";
import StationDrawer from "@/components/StationDrawer";
import { 
  Zap, 
  Wallet, 
  ShieldCheck, 
  RefreshCw, 
  WifiOff, 
  Smartphone,
  Navigation
} from "lucide-react";

// Dynamically import Leaflet Map to avoid SSR window issues
const MapViewer = dynamic(() => import("@/components/MapViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[450px] rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-3">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs">Initializing Offline Mesh Geodata...</span>
    </div>
  ),
});

export default function Home() {
  const [nodes, setNodes] = useState<ChargingNode[]>([
    {
      id: "node_esp32_01",
      name: "Dharwad Agri-Solar Hub",
      address_reference: "NH-48 Bypass, Dharwad Rural",
      latitude: 15.4589,
      longitude: 75.0078,
      tariff_per_kwh: 12.5,
      max_power_kw: 3.3,
      status: "available",
    },
    {
      id: "node_esp32_02",
      name: "Alnavar Forest Station",
      address_reference: "Main Junction, Alnavar",
      latitude: 15.4342,
      longitude: 74.7351,
      tariff_per_kwh: 14.0,
      max_power_kw: 7.2,
      status: "available",
    },
    {
      id: "node_esp32_03",
      name: "Kalghatgi Cooperative",
      address_reference: "Near Gram Panchayat Office",
      latitude: 15.1783,
      longitude: 74.9744,
      tariff_per_kwh: 10.0,
      max_power_kw: 3.3,
      status: "available",
    },
  ]);

  const [selectedNode, setSelectedNode] = useState<ChargingNode | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    id: "user_88",
    full_name: "Rural EV Driver (Test)",
    wallet_balance: 1000.0,
    locked_escrow_balance: 0.0,
  });

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // Fetch live nodes from backend or fallback
  const fetchNodes = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/nodes`);
      if (res.ok) {
        const data = await res.json();
        if (data.nodes && data.nodes.length > 0) {
          setNodes(data.nodes);
        }
      }
    } catch {
      // Local fallback preserves UI state
    }
  };

  useEffect(() => {
    fetchNodes();
  }, []);

  const handleSessionComplete = (refund: number, cost: number, kwh: number) => {
    setUserProfile((prev) => ({
      ...prev,
      wallet_balance: Number((prev.wallet_balance - cost).toFixed(2)),
    }));
    fetchNodes();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto relative border-x border-slate-900 shadow-2xl">
      {/* Top App Header */}
      <header className="px-5 pt-4 pb-3 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-lg text-slate-950 shadow-md">
            <Zap className="w-4 h-4 fill-current font-extrabold" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight leading-none text-white">RelayEV</h1>
            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <WifiOff className="w-2.5 h-2.5" /> Offline Mesh
            </span>
          </div>
        </div>

        {/* User Balance Badge */}
        <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60 shadow-inner">
          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
          <div className="text-right leading-tight">
            <span className="text-[9px] text-slate-400 block font-medium">Balance</span>
            <span className="text-xs font-bold text-emerald-300">₹{userProfile.wallet_balance.toFixed(2)}</span>
          </div>
        </div>
      </header>

      {/* Main Map View Area */}
      <div className="flex-1 p-3 flex flex-col gap-3 min-h-[480px]">
        {/* Banner */}
        <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/20 px-3.5 py-2.5 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Cryptographic WebBLE Escrow Active</span>
          </div>
          <button
            onClick={fetchNodes}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Refresh Stations"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative rounded-2xl overflow-hidden min-h-[380px]">
          <MapViewer
            nodes={nodes}
            selectedNode={selectedNode}
            onSelectNode={(node) => setSelectedNode(node)}
          />
        </div>

        {/* Bottom Drawer if Station Selected */}
        {selectedNode && (
          <div className="animate-in slide-in-from-bottom duration-300">
            <StationDrawer
              node={selectedNode}
              userBalance={userProfile.wallet_balance}
              onClose={() => setSelectedNode(null)}
              onSessionComplete={handleSessionComplete}
            />
          </div>
        )}
      </div>

      {/* Mobile Footer Status */}
      <footer className="px-5 py-2.5 bg-slate-900/60 border-t border-slate-900 text-center text-[10px] text-slate-500 flex items-center justify-center gap-2">
        <Smartphone className="w-3 h-3 text-emerald-500" />
        <span>APK Ready • Web Bluetooth Hardware Bridge</span>
      </footer>
    </main>
  );
}
