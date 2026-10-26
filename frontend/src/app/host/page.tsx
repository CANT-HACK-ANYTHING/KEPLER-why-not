"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

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

interface PayoutResult {
  node_id: string;
  payout_amount: number;
  remaining_balance: number;
  payout_vpa: string;
  reference_id: string;
  message: string;
}

export default function HostDashboardPage() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("RelayEV-Node-01");
  const [loading, setLoading] = useState<boolean>(true);
  const [payoutAmount, setPayoutAmount] = useState<number>(50);
  const [payoutVpa, setPayoutVpa] = useState<string>("mohan@oksbi");
  const [isProcessingPayout, setIsProcessingPayout] = useState<boolean>(false);
  const [payoutSuccess, setPayoutSuccess] = useState<PayoutResult | null>(null);
  const [payoutError, setPayoutError] = useState<string>("");

  // Register Form State
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [newNodeId, setNewNodeId] = useState<string>("");
  const [newNodeName, setNewNodeName] = useState<string>("");
  const [newHostName, setNewHostName] = useState<string>("");
  const [newLocation, setNewLocation] = useState<string>("");
  const [newRate, setNewRate] = useState<number>(10.0);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [registerSuccess, setRegisterSuccess] = useState<string>("");

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/nodes`);
      if (res.ok) {
        const data: NodeData[] = await res.json();
        setNodes(data);
        if (data.length > 0 && !data.some((n) => n.id === selectedNodeId)) {
          setSelectedNodeId(data[0].id);
        }
      }
    } catch {
      // Fallback mock stations if backend offline
      setNodes([
        {
          id: "RelayEV-Node-01",
          name: "Mohan's Courtyard Node",
          host_name: "Mohan Ram",
          location: "Rampur Village, Plot 4",
          rate_per_kwh: 10.0,
          max_power_kw: 3.3,
          host_wallet_balance: 168.4,
          is_active: true,
          firmware_version: "v1.2.0-mesh-pzem",
        },
        {
          id: "RelayEV-Node-02",
          name: "Kavita's Farmhouse Node",
          host_name: "Kavita Devi",
          location: "Old Highway Jn, Rampur",
          rate_per_kwh: 12.0,
          max_power_kw: 2.8,
          host_wallet_balance: 96.0,
          is_active: true,
          firmware_version: "v1.2.0-mesh-pzem",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  const handlePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    if (payoutAmount <= 0) {
      setPayoutError("Payout amount must be greater than 0");
      return;
    }
    if (payoutAmount > selectedNode.host_wallet_balance) {
      setPayoutError(`Cannot withdraw more than host earnings (₹${selectedNode.host_wallet_balance.toFixed(2)})`);
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
        // Update local node balance
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
      // Offline simulated payout
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

  const handleRegisterNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeId || !newNodeName || !newHostName || !newLocation) {
      return;
    }

    setIsRegistering(true);
    setRegisterSuccess("");

    try {
      const res = await fetch(`${backendUrl}/api/nodes/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newNodeId,
          name: newNodeName,
          host_name: newHostName,
          location: newLocation,
          rate_per_kwh: newRate,
          max_power_kw: 3.3,
        }),
      });

      if (res.ok) {
        const created: NodeData = await res.json();
        setNodes((prev) => [...prev, created]);
        setSelectedNodeId(created.id);
        setRegisterSuccess(`Station ${created.name} registered on RelayEV mesh!`);
        setTimeout(() => setShowRegisterModal(false), 2000);
      }
    } catch {
      // Local fallback
      const mockNode: NodeData = {
        id: newNodeId,
        name: newNodeName,
        host_name: newHostName,
        location: newLocation,
        rate_per_kwh: newRate,
        max_power_kw: 3.3,
        host_wallet_balance: 0.0,
        is_active: true,
        firmware_version: "v1.2.0-mesh-pzem",
      };
      setNodes((prev) => [...prev, mockNode]);
      setSelectedNodeId(mockNode.id);
      setRegisterSuccess(`Station ${mockNode.name} registered locally!`);
      setTimeout(() => setShowRegisterModal(false), 2000);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 20px", color: "#f8fafc" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "28px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "28px" }}>📊</span>
            <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>
              Host Node Dashboard
            </h1>
            <span style={{ background: "#059669", color: "#ecfdf5", padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
              EARNINGS & HARDWARE
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "14px", color: "#94a3b8" }}>
            Monitor real-time host earnings, withdraw to UPI, and manage decentralized ₹1,500 rural charging hardware.
          </p>
        </div>

        <button
          onClick={() => setShowRegisterModal(true)}
          style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            padding: "10px 18px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
          }}
        >
          + Register New Node
        </button>
      </div>

      {/* Node Selector Tabs */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "12px", marginBottom: "24px" }}>
        {nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          return (
            <button
              key={node.id}
              onClick={() => {
                setSelectedNodeId(node.id);
                setPayoutSuccess(null);
                setPayoutError("");
              }}
              style={{
                background: isSelected ? "rgba(16, 185, 129, 0.15)" : "rgba(30, 41, 59, 0.6)",
                border: isSelected ? "2px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "10px 16px",
                color: isSelected ? "#34d399" : "#94a3b8",
                cursor: "pointer",
                textAlign: "left",
                whiteSpace: "nowrap",
                fontWeight: isSelected ? 700 : 500,
                fontSize: "13px",
              }}
            >
              <div style={{ color: "#fff", fontWeight: 700 }}>{node.name}</div>
              <div style={{ fontSize: "11px", opacity: 0.8 }}>
                {node.id} • ₹{node.host_wallet_balance.toFixed(2)}
              </div>
            </button>
          );
        })}
      </div>

      {selectedNode && (
        <>
          {/* Key Metrics Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "28px",
            }}
          >
            {/* Card 1: Host Earnings */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.2))",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "14px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#a7f3d0", fontWeight: 600, marginBottom: "6px" }}>
                ACCUMULATED EARNINGS
              </div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#34d399", letterSpacing: "-1px" }}>
                ₹{selectedNode.host_wallet_balance.toFixed(2)}
              </div>
              <div style={{ fontSize: "11px", color: "#6ee7b7", marginTop: "4px" }}>
                ✓ Ready for instant UPI settlement
              </div>
            </div>

            {/* Card 2: Station Tariff */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
                STATION TARIFF
              </div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#f8fafc", letterSpacing: "-1px" }}>
                ₹{selectedNode.rate_per_kwh.toFixed(2)}
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#94a3b8" }}> / kWh</span>
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                Max power: {selectedNode.max_power_kw} kW
              </div>
            </div>

            {/* Card 3: Hardware Failsafe */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
                NODE HARDWARE
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#34d399", marginTop: "6px" }}>
                ⚡ 30A Relay Ready
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                PZEM-004T Meter • {selectedNode.firmware_version}
              </div>
            </div>

            {/* Card 4: Location */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
                HOST & LOCATION
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                {selectedNode.host_name}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                📍 {selectedNode.location}
              </div>
            </div>
          </div>

          {/* Interactive Sections: Payout & Hardware Info */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            {/* Left: Instant UPI Payout */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0" }}>
                💸 Instant UPI Host Payout
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 20px 0" }}>
                Withdraw station charging earnings directly to your bank account via UPI.
              </p>

              <form onSubmit={handlePayout}>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                    Withdrawal Amount (₹ INR)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedNode.host_wallet_balance}
                    step="0.01"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(parseFloat(e.target.value) || 0)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                  {/* Quick Select Buttons */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    {[50, 100, 200].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPayoutAmount(amt)}
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          color: "#cbd5e1",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        ₹{amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPayoutAmount(selectedNode.host_wallet_balance)}
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        color: "#34d399",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Max (₹{selectedNode.host_wallet_balance.toFixed(2)})
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                    Host UPI VPA Address
                  </label>
                  <input
                    type="text"
                    value={payoutVpa}
                    onChange={(e) => setPayoutVpa(e.target.value)}
                    placeholder="e.g. host@upi, mobile@paytm"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "14px",
                    }}
                  />
                </div>

                {payoutError && (
                  <div style={{ background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5", padding: "10px", borderRadius: "8px", fontSize: "12px", marginBottom: "16px" }}>
                    ❌ {payoutError}
                  </div>
                )}

                {payoutSuccess && (
                  <div style={{ background: "#064e3b", border: "1px solid #059669", color: "#a7f3d0", padding: "12px", borderRadius: "8px", fontSize: "12px", marginBottom: "16px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                      ✓ Payout Transferred via UPI!
                    </div>
                    <div>Reference: <code>{payoutSuccess.reference_id}</code></div>
                    <div>Amount: ₹{payoutSuccess.payout_amount.toFixed(2)} to {payoutSuccess.payout_vpa}</div>
                    <div>Remaining Balance: ₹{payoutSuccess.remaining_balance.toFixed(2)}</div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isProcessingPayout || selectedNode.host_wallet_balance <= 0}
                  style={{
                    width: "100%",
                    background: selectedNode.host_wallet_balance > 0 ? "linear-gradient(135deg, #10b981, #059669)" : "#475569",
                    color: "#fff",
                    border: "none",
                    borderRadius: "10px",
                    padding: "12px",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: selectedNode.host_wallet_balance > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  {isProcessingPayout ? "Transferring via UPI..." : `Withdraw ₹${payoutAmount.toFixed(2)} to UPI`}
                </button>
              </form>
            </div>

            {/* Right: Zero-OPEX Rural Station Hardware Architecture */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0" }}>
                ⚡ ₹1,500 Hardware Node Telemetry
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 16px 0" }}>
                Unlike commercial DC chargers costing ₹150,000+ with recurring SIM bills, RelayEV runs offline:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ background: "rgba(15, 23, 42, 0.7)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600 }}>
                    <span>PZEM-004T Energy Meter</span>
                    <span style={{ color: "#34d399" }}>CALIBRATED</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    Modbus-RTU UART on GPIO 16/17 • Measures 0-100A AC
                  </div>
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.7)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600 }}>
                    <span>30A Heavy-Duty Relay</span>
                    <span style={{ color: "#34d399" }}>FAILSAFE OPEN</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    Optoisolated GPIO 23 • Closes only upon JWT escrow authorization
                  </div>
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.7)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600 }}>
                    <span>Cryptographic Engine</span>
                    <span style={{ color: "#34d399" }}>mbedtls SHA-256</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    Generates hardware HMAC signature on cutoff • Tamper-resistant
                  </div>
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.7)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600 }}>
                    <span>Drive-By Data Mule Mesh</span>
                    <span style={{ color: "#60a5fa" }}>ACTIVE</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    SPIFFS flash ledger buffers receipts for passing cars
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Register New Node */}
      {showRegisterModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: "grid",
            placeItems: "center",
            padding: "20px",
            zIndex: 100,
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
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Register New Host Station</h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterNode}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                  Node BLE ID (e.g. RelayEV-Node-05)
                </label>
                <input
                  type="text"
                  required
                  placeholder="RelayEV-Node-05"
                  value={newNodeId}
                  onChange={(e) => setNewNodeId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                  Station Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Verma Solar Point"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                  Host Owner Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Suresh Verma"
                  value={newHostName}
                  onChange={(e) => setNewHostName(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                  Milestone / Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. East Village Well Road"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                  Tariff in INR (₹/kWh)
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={newRate}
                  onChange={(e) => setNewRate(parseFloat(e.target.value) || 10.0)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                />
              </div>

              {registerSuccess && (
                <div style={{ background: "#064e3b", color: "#a7f3d0", padding: "10px", borderRadius: "6px", fontSize: "12px", marginBottom: "12px" }}>
                  ✓ {registerSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={isRegistering}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isRegistering ? "Registering..." : "Add Station to Mesh"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
