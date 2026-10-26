"use client";

import React, { useState, useEffect } from "react";
import {
  BleConnectorProps,
  BleConnectionState,
  ChargingReceipt,
  RELAY_SERVICE_UUID,
  TOKEN_WRITE_UUID,
  RECEIPT_NOTIFY_UUID
} from "@/types/ble";
import { BleService } from "@/lib/bleService";

export const BleConnector: React.FC<BleConnectorProps> = ({
  nodeId,
  sessionToken,
  onReceiptReceived,
  onStateChange
}) => {
  const [state, setState] = useState<BleConnectionState>("IDLE");
  const [deviceName, setDeviceName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [bleService, setBleService] = useState<BleService | null>(null);
  const [isBrowserSupported, setIsBrowserSupported] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to pair with offline ESP32");

  useEffect(() => {
    setIsBrowserSupported(BleService.isSupported());
    const service = new BleService();
    setBleService(service);

    return () => {
      service.disconnect();
    };
  }, []);

  const updateState = (newState: BleConnectionState) => {
    setState(newState);
    if (onStateChange) onStateChange(newState);
  };

  /**
   * Complete Web Bluetooth Connection & Token Push Protocol
   */
  const handleConnectAndAuthorize = async () => {
    if (!bleService) return;
    setErrorMessage("");

    try {
      // 1. Prompt native browser Bluetooth device picker
      updateState("SCANNING");
      setStatusMessage("Searching for RelayEV-Node-XX or ESP32 device...");

      const name = await bleService.connect(() => {
        console.warn("[WebBLE] Device disconnected unexpectedly.");
        updateState("IDLE");
        setStatusMessage("Hardware disconnected.");
      });
      setDeviceName(name);
      updateState("GATT_CONNECTED");
      setStatusMessage(`GATT connected to ${name}! Primary Service: ${RELAY_SERVICE_UUID.slice(0, 8)}...`);

      // 2. Subscribe to final receipt notifications
      setStatusMessage("Subscribing to receipt notifications on characteristic 1c95d5e3...");
      await bleService.subscribeReceipt((receipt: ChargingReceipt) => {
        console.log("[WebBLE] Final signed receipt received from ESP32:", receipt);
        updateState("RECEIPT_RECEIVED");
        setStatusMessage("Signed receipt received from ESP32 flash memory!");
        onReceiptReceived(receipt);
      });

      // 3. Write JWT session token to ESP32 to energize the 30A relay
      updateState("WRITING_TOKEN");
      setStatusMessage("Pushing cryptographic session_token to characteristic beb5483e...");
      await bleService.writeSessionToken(sessionToken);

      // 4. Relay is closed, charging active
      updateState("CHARGING");
      setStatusMessage("Token verified by ESP32! 30A relay energized. Charging in progress...");
    } catch (err: unknown) {
      console.error("[WebBLE] Operation failed:", err);
      updateState("ERROR");
      const message = err instanceof Error ? err.message : "Bluetooth connection or token push failed.";
      
      // User-friendly guidance for common Web Bluetooth issues
      if (message.includes("User cancelled") || message.includes("User denied")) {
        setErrorMessage("Bluetooth pairing was cancelled in browser. Click 'Pair & Push Token' to try again.");
      } else if (!isBrowserSupported) {
        setErrorMessage("Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Chrome for Android.");
      } else {
        setErrorMessage(message);
      }
    }
  };

  /**
   * Manual stop / receipt read trigger
   */
  const handleManualStop = async () => {
    if (!bleService) return;
    try {
      updateState("STOPPING");
      setStatusMessage("Requesting final receipt from ESP32 memory...");
      const receipt = await bleService.readReceipt();
      updateState("RECEIPT_RECEIVED");
      setStatusMessage("Final receipt retrieved successfully!");
      onReceiptReceived(receipt);
    } catch (err: unknown) {
      console.warn("[WebBLE] Direct read failed, disconnecting...", err);
      bleService.disconnect();
      updateState("IDLE");
      setStatusMessage("Disconnected from charger.");
    }
  };

  return (
    <div
      className="ble-connector-card"
      style={{
        background: "#ffffff",
        border: "1px solid #d9e5d6",
        borderRadius: "14px",
        padding: "20px",
        color: "#18322c",
        boxShadow: "0 4px 16px rgba(24, 50, 44, 0.05)"
      }}
    >
      {/* Header */}
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
              background: state === "CHARGING" ? "#10b981" : state === "ERROR" ? "#ef4444" : "#3b82f6",
              boxShadow: state === "CHARGING" ? "0 0 8px #10b981" : "none"
            }}
          />
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#19342f" }}>
            Physical Web Bluetooth (WebBLE)
          </h3>
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: "6px",
            background: "#eff6ff",
            color: "#1e40af",
            textTransform: "uppercase",
            letterSpacing: "0.8px"
          }}
        >
          {state}
        </span>
      </div>

      {/* Browser Support Warning */}
      {!isBrowserSupported && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "12px",
            marginBottom: "16px"
          }}
        >
          <strong>⚠️ Web Bluetooth Not Supported in this Browser:</strong>
          <p style={{ margin: "4px 0 0" }}>
            WebBLE requires Google Chrome, Microsoft Edge, or Chrome for Android on HTTPS or localhost. If you are testing without physical hardware, switch to <strong>&ldquo;Use Mock ESP32 Hardware&rdquo;</strong> mode above!
          </p>
        </div>
      )}

      {/* GATT Configuration Specs */}
      <div
        style={{
          background: "#f8faf7",
          border: "1px solid #e2ebe0",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "11px",
          color: "#4d6b5e",
          marginBottom: "16px"
        }}
      >
        <div style={{ fontWeight: 700, color: "#19342f", marginBottom: "6px" }}>
          GATT Profile Parameters
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "4px", fontFamily: "monospace", fontSize: "10px" }}>
          <span style={{ color: "#708479" }}>Service UUID:</span>
          <span style={{ color: "#1b4d3e" }}>{RELAY_SERVICE_UUID}</span>
          <span style={{ color: "#708479" }}>Token Write Char:</span>
          <span style={{ color: "#1b4d3e" }}>{TOKEN_WRITE_UUID}</span>
          <span style={{ color: "#708479" }}>Receipt Read Char:</span>
          <span style={{ color: "#1b4d3e" }}>{RECEIPT_NOTIFY_UUID}</span>
          <span style={{ color: "#708479" }}>Target Node:</span>
          <span style={{ color: "#1b4d3e" }}>{nodeId || "RelayEV-Node-XX"}</span>
        </div>
      </div>

      {/* Current Step Status */}
      <div
        style={{
          background: "#f0f7f3",
          border: "1px solid #d4e7da",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "12px",
          color: "#214e3e",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <span>📡</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{statusMessage}</div>
          {deviceName && <div style={{ fontSize: "10px", color: "#5d7c70" }}>Connected Device: {deviceName}</div>}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "12px",
            marginBottom: "16px"
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "10px" }}>
        {state === "IDLE" || state === "ERROR" ? (
          <button
            onClick={handleConnectAndAuthorize}
            disabled={!isBrowserSupported || !sessionToken}
            style={{
              flex: 1,
              background: isBrowserSupported && sessionToken ? "#2563eb" : "#94a3b8",
              color: "#ffffff",
              border: 0,
              borderRadius: "8px",
              padding: "12px 18px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: isBrowserSupported && sessionToken ? "pointer" : "not-allowed",
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>⚡</span> Pair & Push Token to ESP32
          </button>
        ) : state === "CHARGING" ? (
          <button
            onClick={handleManualStop}
            style={{
              flex: 1,
              background: "#dc2626",
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
            <span>⏹</span> Stop & Pull Receipt
          </button>
        ) : (
          <button
            disabled
            style={{
              flex: 1,
              background: "#f1f5f9",
              color: "#64748b",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "12px 18px",
              fontSize: "13px",
              fontWeight: 600
            }}
          >
            Processing BLE Handshake...
          </button>
        )}
      </div>
    </div>
  );
};
