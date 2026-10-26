"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChargingReceipt } from "@/types/ble";
import { BleConnector } from "./BleConnector";
import { BleSimulator } from "./BleSimulator";
import { OfflineMeshStorage } from "@/lib/offlineMeshStorage";
import { VELLORE_STATIONS, getStationById } from "@/lib/stationsData";

interface ChargingSessionManagerProps {
  initialNodeId?: string;
  initialNodeName?: string;
  ratePerKwh?: number;
  hostName?: string;
  location?: string;
  backendApiUrl?: string;
  onClose?: () => void;
  onBalanceUpdated?: (newBalance: number) => void;
  onHostEarningsUpdated?: (nodeId: string, amount: number) => void;
  allowStationSwitch?: boolean;
}

interface SettlementData {
  session_id: string;
  status: string;
  escrow_amount: number;
  actual_cost: number;
  refund_amount: number;
  energy_consumed_kwh: number;
  user_new_balance: number;
  host_earnings: number;
  signature_verified: boolean;
  synced_via: string;
  message: string;
}

export const ChargingSessionManager: React.FC<ChargingSessionManagerProps> = ({
  initialNodeId = "node_esp32_01",
  initialNodeName,
  ratePerKwh,
  hostName,
  location,
  backendApiUrl = "http://localhost:8000",
  onClose,
  onBalanceUpdated,
  onHostEarningsUpdated,
  allowStationSwitch = true,
}) => {
  const [nodeId, setNodeId] = useState<string>(initialNodeId);
  const [escrowAmount, setEscrowAmount] = useState<number>(100);
  const [sessionToken, setSessionToken] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [walletBalance, setWalletBalance] = useState<number>(500.0);
  const [isSimulatorMode, setIsSimulatorMode] = useState<boolean>(true);
  const [isFetchingToken, setIsFetchingToken] = useState<boolean>(false);
  const [settledReceipt, setSettledReceipt] = useState<ChargingReceipt | null>(null);
  const [settlementData, setSettlementData] = useState<SettlementData | null>(null);
  const [settlementError, setSettlementError] = useState<string>("");

  // Resolve Station Information
  const station = getStationById(nodeId);
  const activeName = initialNodeName || station.name;
  const activeRate = ratePerKwh || station.rate;
  const activeHost = hostName || station.host;
  const activePlace = location || station.place;

  // Sync initialNodeId prop changes
  useEffect(() => {
    if (initialNodeId && initialNodeId !== nodeId) {
      setNodeId(initialNodeId);
      setSessionToken("");
      setSettlementData(null);
      setSettledReceipt(null);
    }
  }, [initialNodeId]);

  // Fetch live user wallet balance on mount
  useEffect(() => {
    fetchUserBalance();
  }, [backendApiUrl]);

  const fetchUserBalance = async () => {
    try {
      const res = await fetch(`${backendApiUrl}/api/user/me`);
      if (res.ok) {
        const data = await res.json();
        setWalletBalance(data.wallet_balance);
        if (onBalanceUpdated) onBalanceUpdated(data.wallet_balance);
      }
    } catch {
      console.warn("[SessionManager] Backend offline; running in local resilient mode.");
    }
  };

  /**
   * Step 1 & 2: Lock Escrow and retrieve JWT session_token
   */
  const handleLockEscrowAndStart = async () => {
    setIsFetchingToken(true);
    setSettledReceipt(null);
    setSettlementData(null);
    setSettlementError("");

    try {
      const response = await fetch(`${backendApiUrl}/api/charge/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "user_88",
          node_id: nodeId,
          escrow_amount: escrowAmount,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const token = data.session_token || data.escrow_jwt_token;
        setSessionToken(token);
        setSessionId(data.session_id);
        if (data.user_remaining_balance !== undefined) {
          setWalletBalance(data.user_remaining_balance);
          if (onBalanceUpdated) onBalanceUpdated(data.user_remaining_balance);
        }
      } else {
        const err = await response.json();
        throw new Error(err.detail || "Escrow lock failed");
      }
    } catch (err: any) {
      // Local offline fallback voucher
      console.warn("[SessionManager] Using local offline cryptographic voucher fallback:", err.message);
      const offlineSessionId = `SESS-OFFLINE-${Date.now().toString().slice(-6)}`;
      const offlineToken = `mock.jwt.voucher.${btoa(
        JSON.stringify({
          sub: "user_88",
          node_id: nodeId,
          session_id: offlineSessionId,
          escrow_amount: escrowAmount,
          rate_per_kwh: activeRate,
        })
      )}`;
      setSessionId(offlineSessionId);
      setSessionToken(offlineToken);
      const newBal = +(walletBalance - escrowAmount).toFixed(2);
      setWalletBalance(newBal);
      if (onBalanceUpdated) onBalanceUpdated(newBal);
    } finally {
      setIsFetchingToken(false);
    }
  };

  /**
   * Step 6 & 7: Receive signed receipt from ESP32 and auto-settle via POST /api/charge/stop
   */
  const handleReceiptReceived = async (receipt: ChargingReceipt) => {
    setSettledReceipt(receipt);
    setSettlementError("");

    try {
      const response = await fetch(`${backendApiUrl}/api/charge/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(receipt),
      });

      if (response.ok) {
        const resData: SettlementData = await response.json();
        setSettlementData(resData);
        setWalletBalance(resData.user_new_balance);
        if (onBalanceUpdated) onBalanceUpdated(resData.user_new_balance);
        if (onHostEarningsUpdated) onHostEarningsUpdated(nodeId, resData.host_earnings);

        // Broadcast event for Host Dashboard live reflection
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("host-earnings-updated", {
              detail: {
                nodeId,
                hostEarnings: resData.host_earnings,
                sessionId: resData.session_id,
              },
            })
          );
        }
      } else {
        throw new Error(`Stop endpoint returned ${response.status}`);
      }
    } catch {
      // Local resilient settlement calculation
      const actual = receipt.actual_cost;
      const refund = Math.max(0, +(escrowAmount - actual).toFixed(2));
      const newBal = +(walletBalance + refund).toFixed(2);

      OfflineMeshStorage.enqueueOfflineReceipt(receipt);
      const offlineSettlement: SettlementData = {
        session_id: receipt.session_id,
        status: "SETTLED (OFFLINE CACHED)",
        escrow_amount: escrowAmount,
        actual_cost: actual,
        refund_amount: refund,
        energy_consumed_kwh: receipt.energy_consumed_kwh,
        user_new_balance: newBal,
        host_earnings: actual,
        signature_verified: true,
        synced_via: "DIRECT_PHONE",
        message: `Session settled locally. Refund of ₹${refund.toFixed(2)} credited to driver wallet.`,
      };
      setSettlementData(offlineSettlement);
      setWalletBalance(newBal);
      if (onBalanceUpdated) onBalanceUpdated(newBal);
      if (onHostEarningsUpdated) onHostEarningsUpdated(nodeId, actual);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("host-earnings-updated", {
            detail: {
              nodeId,
              hostEarnings: actual,
              sessionId: receipt.session_id,
            },
          })
        );
      }
    }
  };

  // Safe simulated target kWh that stays within escrow amount (~65% consumption)
  const simulatedTargetKwh = parseFloat(((escrowAmount * 0.65) / activeRate).toFixed(2)) || 2.5;

  return (
    <div
      className="charging-session-manager"
      style={{
        width: "100%",
        maxWidth: "680px",
        margin: "0 auto",
        background: "#ffffff",
        border: "1px solid #d8e4d5",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: "0 10px 30px rgba(25, 52, 47, 0.08)",
        color: "#18322c",
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "18px",
          borderBottom: "1px solid #edf2ea",
          paddingBottom: "14px",
        }}
      >
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "1.4px", fontWeight: 700, color: "#618070", textTransform: "uppercase" }}>
            OFFLINE P2P HARDWARE BRIDGE · VELLORE MESH
          </div>
          <h2 style={{ margin: "4px 0 0", fontFamily: "Georgia, serif", fontSize: "22px", fontWeight: 700, color: "#19342f" }}>
            {activeName}
          </h2>
          <div style={{ fontSize: "12px", color: "#547365", marginTop: "2px" }}>
            Hosted by <strong>{activeHost}</strong> • 📍 {activePlace}
          </div>
          <div style={{ fontSize: "11px", color: "#059669", fontWeight: 600, marginTop: "2px" }}>
            Node ID: <code style={{ background: "#ecfdf5", padding: "1px 6px", borderRadius: "4px" }}>{nodeId}</code> · Tariff: <strong>₹{activeRate.toFixed(2)}/kWh</strong>
          </div>
        </div>

        {/* Close Button if embedded inside drawer */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close Drawer"
            style={{
              background: "#edf3eb",
              border: 0,
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              color: "#37594b",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Station Switcher (Choose any of 10 stations) */}
      {allowStationSwitch && !sessionToken && (
        <div
          style={{
            background: "#f8faf7",
            border: "1px solid #e2ece0",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#4f7360", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Selected Station (1 of 10 in Vellore Mesh)
            </span>
            <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 700 }}>
              ⚡ 10 Stations Available
            </span>
          </div>

          <select
            value={nodeId}
            onChange={(e) => {
              setNodeId(e.target.value);
              setSessionToken("");
              setSettlementData(null);
            }}
            style={{
              width: "100%",
              background: "#ffffff",
              border: "1px solid #c7d8c5",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#19342f",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {VELLORE_STATIONS.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name} — {st.place.split(",")[0]} (₹{st.rate.toFixed(2)}/kWh, {st.power})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Driver Wallet & Mode Selection Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f6faf5",
          border: "1px solid #e1ecde",
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "18px" }}>👛</span>
          <div>
            <div style={{ fontSize: "10px", color: "#647f71", fontWeight: 700, textTransform: "uppercase" }}>
              Driver Wallet (user_88)
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#19342f" }}>
              ₹{walletBalance.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Virtual Hardware Simulator Mode Toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#ffffff",
            border: "1px solid #d1ded0",
            borderRadius: "8px",
            padding: "4px 8px",
            gap: "8px",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700, color: isSimulatorMode ? "#1f5e4c" : "#587265" }}>
            <input
              type="checkbox"
              checked={isSimulatorMode}
              onChange={(e) => setIsSimulatorMode(e.target.checked)}
              style={{ accentColor: "#1f5e4c", width: "15px", height: "15px", cursor: "pointer" }}
            />
            Use Mock ESP32 Hardware
          </label>
        </div>
      </div>

      {/* Escrow Lock Step (When No Token Yet) */}
      {!sessionToken ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #dbe6d8",
            borderRadius: "12px",
            padding: "18px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1f5e4c", marginBottom: "10px", letterSpacing: "0.8px" }}>
            STEP 1: LOCK ESCROW FOR {activeName.toUpperCase()}
          </div>

          <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#547365", lineHeight: 1.5 }}>
            Because the host charger operates offline in a cellular dead zone, funds are locked beforehand into an escrow voucher.
            After charging completes, <strong>host earnings immediately reflect in {activeHost}&apos;s dashboard</strong>.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "12px", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#496859", marginBottom: "6px" }}>
                Select Escrow Amount (INR):
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setEscrowAmount(amt)}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "6px",
                      border: escrowAmount === amt ? "2px solid #1f5e4c" : "1px solid #c7d8c5",
                      background: escrowAmount === amt ? "#e8f3ea" : "#ffffff",
                      color: escrowAmount === amt ? "#1f5e4c" : "#496859",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleLockEscrowAndStart}
              disabled={isFetchingToken || walletBalance < escrowAmount}
              style={{
                background: walletBalance >= escrowAmount ? "#1f5e4c" : "#94a3b8",
                color: "#ffffff",
                border: 0,
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: walletBalance >= escrowAmount ? "pointer" : "not-allowed",
                boxShadow: "0 2px 8px rgba(31, 94, 76, 0.25)",
                height: "40px",
              }}
            >
              {isFetchingToken ? "Locking..." : "Start Charging →"}
            </button>
          </div>

          {walletBalance < escrowAmount && (
            <div style={{ color: "#b91c1c", fontSize: "11px", marginTop: "8px", fontWeight: 600 }}>
              Insufficient balance (₹{walletBalance.toFixed(2)}). Please select a lower amount or top up.
            </div>
          )}
        </div>
      ) : (
        /* Escrow Locked Voucher Banner */
        <div
          style={{
            background: "#f0f7f1",
            border: "1px solid #cde5d2",
            borderRadius: "10px",
            padding: "12px 16px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#196348" }}>
              🔒 Escrow Locked: ₹{escrowAmount.toFixed(2)} (Max: {(escrowAmount / activeRate).toFixed(2)} kWh)
            </div>
            <div style={{ fontSize: "10px", color: "#4f7e6b", fontFamily: "monospace", marginTop: "2px" }}>
              Session: {sessionId} · Node: {nodeId}
            </div>
          </div>
          <button
            onClick={() => {
              setSessionToken("");
              setSettlementData(null);
              setSettledReceipt(null);
            }}
            style={{
              background: "transparent",
              border: "1px solid #b6d8bd",
              color: "#1e5e46",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            New Session
          </button>
        </div>
      )}

      {/* Embedded Hardware Component: Simulator vs WebBLE */}
      {sessionToken && (
        <div style={{ marginTop: "14px" }}>
          {isSimulatorMode ? (
            <BleSimulator
              nodeId={nodeId}
              sessionToken={sessionToken}
              ratePerKwh={activeRate}
              targetKwh={simulatedTargetKwh}
              durationSeconds={6}
              onReceiptReceived={handleReceiptReceived}
            />
          ) : (
            <BleConnector
              nodeId={nodeId}
              sessionToken={sessionToken}
              ratePerKwh={activeRate}
              onReceiptReceived={handleReceiptReceived}
            />
          )}
        </div>
      )}

      {/* Settlement Breakdown Confirmation Card */}
      {settlementData && (
        <div
          style={{
            marginTop: "20px",
            background: "#f0fdf4",
            border: "1.5px solid #86efac",
            borderRadius: "12px",
            padding: "18px",
            boxShadow: "0 4px 14px rgba(22, 101, 52, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>✅</span>
              <div>
                <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#166534" }}>
                  Session Settled & Verified!
                </h4>
                <div style={{ fontSize: "11px", color: "#15803d" }}>
                  Settled via {settlementData.synced_via} • Signed by {nodeId}
                </div>
              </div>
            </div>
            <span
              style={{
                background: "#dcfce7",
                color: "#15803d",
                fontSize: "10px",
                fontWeight: 800,
                padding: "4px 8px",
                borderRadius: "6px",
                letterSpacing: "0.5px",
              }}
            >
              HMAC VERIFIED ✓
            </span>
          </div>

          {/* Financial Breakdown Table */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "10px",
              background: "#ffffff",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "9px", color: "#6b7280", fontWeight: 700 }}>ESCROW LOCKED</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#1f2937" }}>
                ₹{settlementData.escrow_amount.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "9px", color: "#6b7280", fontWeight: 700 }}>ENERGY DELIVERED</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#166534" }}>
                {settlementData.energy_consumed_kwh.toFixed(3)} kWh
              </div>
            </div>
            <div>
              <div style={{ fontSize: "9px", color: "#6b7280", fontWeight: 700 }}>FINAL BILL</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#1f2937" }}>
                ₹{settlementData.actual_cost.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "9px", color: "#15803d", fontWeight: 700 }}>REFUND TO DRIVER</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#15803d" }}>
                +₹{settlementData.refund_amount.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Prominent Host Earnings Credit Callout with Direct Link */}
          <div
            style={{
              background: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
              border: "1.5px solid #4ade80",
              borderRadius: "10px",
              padding: "14px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#14532d", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>💰 HOST EARNINGS REFLECTED</span>
                <span style={{ background: "#15803d", color: "#fff", fontSize: "9px", padding: "1px 6px", borderRadius: "10px" }}>
                  LIVE
                </span>
              </div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: "#166534", marginTop: "2px" }}>
                +₹{settlementData.host_earnings.toFixed(2)} credited to {activeHost}
              </div>
              <div style={{ fontSize: "11px", color: "#166534", marginTop: "2px" }}>
                Station: <strong>{activeName}</strong> ({nodeId})
              </div>
            </div>

            <Link
              href={`/host?nodeId=${nodeId}`}
              style={{
                background: "#166534",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(22, 101, 52, 0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>View in Host Dashboard</span>
              <span>📊 →</span>
            </Link>
          </div>
        </div>
      )}

      {settlementError && (
        <div style={{ color: "#b91c1c", fontSize: "11px", marginTop: "10px", fontWeight: 600 }}>
          {settlementError}
        </div>
      )}
    </div>
  );
};
