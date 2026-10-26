"use client";

import React, { useState, useEffect } from "react";
import { useOfflineMesh } from "./OfflineMeshContext";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaBanner() {
  const { isOnline, queuedCount, isSyncing, triggerSync, lastSyncMessage } = useOfflineMesh();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if already in standalone mode (installed PWA)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
      console.log("[PWA] RelayEV successfully installed on home screen!");
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);
    if (outcome === "accepted") {
      setShowInstallPrompt(false);
    }
  };

  return (
    <div style={{ width: "100%", zIndex: 40 }}>
      {/* Toast alert for sync / offline state change */}
      {lastSyncMessage && (
        <div
          style={{
            background: isOnline ? "#064e3b" : "#451a03",
            color: isOnline ? "#a7f3d0" : "#fde68a",
            padding: "8px 16px",
            fontSize: "12px",
            textAlign: "center",
            fontWeight: 600,
            borderBottom: isOnline ? "1px solid #059669" : "1px solid #d97706",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.3s ease",
          }}
        >
          <span>{lastSyncMessage}</span>
        </div>
      )}

      {/* Main Mesh Status Bar */}
      <div
        style={{
          background: isOnline ? "#0f172a" : "#1e1b4b",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "6px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#94a3b8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {isOnline ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: "#34d399",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px #10b981",
                }}
              />
              4G/5G Online (Cloud Synced)
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: "#fbbf24",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#f59e0b",
                  boxShadow: "0 0 8px #f59e0b",
                }}
              />
              📡 Offline Mesh Mode (Cellular Dead Zone)
            </span>
          )}

          {queuedCount > 0 && (
            <span
              style={{
                background: "#f59e0b",
                color: "#000",
                padding: "2px 8px",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "10px",
              }}
            >
              ⏳ {queuedCount} offline receipt{queuedCount > 1 ? "s" : ""} cached
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {queuedCount > 0 && isOnline && (
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              style={{
                background: "#059669",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "3px 10px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "11px",
              }}
            >
              {isSyncing ? "Syncing..." : "Sync Now ↻"}
            </button>
          )}

          {showInstallPrompt && !isInstalled && (
            <button
              onClick={handleInstallClick}
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "3px 10px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "11px",
                boxShadow: "0 2px 6px rgba(16, 185, 129, 0.4)",
              }}
            >
              📲 Install App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
