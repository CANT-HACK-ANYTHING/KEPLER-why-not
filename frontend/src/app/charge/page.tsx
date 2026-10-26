"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChargingSessionManager } from "@/components/ChargingSessionManager";

export default function ChargePage() {
  const [nodeId, setNodeId] = useState("mohan_courtyard_01");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qNode = params.get("nodeId") || params.get("node");
      if (qNode) setNodeId(qNode);
    }
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f2", padding: "40px 20px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        
        {/* Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <Link
            href="/map"
            style={{
              textDecoration: "none",
              color: "#245f4e",
              fontWeight: 700,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            ← Back to Interactive Mesh Map
          </Link>

          <span style={{
            fontSize: "10px",
            letterSpacing: "1.2px",
            fontWeight: 700,
            color: "#6c8577",
            textTransform: "uppercase"
          }}>
            RelayEV Hardware Runner Bridge
          </span>
        </div>

        {/* Embedded Charging Session Manager */}
        <ChargingSessionManager initialNodeId={nodeId} />

        {/* Explanatory Architecture Card for Hackathon Judges & Beginners */}
        <div style={{
          marginTop: "30px",
          background: "#fff",
          border: "1px solid #e2e8dd",
          borderRadius: "14px",
          padding: "20px 24px",
          color: "#19342f"
        }}>
          <h4 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: "16px", fontWeight: 600 }}>
            How Web Bluetooth (WebBLE) Solves India&apos;s Rural EV Dead Zones
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "11px", color: "#617369", lineHeight: 1.6 }}>
            <div>
              <strong style={{ color: "#245f4e", display: "block", marginBottom: "4px" }}>
                1. No Host Wi-Fi or 4G SIM Card Needed
              </strong>
              Traditional chargers cost ₹50,000+ because they require 4G modems and cloud subscriptions. RelayEV runs on a ₹1,500 ESP32-S3 that stays completely offline.
            </div>
            <div>
              <strong style={{ color: "#245f4e", display: "block", marginBottom: "4px" }}>
                2. Cryptographic Escrow over WebBLE
              </strong>
              The driver&apos;s phone brings the backend-signed JWT token and passes it locally via Web Bluetooth. The ESP32 verifies the signature and closes the 30A relay.
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
