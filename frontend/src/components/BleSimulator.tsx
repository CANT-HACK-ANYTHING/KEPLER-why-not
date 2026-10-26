"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  BleSimulatorProps,
  BleConnectionState,
  ChargingReceipt,
  LiveTelemetry
} from "@/types/ble";
import { computeHmacSha256, extractSessionIdFromToken, HARDWARE_MASTER_SECRET } from "@/lib/crypto";

export const BleSimulator: React.FC<BleSimulatorProps> = ({
  nodeId,
  sessionToken,
  onReceiptReceived,
  onStateChange,
  ratePerKwh = 10.0,
  durationSeconds = 8,
  targetKwh = 8.42
}) => {
  const [state, setState] = useState<BleConnectionState>("IDLE");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(durationSeconds);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [stepInfo, setStepInfo] = useState<string>("Ready to test offline charging");
  const [generatedReceipt, setGeneratedReceipt] = useState<ChargingReceipt | null>(null);
  const [telemetry, setTelemetry] = useState<LiveTelemetry>({
    voltage: 230.8,
    current: 0,
    power_kw: 0,
    energy_kwh: 0,
    cost_inr: 0,
    duration_seconds: 0,
    relay_state: "OPEN"
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateState = (newState: BleConnectionState) => {
    setState(newState);
    if (onStateChange) onStateChange(newState);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /**
   * Simulates full offline BLE lifecycle:
   * 1. Scan -> 2. Connect -> 3. Write Token -> 4. Charge with live Gauge -> 5. HMAC Receipt Handoff
   */
  const startSimulation = async () => {
    setErrorMessage("");
    setGeneratedReceipt(null);
    updateState("SCANNING");
    setStepInfo(`Scanning for BLE device "${nodeId || "RelayEV-Node-01"}"...`);

    // 1. Simulate BLE device scan & pairing delay (800ms)
    await new Promise((r) => setTimeout(r, 700));
    updateState("CONNECTING");
    setStepInfo("Pairing with GATT Server (UUID: 4fafc201-1fb5-459e-8fcc-c5c9c331914b)...");

    // 2. Simulate GATT connection & service discovery (600ms)
    await new Promise((r) => setTimeout(r, 600));
    updateState("GATT_CONNECTED");
    setStepInfo("GATT Server connected! Primary Relay Service discovered.");

    // 3. Simulate Token Write over Characteristic beb5483e (600ms)
    updateState("WRITING_TOKEN");
    setStepInfo("Pushing cryptographic session_token to Token Characteristic (beb5483e)...");
    await new Promise((r) => setTimeout(r, 700));

    // 4. Relay clicks CLOSED, PZEM-004T measures live power
    updateState("CHARGING");
    setStepInfo(`Token accepted! 30A Relay closed. Powering EV to ${targetKwh} kWh cutoff...`);
    setSecondsRemaining(durationSeconds);

    const stepKwh = targetKwh / durationSeconds;
    let elapsed = 0;

    timerRef.current = setInterval(async () => {
      elapsed += 1;
      const currentRemaining = durationSeconds - elapsed;
      setSecondsRemaining(Math.max(0, currentRemaining));

      const accumulatedKwh = +(Math.min(targetKwh, elapsed * stepKwh)).toFixed(3);
      const liveCost = +(accumulatedKwh * ratePerKwh).toFixed(2);
      const liveCurrent = +(13.8 + (Math.random() * 0.4 - 0.2)).toFixed(1);
      const liveVoltage = +(230.0 + (Math.random() * 2.0 - 1.0)).toFixed(1);
      const activeKw = +((liveVoltage * liveCurrent) / 1000).toFixed(2);

      setTelemetry({
        voltage: liveVoltage,
        current: liveCurrent,
        power_kw: activeKw,
        energy_kwh: accumulatedKwh,
        cost_inr: liveCost,
        duration_seconds: elapsed,
        relay_state: "CLOSED"
      });

      // Target cutoff reached!
      if (elapsed >= durationSeconds) {
        if (timerRef.current) clearInterval(timerRef.current);
        await finishSimulation(accumulatedKwh, liveCost);
      }
    }, 1000);
  };

  /**
   * Disconnects relay and generates cryptographically authentic HMAC-SHA256 receipt
   */
  const finishSimulation = async (finalKwh: number, finalCost: number) => {
    updateState("STOPPING");
    setStepInfo("Target cutoff reached! De-energizing 30A relay and generating signed receipt...");

    setTelemetry((prev) => ({
      ...prev,
      current: 0,
      power_kw: 0,
      relay_state: "OPEN"
    }));

    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(2, 10);
    const sessionId = extractSessionIdFromToken(sessionToken);

    // Compute authentic HMAC-SHA256 matching backend: session_id:energy_kwh:actual_cost
    const message = `${sessionId}:${finalKwh.toFixed(3)}:${finalCost.toFixed(2)}`;
    const signature = await computeHmacSha256(HARDWARE_MASTER_SECRET, message);

    const receipt: ChargingReceipt = {
      session_id: sessionId,
      node_id: nodeId || "RelayEV-Node-01",
      user_id: "user_88",
      energy_consumed_kwh: finalKwh,
      actual_cost: finalCost,
      timestamp: timestamp,
      nonce: nonce,
      node_signature: signature
    };

    setGeneratedReceipt(receipt);
    updateState("RECEIPT_RECEIVED");
    setStepInfo("Receipt signed by ESP32 PZEM hardware and notified back to phone!");
    onReceiptReceived(receipt);
  };

  const handleEmergencyStop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const delivered = telemetry.energy_kwh || 0.1;
    const cost = +(delivered * ratePerKwh).toFixed(2);
    await finishSimulation(delivered, cost);
  };

  const handleReset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    updateState("IDLE");
    setSecondsRemaining(durationSeconds);
    setGeneratedReceipt(null);
    setStepInfo("Simulator ready. Click 'Simulate Offline Charge' to run.");
    setTelemetry({
      voltage: 230.8,
      current: 0,
      power_kw: 0,
      energy_kwh: 0,
      cost_inr: 0,
      duration_seconds: 0,
      relay_state: "OPEN"
    });
  };

  // Progress percentage for visual Gauge
  const progressPercent = Math.min(100, Math.round((telemetry.energy_kwh / targetKwh) * 100));

  return (
    <div
      className="ble-simulator-card"
      style={{
        background: "#ffffff",
        border: "1px solid #d9e5d6",
        borderRadius: "14px",
        padding: "20px",
        color: "#18322c",
        boxShadow: "0 4px 16px rgba(24, 50, 44, 0.05)"
      }}
    >
      {/* Simulator Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          borderBottom: "1px solid #edf2ea",
          paddingBottom: "12px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: state === "CHARGING" ? "#10b981" : state === "ERROR" ? "#ef4444" : "#f59e0b",
              boxShadow: state === "CHARGING" ? "0 0 8px #10b981" : "none"
            }}
          />
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#19342f" }}>
            Mock ESP32-S3 Hardware Bridge
          </h3>
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: "6px",
            background: "#e8f3ea",
            color: "#225949",
            textTransform: "uppercase",
            letterSpacing: "0.8px"
          }}
        >
          {state}
        </span>
      </div>

      {/* State Progress Banner */}
      <div
        style={{
          background: "#f4f8f3",
          border: "1px solid #e1ebe0",
          borderRadius: "8px",
          padding: "10px 14px",
          marginBottom: "16px",
          fontSize: "12px",
          color: "#2f574a",
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}
      >
        <span style={{ fontSize: "16px" }}>
          {state === "SCANNING"
            ? "🔍"
            : state === "CONNECTING"
            ? "🔗"
            : state === "WRITING_TOKEN"
            ? "🔐"
            : state === "CHARGING"
            ? "⚡"
            : state === "RECEIPT_RECEIVED"
            ? "📜"
            : "ℹ️"}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{stepInfo}</div>
          {sessionToken && (
            <div
              style={{
                fontSize: "10px",
                color: "#6b8076",
                marginTop: "2px",
                wordBreak: "break-all",
                fontFamily: "monospace"
              }}
            >
              Session Token: {sessionToken.substring(0, 32)}...
            </div>
          )}
        </div>
      </div>

      {/* Main Charging Gauge & Visual Readout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          alignItems: "center",
          marginBottom: "20px"
        }}
      >
        {/* Radial SVG Gauge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#fbfdfa",
            border: "1px solid #e6eee3",
            borderRadius: "12px",
            padding: "16px"
          }}
        >
          <div style={{ position: "relative", width: "160px", height: "160px" }}>
            <svg width="160" height="160" viewBox="0 0 160 160">
              {/* Gauge Background Circle */}
              <circle
                cx="80"
                cy="80"
                r="64"
                fill="none"
                stroke="#e5ece2"
                strokeWidth="12"
                strokeDasharray="301"
                strokeDashoffset="60"
                strokeLinecap="round"
                transform="rotate(135 80 80)"
              />
              {/* Gauge Active Progress Arc */}
              <circle
                cx="80"
                cy="80"
                r="64"
                fill="none"
                stroke="url(#gaugeGradient)"
                strokeWidth="12"
                strokeDasharray="301"
                strokeDashoffset={301 - (progressPercent / 100) * 240}
                strokeLinecap="round"
                transform="rotate(135 80 80)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>

            {/* Center Gauge Readout */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center"
              }}
            >
              <span style={{ fontSize: "10px", color: "#6c8577", textTransform: "uppercase", fontWeight: 700 }}>
                Delivered
              </span>
              <span
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "#18322c",
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                {telemetry.energy_kwh.toFixed(3)}
              </span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#2d755e" }}>
                kWh / {targetKwh}
              </span>
            </div>
          </div>

          <div style={{ fontSize: "11px", color: "#566e63", marginTop: "8px", fontWeight: 600 }}>
            {state === "CHARGING" ? `Cutoff in ${secondsRemaining}s` : `Target Cutoff: ${targetKwh} kWh`}
          </div>
        </div>

        {/* Live PZEM-004T Hardware Telemetry Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Active Power */}
          <div
            style={{
              background: "#f7faf6",
              border: "1px solid #e2ebe0",
              borderRadius: "8px",
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <div>
              <div style={{ fontSize: "10px", color: "#6a7f74", textTransform: "uppercase", fontWeight: 700 }}>
                Active Power (PZEM)
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#19342f" }}>
                {telemetry.power_kw.toFixed(2)}{" "}
                <small style={{ fontSize: "11px", fontWeight: 500 }}>kW</small>
              </div>
            </div>
            <span style={{ fontSize: "20px" }}>⚡</span>
          </div>

          {/* AC Grid Voltage & Current */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div
              style={{
                background: "#f7faf6",
                border: "1px solid #e2ebe0",
                borderRadius: "8px",
                padding: "8px 10px"
              }}
            >
              <div style={{ fontSize: "9px", color: "#6a7f74", fontWeight: 700 }}>AC VOLTAGE</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#19342f" }}>
                {telemetry.voltage.toFixed(1)} V
              </div>
            </div>
            <div
              style={{
                background: "#f7faf6",
                border: "1px solid #e2ebe0",
                borderRadius: "8px",
                padding: "8px 10px"
              }}
            >
              <div style={{ fontSize: "9px", color: "#6a7f74", fontWeight: 700 }}>AC CURRENT</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#19342f" }}>
                {telemetry.current.toFixed(1)} A
              </div>
            </div>
          </div>

          {/* Relay State & Live Cost */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div
              style={{
                background: "#f7faf6",
                border: "1px solid #e2ebe0",
                borderRadius: "8px",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: telemetry.relay_state === "CLOSED" ? "#10b981" : "#94a3b8"
                }}
              />
              <div>
                <div style={{ fontSize: "9px", color: "#6a7f74", fontWeight: 700 }}>30A RELAY</div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: telemetry.relay_state === "CLOSED" ? "#047857" : "#64748b"
                  }}
                >
                  {telemetry.relay_state === "CLOSED" ? "CONDUCTING" : "OPEN"}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#f7faf6",
                border: "1px solid #e2ebe0",
                borderRadius: "8px",
                padding: "8px 10px"
              }}
            >
              <div style={{ fontSize: "9px", color: "#6a7f74", fontWeight: 700 }}>LIVE BILL</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#19342f" }}>
                ₹{telemetry.cost_inr.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generated Receipt Preview (When Finished) */}
      {generatedReceipt && (
        <div
          style={{
            background: "#f0f7f1",
            border: "1px solid #cce4d1",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "16px",
            fontSize: "11px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontWeight: 700, color: "#1d6148" }}>✓ Hardware Signed Receipt Generated</span>
            <span style={{ color: "#477a64" }}>Timestamp: {generatedReceipt.timestamp}</span>
          </div>
          <div style={{ fontFamily: "monospace", color: "#29503f", fontSize: "10px" }}>
            <div>Session ID: {generatedReceipt.session_id}</div>
            <div>Energy Delivered: {generatedReceipt.energy_consumed_kwh} kWh | Actual Bill: ₹{generatedReceipt.actual_cost}</div>
            <div style={{ wordBreak: "break-all", marginTop: "2px" }}>
              HMAC Signature: {generatedReceipt.node_signature}
            </div>
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div style={{ display: "flex", gap: "10px" }}>
        {state === "IDLE" || state === "ERROR" ? (
          <button
            onClick={startSimulation}
            style={{
              flex: 1,
              background: "#1f5e4c",
              color: "#ffffff",
              border: 0,
              borderRadius: "8px",
              padding: "12px 18px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(31, 94, 76, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>ϟ</span> Simulate Offline Charge
          </button>
        ) : state === "CHARGING" ? (
          <button
            onClick={handleEmergencyStop}
            style={{
              flex: 1,
              background: "#b91c1c",
              color: "#ffffff",
              border: 0,
              borderRadius: "8px",
              padding: "12px 18px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>⏹</span> Stop Charging Now
          </button>
        ) : (
          <button
            onClick={handleReset}
            style={{
              flex: 1,
              background: "#e8efe6",
              color: "#21473b",
              border: "1px solid #cddcd0",
              borderRadius: "8px",
              padding: "12px 18px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>↺</span> Reset Simulator
          </button>
        )}
      </div>

      {errorMessage && (
        <div style={{ color: "#b91c1c", fontSize: "11px", marginTop: "10px", fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};
