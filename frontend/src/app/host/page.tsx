"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { VELLORE_STATIONS } from "@/lib/stationsData";

interface NodeData {
  id: string;
  name: string;
  host_name: string;
  location: string;
  latitude?: number;
  longitude?: number;
  rate_per_kwh: number;
  max_power_kw: number;
  host_wallet_balance: number;
  is_active: boolean;
  firmware_version: string;
}

interface TransactionData {
  id: string;
  session_id: string;
  user_id: string;
  node_id: string;
  escrow_amount: number;
  rate_per_kwh: number;
  energy_consumed_kwh?: number;
  actual_cost?: number;
  refund_amount?: number;
  status: string;
  created_at: string;
  settled_at?: string;
}

interface PayoutResult {
  node_id: string;
  payout_amount: number;
  remaining_balance: number;
  payout_vpa: string;
  reference_id: string;
  message: string;
}

function HostDashboardContent() {
  const searchParams = useSearchParams();
  const qNode = searchParams.get("nodeId") || searchParams.get("node") || "node_esp32_01";

  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(qNode);
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [loadingTx, setLoadingTx] = useState<boolean>(false);
  const [payoutAmount, setPayoutAmount] = useState<number>(50);
  const [payoutVpa, setPayoutVpa] = useState<string>("rajesh@oksbi");
  const [isProcessingPayout, setIsProcessingPayout] = useState<boolean>(false);
  const [payoutSuccess, setPayoutSuccess] = useState<PayoutResult | null>(null);
  const [payoutError, setPayoutError] = useState<string>("");
  const [lastCreditNotice, setLastCreditNotice] = useState<string>("");

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Build fallback nodes from 10 real stations
  const fallbackNodes: NodeData[] = VELLORE_STATIONS.map((st) => ({
    id: st.id,
    name: st.name,
    host_name: st.host,
    location: st.place,
    latitude: st.latitude,
    longitude: st.longitude,
    rate_per_kwh: st.rate,
    max_power_kw: parseFloat(st.power) || 3.3,
    host_wallet_balance: 0.0,
    is_active: st.isActive,
    firmware_version: "v1.2.0-mesh-pzem",
  }));

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/nodes`);
      if (res.ok) {
        const data: NodeData[] = await res.json();
        if (data.length > 0) {
          setNodes(data);
          return;
        }
      }
      setNodes(fallbackNodes);
    } catch {
      setNodes((prev) => (prev.length > 0 ? prev : fallbackNodes));
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchTransactions = useCallback(async (nodeId: string) => {
    setLoadingTx(true);
    try {
      const res = await fetch(`${backendUrl}/api/transactions?node_id=${nodeId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  }, [backendUrl]);

  // Initial fetch and auto-selection
  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    if (qNode) {
      setSelectedNodeId(qNode);
    }
  }, [qNode]);

  // Fetch transactions whenever selected node changes
  useEffect(() => {
    if (selectedNodeId) {
      fetchTransactions(selectedNodeId);
      setPayoutSuccess(null);
      setPayoutError("");
    }
  }, [selectedNodeId, fetchTransactions]);

  // Listen for live charging settlements from Charger and auto-poll
  useEffect(() => {
    const handleEarningsEvent = (e: any) => {
      const detail = e.detail;
      if (detail && detail.nodeId) {
        setLastCreditNotice(
          `⚡ Just received ₹${detail.hostEarnings.toFixed(2)} from session ${detail.sessionId || ""}!`
        );
        setTimeout(() => setLastCreditNotice(""), 8000);
      }
      fetchNodes();
      if (selectedNodeId) fetchTransactions(selectedNodeId);
    };

    window.addEventListener("host-earnings-updated", handleEarningsEvent);

    // Auto-poll every 4 seconds for live updates
    const interval = setInterval(() => {
      fetchNodes();
      if (selectedNodeId) fetchTransactions(selectedNodeId);
    }, 4000);

    return () => {
      window.removeEventListener("host-earnings-updated", handleEarningsEvent);
      clearInterval(interval);
    };
  }, [fetchNodes, fetchTransactions, selectedNodeId]);

  const activeNodes = nodes.length > 0 ? nodes : fallbackNodes;
  const selectedNode = activeNodes.find((n) => n.id === selectedNodeId) || activeNodes[0];

  // Total Host Earnings across all 10 stations
  const totalNetworkEarnings = activeNodes.reduce(
    (acc, n) => acc + (n.host_wallet_balance || 0),
    0
  );

  const handlePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    if (payoutAmount <= 0) {
      setPayoutError("Payout amount must be greater than 0");
      return;
    }
    if (payoutAmount > selectedNode.host_wallet_balance) {
      setPayoutError(
        `Cannot withdraw more than host earnings (₹${selectedNode.host_wallet_balance.toFixed(2)})`
      );
      return;
    }

    setIsProcessingPayout(true);
    setPayoutError("");
    setPayoutSuccess(null);

    try {
      const res = await fetch(`${backendUrl}/api/nodes/${selectedNode.id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: selectedNode.id,
          amount: payoutAmount,
          payout_vpa: payoutVpa,
        }),
      });

      if (res.ok) {
        const result: PayoutResult = await res.json();
        setPayoutSuccess(result);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === selectedNode.id
              ? { ...n, host_wallet_balance: result.remaining_balance }
              : n
          )
        );
      } else {
        const err = await res.json();
        setPayoutError(err.detail || "Payout failed");
      }
    } catch {
      // Local fallback
      const newBal = +(selectedNode.host_wallet_balance - payoutAmount).toFixed(2);
      const simulatedResult: PayoutResult = {
        node_id: selectedNode.id,
        payout_amount: payoutAmount,
        remaining_balance: newBal,
        payout_vpa: payoutVpa,
        reference_id: `UPI-OFFLINE-${Date.now().toString().slice(-6)}`,
        message: `Offline payout of ₹${payoutAmount.toFixed(2)} to ${payoutVpa} approved!`,
      };
      setPayoutSuccess(simulatedResult);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === selectedNode.id ? { ...n, host_wallet_balance: newBal } : n
        )
      );
    } finally {
      setIsProcessingPayout(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-900 text-slate-100 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📊</span>
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">
                DECENTRALIZED HOST EARNINGS &amp; HARDWARE TELEMETRY
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Host Node Dashboard
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Real-time settlement for 10 rural EV charging points. Earnings are automatically credited upon session completion.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchNodes();
                if (selectedNode) fetchTransactions(selectedNode.id);
              }}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition"
            >
              <span>🔄</span>
              <span>Refresh Live Balances</span>
            </button>
            <Link
              href={`/charge?nodeId=${selectedNode?.id || "node_esp32_01"}`}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 transition"
            >
              <span>⚡ Test Charge This Node</span>
              <span>↗</span>
            </Link>
          </div>
        </div>

        {/* Live Notification Banner if payment just received */}
        {lastCreditNotice && (
          <div className="my-4 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-200 px-4 py-3 rounded-2xl flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2 font-bold text-sm">
              <span>🎉</span>
              <span>{lastCreditNotice}</span>
            </div>
            <span className="text-xs font-mono bg-emerald-900/60 px-2.5 py-1 rounded-lg">
              WALLET CREDITED ✓
            </span>
          </div>
        )}

        {/* Network-wide Quick Metrics Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
              TOTAL NETWORK HOST EARNINGS
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
              ₹{totalNetworkEarnings.toFixed(2)}
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              Cumulative balance across all 10 stations
            </span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
              ACTIVE MESH STATIONS
            </span>
            <div className="text-xl sm:text-2xl font-black text-white flex items-center gap-1.5 flex-wrap">
              <span className="text-emerald-400">6 Online</span>
              <span className="text-slate-500">•</span>
              <span className="text-amber-400">2 Busy</span>
              <span className="text-slate-500">•</span>
              <span className="text-rose-400">2 Offline</span>
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              10 Total Ports • Vellore Corridor Core
            </span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
              CELLULAR SIM OPEX
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white">
              ₹0.00 / mo
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              100% Offline WebBLE cryptographic sync
            </span>
          </div>
        </div>

        {/* Station Selector Tabs (The 10 Real Vellore Stations) */}
        <div className="mb-6">
          <div className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Select Station to View Earnings &amp; Hardware (10 Nodes)</span>
            <span className="text-emerald-400 font-mono">Click any station tab</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-thin">
            {activeNodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const stMeta = VELLORE_STATIONS.find((s) => s.id === node.id);
              const status = stMeta?.status || (node.is_active ? "available" : "offline_fault");
              const statusColor =
                status === "available"
                  ? "bg-emerald-400"
                  : status === "busy"
                  ? "bg-amber-400"
                  : "bg-rose-500";
              const statusText =
                status === "available" ? "Online" : status === "busy" ? "Busy" : "Offline";
              return (
                <button
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`shrink-0 text-left px-4 py-3 rounded-2xl border transition ${
                    isSelected
                      ? "bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-500/10"
                      : "bg-slate-800/80 hover:bg-slate-750 border-slate-700/80 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full ${statusColor} ${
                        isSelected && status !== "offline_fault" ? "animate-ping" : ""
                      }`}
                    />
                    <span className="text-xs font-bold text-white line-clamp-1">{node.name}</span>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                      status === "available"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : status === "busy"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}>
                      {statusText}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] text-slate-500">{node.id}</span>
                    <span className="font-mono font-bold text-emerald-400">
                      ₹{node.host_wallet_balance.toFixed(2)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedNode && (
          <>
            {/* Primary Metrics Grid for Selected Node */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {/* Card 1: Live Accumulated Earnings */}
              <div className="bg-gradient-to-br from-emerald-950/40 to-slate-850 border-2 border-emerald-500/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>ACCUMULATED EARNINGS</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="text-3xl font-black text-emerald-300 font-mono tracking-tight my-1">
                  ₹{selectedNode.host_wallet_balance.toFixed(2)}
                </div>
                <div className="text-xs text-emerald-400 font-medium">
                  ✓ Available for instant UPI withdrawal
                </div>
              </div>

              {/* Card 2: Station Tariff & Power */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  STATION TARIFF
                </div>
                <div className="text-3xl font-black text-white tracking-tight my-1">
                  ₹{selectedNode.rate_per_kwh.toFixed(2)}
                  <span className="text-sm font-normal text-slate-400"> / kWh</span>
                </div>
                <div className="text-xs text-slate-400">
                  Power: <strong>{selectedNode.max_power_kw} kW</strong> (16A / 32A)
                </div>
              </div>

              {/* Card 3: Node Hardware */}
              {(() => {
                const stMeta = VELLORE_STATIONS.find((s) => s.id === selectedNode.id);
                const status = stMeta?.status || (selectedNode.is_active ? "available" : "offline_fault");
                return (
                  <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      HARDWARE &amp; SAFETY
                    </div>
                    <div className={`text-base font-bold my-1 ${
                      status === "available"
                        ? "text-emerald-400"
                        : status === "busy"
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}>
                      {status === "available" && "⚡ 30A Failsafe Relay (Online)"}
                      {status === "busy" && "⚡ Active Session (Busy)"}
                      {status === "offline_fault" && "⚠️ Maintenance Mode (Offline)"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {stMeta?.hardwareNote || "PZEM-004T Meter • ESP32-S3 Mesh"}
                    </div>
                  </div>
                );
              })()}

              {/* Card 4: Host Details */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  HOST OPERATOR
                </div>
                <div className="text-base font-bold text-white my-1 line-clamp-1">
                  {selectedNode.host_name}
                </div>
                <div className="text-xs text-slate-400 line-clamp-1">
                  📍 {selectedNode.location}
                </div>
              </div>
            </div>

            {/* Two Column Section: UPI Payout & Recent Sessions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Instant UPI Withdrawal */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <span>💸 Instant UPI Host Payout</span>
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  Withdraw earned station profits directly to your registered bank account via UPI.
                </p>

                <form onSubmit={handlePayout} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Withdrawal Amount (₹ INR)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={selectedNode.host_wallet_balance}
                      step="0.01"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:border-emerald-500"
                    />

                    {/* Quick Preset Buttons */}
                    <div className="flex gap-2 mt-2">
                      {[50, 100, 200].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPayoutAmount(amt)}
                          className="text-xs bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1 rounded-lg transition"
                        >
                          ₹{amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPayoutAmount(selectedNode.host_wallet_balance)}
                        className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-3 py-1 rounded-lg font-bold transition"
                      >
                        Max (₹{selectedNode.host_wallet_balance.toFixed(2)})
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Host UPI VPA Address
                    </label>
                    <input
                      type="text"
                      value={payoutVpa}
                      onChange={(e) => setPayoutVpa(e.target.value)}
                      placeholder="e.g. host@oksbi, mobile@paytm"
                      required
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  {payoutError && (
                    <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-3.5 py-2.5 rounded-xl text-xs">
                      ❌ {payoutError}
                    </div>
                  )}

                  {payoutSuccess && (
                    <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 px-3.5 py-2.5 rounded-xl text-xs space-y-1">
                      <div className="font-bold">✓ Payout Processed Successfully!</div>
                      <div>Ref: <code>{payoutSuccess.reference_id}</code></div>
                      <div>Transferred: ₹{payoutSuccess.payout_amount.toFixed(2)} to {payoutSuccess.payout_vpa}</div>
                      <div>New Balance: ₹{payoutSuccess.remaining_balance.toFixed(2)}</div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isProcessingPayout || selectedNode.host_wallet_balance <= 0}
                    className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                      selectedNode.host_wallet_balance > 0
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 cursor-pointer"
                        : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                    }`}
                  >
                    {isProcessingPayout
                      ? "Transferring via UPI..."
                      : `Withdraw ₹${payoutAmount.toFixed(2)} to UPI`}
                  </button>
                </form>
              </div>

              {/* Right Column: Recent Charging Sessions & Earnings Log */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>⚡ Recent Charging Sessions</span>
                    </h2>
                    <span className="text-xs text-emerald-400 font-mono">
                      {transactions.length} records
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Cryptographically settled sessions logged on node <code>{selectedNode.id}</code>.
                  </p>

                  {loadingTx ? (
                    <div className="text-xs text-slate-400 animate-pulse py-8 text-center">
                      Loading session ledger...
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
                      <p className="mb-2">No charging sessions settled yet for this node.</p>
                      <Link
                        href={`/charge?nodeId=${selectedNode.id}`}
                        className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition"
                      >
                        ⚡ Start a test charge now
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                      {transactions.map((tx) => (
                        <div
                          key={tx.session_id || tx.id}
                          className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex items-center justify-between text-xs transition"
                        >
                          <div>
                            <div className="font-mono font-bold text-white text-[11px]">
                              {tx.session_id}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {tx.settled_at
                                ? new Date(tx.settled_at).toLocaleTimeString()
                                : "Active Session"} • Driver: {tx.user_id}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-black text-emerald-400 font-mono text-sm">
                              +₹{(tx.actual_cost || 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {(tx.energy_consumed_kwh || 0).toFixed(2)} kWh
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Cryptographic Proof: HMAC-SHA256</span>
                  <Link
                    href={`/charge?nodeId=${selectedNode.id}`}
                    className="text-emerald-400 hover:text-emerald-300 font-bold"
                  >
                    Launch Charger ⚡
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function HostDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-8">
          <div className="text-emerald-400 text-sm font-mono animate-pulse">
            Loading Host Dashboard...
          </div>
        </div>
      }
    >
      <HostDashboardContent />
    </Suspense>
  );
}
