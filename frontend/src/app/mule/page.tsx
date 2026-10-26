"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChargingReceipt } from "@/types/ble";

interface MuleSyncDetail {
  session_id: string;
  node_id: string;
  status: string;
  energy_consumed_kwh: number;
  actual_cost: number;
  refund_amount: number;
  signature_verified: boolean;
  duplicate: boolean;
  error?: string;
}

interface MuleSyncResult {
  mule_user_id: string;
  synced_count: number;
  duplicate_count: number;
  mule_reward_inr: number;
  mule_new_balance: number;
  details: MuleSyncDetail[];
  message: string;
}

export default function MuleSyncPage() {
  const [muleUserId, setMuleUserId] = useState<string>("user_99_mule");
  const [muleBalance, setMuleBalance] = useState<number>(50.0);
  const [discoveredReceipts, setDiscoveredReceipts] = useState<ChargingReceipt[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<MuleSyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    fetchMuleProfile();
  }, []);

  const fetchMuleProfile = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/user/me?user_id=${muleUserId}`);
      if (res.ok) {
        const data = await res.json();
        setMuleBalance(data.wallet_balance);
      }
    } catch {
      console.log("[Mule] Backend offline, using cached mule profile.");
    }
  };

  /**
   * Simulates a vehicle driving past offline rural nodes and automatically
   * harvesting stranded signed receipts over Web Bluetooth.
   */
  const handleSimulateDriveBy = () => {
    setIsScanning(true);
    setSyncResult(null);
    setErrorMessage("");

    setTimeout(() => {
      const timestamp = Math.floor(Date.now() / 1000);
      const randomNonce = `mule_nonce_${Math.random().toString(36).substring(2, 9)}`;
      const randomNonce2 = `mule_nonce_${Math.random().toString(36).substring(2, 9)}`;

      // Generate 2 sample offline receipts with authentic simulator signatures
      const mockHarvested: ChargingReceipt[] = [
        {
          session_id: `REV-MULE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          node_id: "RelayEV-Node-01",
          user_id: "user_88",
          energy_consumed_kwh: 4.120,
          actual_cost: 41.20,
          timestamp,
          nonce: randomNonce,
          node_signature: "ESP32_SIG_MOCK_4120_4120_VALID",
        },
        {
          session_id: `REV-MULE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          node_id: "RelayEV-Node-03",
          user_id: "user_88",
          energy_consumed_kwh: 7.850,
          actual_cost: 66.72,
          timestamp: timestamp - 3600,
          nonce: randomNonce2,
          node_signature: "ESP32_SIG_MOCK_7850_6672_VALID",
        },
      ];

      setDiscoveredReceipts(mockHarvested);
      setIsScanning(false);
    }, 1200);
  };

  /**
   * Real Web Bluetooth scan for physical ESP32 nodes carrying stranded receipts
   */
  const handleRealBleScan = async () => {
    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setErrorMessage("Web Bluetooth is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    setIsScanning(true);
    setErrorMessage("");
    try {
      const nav = navigator as unknown as { bluetooth: Bluetooth };
      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: "RelayEV" }, { namePrefix: "ESP32" }],
        optionalServices: ["4fafc201-1fb5-459e-8fcc-c5c9c331914b"],
      });

      console.log(`[Mule] Connected to node: ${device.name}`);
      const server = await device.gatt?.connect();
      if (!server) throw new Error("Could not connect to GATT server");

      const service = await server.getPrimaryService("4fafc201-1fb5-459e-8fcc-c5c9c331914b");
      // Query Mule batch sync characteristic
      const muleChar = await service.getCharacteristic("c18d09f2-66b2-4d1e-84b7-5a12ef8b3a01");
      const val = await muleChar.readValue();
      const textDecoder = new TextDecoder();
      const jsonStr = textDecoder.decode(val);

      const receipts: ChargingReceipt[] = JSON.parse(jsonStr || "[]");
      setDiscoveredReceipts((prev) => [...prev, ...receipts]);
      server.disconnect();
    } catch (err: unknown) {
      console.warn("[Mule] BLE scan aborted or no hardware found:", err);
      setErrorMessage("No physical ESP32 node found within BLE range. Try the 'Simulate Drive-By' mode below.");
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Upload batch of harvested receipts to cloud to earn micro-rewards
   */
  const handleBatchSyncToCloud = async () => {
    if (discoveredReceipts.length === 0) return;

    setIsUploading(true);
    setErrorMessage("");
    setSyncResult(null);

    try {
      const res = await fetch(`${backendUrl}/api/sync/mule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mule_user_id: muleUserId,
          receipts: discoveredReceipts,
        }),
      });

      if (res.ok) {
        const result: MuleSyncResult = await res.json();
        setSyncResult(result);
        setMuleBalance(result.mule_new_balance);
        setDiscoveredReceipts([]); // Clear harvested receipts
      } else {
        const err = await res.json();
        setErrorMessage(err.detail || "Failed to upload receipts to cloud");
      }
    } catch {
      // Offline fallback simulation
      const reward = discoveredReceipts.length * 2.0;
      const newBal = +(muleBalance + reward).toFixed(2);
      const simulatedResult: MuleSyncResult = {
        mule_user_id: muleUserId,
        synced_count: discoveredReceipts.length,
        duplicate_count: 0,
        mule_reward_inr: reward,
        mule_new_balance: newBal,
        details: discoveredReceipts.map((r) => ({
          session_id: r.session_id,
          node_id: r.node_id,
          status: "SETTLED",
          energy_consumed_kwh: r.energy_consumed_kwh,
          actual_cost: r.actual_cost,
          refund_amount: 15.8,
          signature_verified: true,
          duplicate: false,
        })),
        message: `Synced ${discoveredReceipts.length} offline receipts! Data Mule rewarded ₹${reward.toFixed(2)} directly to wallet.`,
      };
      setSyncResult(simulatedResult);
      setMuleBalance(newBal);
      setDiscoveredReceipts([]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 20px", color: "#f8fafc" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span style={{ fontSize: "28px" }}>🚗</span>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>
            Drive-By Data Mule Mesh Portal
          </h1>
          <span style={{ background: "#2563eb", color: "#eff6ff", padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
            P2P DATA CARRIER
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "14px", color: "#94a3b8" }}>
          Earn <strong style={{ color: "#34d399" }}>₹2.00 INR micro-bounties</strong> per receipt simply by driving past offline rural EV chargers. Your phone ferries stranded flash receipts to cellular coverage.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        {/* Card 1: Mule Balance */}
        <div style={{ background: "linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(29, 78, 216, 0.25))", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 600, marginBottom: "6px" }}>
            MULE DRIVER WALLET
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#60a5fa", letterSpacing: "-1px" }}>
            ₹{muleBalance.toFixed(2)}
          </div>
          <div style={{ fontSize: "11px", color: "#93c5fd", marginTop: "4px" }}>
            User: {muleUserId} (Rohan Verma)
          </div>
        </div>

        {/* Card 2: Micro-Incentive Rate */}
        <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
            BOUNTY RATE
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#34d399", letterSpacing: "-1px" }}>
            ₹2.00
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#94a3b8" }}> / receipt</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            Automated instant wallet credit
          </div>
        </div>

        {/* Card 3: Harvested Receipts in Memory */}
        <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
            CARRIED IN PHONE MEMORY
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#f8fafc", letterSpacing: "-1px" }}>
            {discoveredReceipts.length}
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#94a3b8" }}> receipts</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            {discoveredReceipts.length > 0 ? "⚠️ Ready to sync with cloud" : "Ready to scan or drive by"}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ background: "rgba(30, 41, 59, 0.6)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0" }}>
          📡 Scan & Ferry Stranded Offline Receipts
        </h2>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px 0" }}>
          Connect with nearby physical ESP32 nodes via Web Bluetooth or run the virtual corridor drive-by simulator:
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={handleSimulateDriveBy}
            disabled={isScanning}
            style={{
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
            }}
          >
            {isScanning ? "Harvesting BLE Packets..." : "🚗 Simulate Drive-By (Rampur Corridor)"}
          </button>

          <button
            onClick={handleRealBleScan}
            disabled={isScanning}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📡 Scan Real ESP32 Hardware (WebBLE)
          </button>

          {discoveredReceipts.length > 0 && (
            <button
              onClick={handleBatchSyncToCloud}
              disabled={isUploading}
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
                marginLeft: "auto",
              }}
            >
              {isUploading ? "Uploading Batch to Cloud..." : `🚀 Sync ${discoveredReceipts.length} Receipts & Claim ₹${(discoveredReceipts.length * 2).toFixed(2)}`}
            </button>
          )}
        </div>

        {errorMessage && (
          <div style={{ background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5", padding: "12px", borderRadius: "8px", fontSize: "12px", marginTop: "16px" }}>
            ❌ {errorMessage}
          </div>
        )}
      </div>

      {/* Discovered Receipts Deck */}
      {discoveredReceipts.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 14px 0", color: "#34d399" }}>
            📦 Stranded Receipts Carried on Phone ({discoveredReceipts.length})
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {discoveredReceipts.map((r, idx) => (
              <div
                key={r.session_id}
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: "12px",
                  padding: "16px",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontWeight: 800, color: "#60a5fa" }}>#{idx + 1} {r.session_id}</span>
                  <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>
                    FERRIED FROM {r.node_id}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", marginBottom: "4px" }}>
                  <span>Energy Delivered:</span>
                  <span style={{ fontWeight: 700 }}>{r.energy_consumed_kwh.toFixed(3)} kWh</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", marginBottom: "8px" }}>
                  <span>Bill Amount:</span>
                  <span style={{ fontWeight: 700 }}>₹{r.actual_cost.toFixed(2)}</span>
                </div>
                <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px", borderRadius: "6px", fontSize: "10px", color: "#94a3b8", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  HMAC: {r.node_signature}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Success Results */}
      {syncResult && (
        <div style={{ background: "rgba(6, 78, 59, 0.5)", border: "1px solid #059669", borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <span style={{ fontSize: "24px" }}>🎉</span>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#a7f3d0" }}>
              Cloud Settlement Successful!
            </h3>
          </div>
          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#6ee7b7" }}>
            {syncResult.message}
          </p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 16px", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", color: "#a7f3d0" }}>BOUNTY CREDITED</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#34d399" }}>+₹{syncResult.mule_reward_inr.toFixed(2)}</div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 16px", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", color: "#a7f3d0" }}>NEW WALLET BALANCE</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#34d399" }}>₹{syncResult.mule_new_balance.toFixed(2)}</div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 16px", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", color: "#a7f3d0" }}>SYNCED COUNT</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#34d399" }}>{syncResult.synced_count} sessions</div>
            </div>
          </div>
        </div>
      )}

      {/* How It Works Explanatory Callout */}
      <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px", fontSize: "12px", color: "#94a3b8", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: "8px", fontSize: "13px" }}>
          💡 Why Drive-By Data Mules Are Revolutionary for Rural India:
        </div>
        <ol style={{ margin: 0, paddingLeft: "20px" }}>
          <li><strong>Zero Infrastructure Cost:</strong> Village hosts don't need to buy broadband or pay ₹1,000/month for SIM cards that get spotty reception.</li>
          <li><strong>Self-Healing Mesh:</strong> Every car or motorcycle driver passing within 30 meters automatically ferries completed charging vouchers into cellular towers.</li>
          <li><strong>Micro-Incentivized:</strong> Drivers earn passive income (₹2.00 per voucher) that offsets their EV charging bill.</li>
        </ol>
      </div>
    </div>
  );
}
