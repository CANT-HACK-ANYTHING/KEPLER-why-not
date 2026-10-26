"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChargingSessionManager } from "@/components/ChargingSessionManager";
import { VELLORE_STATIONS, getStationById, StationDetails } from "@/lib/stationsData";

function ChargeContent() {
  const searchParams = useSearchParams();
  const qNode = searchParams.get("nodeId") || searchParams.get("node") || "node_esp32_01";
  const [selectedNodeId, setSelectedNodeId] = useState<string>(qNode);
  const [hostBalances, setHostBalances] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (qNode) {
      setSelectedNodeId(qNode);
    }
  }, [qNode]);

  useEffect(() => {
    fetchNodeBalances();
    const handleUpdate = () => {
      fetchNodeBalances();
    };
    window.addEventListener("host-earnings-updated", handleUpdate);
    return () => window.removeEventListener("host-earnings-updated", handleUpdate);
  }, []);

  const fetchNodeBalances = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("http://localhost:8000/api/nodes");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, number> = {};
        data.forEach((n: any) => {
          map[n.id] = n.host_wallet_balance || 0.0;
        });
        setHostBalances(map);
      }
    } catch {
      // Backend offline fallback
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentStation: StationDetails = getStationById(selectedNodeId);
  const currentHostBalance = hostBalances[currentStation.id] || 0.0;

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Link
              href="/map"
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition"
            >
              <span>←</span>
              <span>Back to Hex Mesh Map</span>
            </Link>
            <span className="text-slate-600">•</span>
            <Link
              href="/host"
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
            >
              <span>Host Dashboard 📊</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Web Bluetooth GATT Active · Zero SIM OPEX
            </span>
          </div>
        </div>

        {/* Station Selection Banner */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 mb-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 mb-1">
                SELECT CHARGING STATION (1 OF 10 AVAILABLE)
              </div>
              <h2 className="text-lg font-bold text-white">
                Choose Station to Connect &amp; Power
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Current Host Earnings:</span>
              <span className="text-sm font-black text-emerald-400 bg-slate-900 px-3 py-1 rounded-xl border border-slate-700 font-mono">
                ₹{currentHostBalance.toFixed(2)}
              </span>
              <button
                onClick={fetchNodeBalances}
                title="Refresh balances"
                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 p-1.5 rounded-lg transition"
              >
                {isRefreshing ? "⏳" : "🔄"}
              </button>
            </div>
          </div>

          {/* Station Pills Carousel */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {VELLORE_STATIONS.map((st) => {
              const isSelected = st.id === currentStation.id;
              const balance = hostBalances[st.id] || 0.0;
              return (
                <button
                  key={st.id}
                  onClick={() => setSelectedNodeId(st.id)}
                  className={`shrink-0 text-left px-3.5 py-2.5 rounded-xl border transition ${
                    isSelected
                      ? "bg-emerald-500/20 border-emerald-500 text-white shadow-md shadow-emerald-500/10"
                      : "bg-slate-900/60 hover:bg-slate-700/60 border-slate-700 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? "bg-emerald-400" : "bg-slate-500"
                      }`}
                    />
                    <span className="text-xs font-bold">{st.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between gap-3">
                    <span>₹{st.rate.toFixed(2)}/kWh</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      Host: ₹{balance.toFixed(2)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Station Highlight Card */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-850 border border-slate-700/80 rounded-2xl p-5 mb-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                {currentStation.id}
              </span>
              <span className="text-xs text-slate-400">⚡ {currentStation.power}</span>
            </div>
            <h3 className="text-xl font-black text-white mt-1.5">{currentStation.name}</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Hosted by <strong>{currentStation.host}</strong> • 📍 {currentStation.place}
            </p>
            <p className="text-xs text-slate-400 mt-1 italic">✓ {currentStation.hardwareNote}</p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Station Tariff</span>
              <span className="text-2xl font-black text-white">
                ₹{currentStation.rate.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400"> / kWh</span>
            </div>
            <Link
              href={`/host?nodeId=${currentStation.id}`}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition"
            >
              <span>View Host Dashboard</span>
              <span>↗</span>
            </Link>
          </div>
        </div>

        {/* Main Charging Session Manager Component */}
        <ChargingSessionManager
          initialNodeId={currentStation.id}
          initialNodeName={currentStation.name}
          ratePerKwh={currentStation.rate}
          hostName={currentStation.host}
          location={currentStation.place}
          onHostEarningsUpdated={() => fetchNodeBalances()}
        />

        {/* Architectural Explanations for Demo & Judges */}
        <div className="mt-8 bg-slate-800/60 border border-slate-700/80 rounded-2xl p-6 text-slate-300">
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <span>⚡ How Peer-to-Peer Offline Charging &amp; Host Settlement Works</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-400">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <strong className="text-emerald-400 block mb-1">
                1. Driver Pre-Escrow Voucher
              </strong>
              Before plugging in, the driver&apos;s phone locks escrow. A signed JWT voucher is passed locally to the ESP32 over Web Bluetooth without cellular internet.
            </div>
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <strong className="text-emerald-400 block mb-1">
                2. Instant Host Earnings Reflection
              </strong>
              Upon session stop, the ESP32 signs an HMAC-SHA256 receipt. Settlement immediately credits the host&apos;s wallet balance, visible in the Host Dashboard.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ChargePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-8">
          <div className="text-emerald-400 text-sm font-mono animate-pulse">
            Loading RelayEV Charger...
          </div>
        </div>
      }
    >
      <ChargeContent />
    </Suspense>
  );
}
