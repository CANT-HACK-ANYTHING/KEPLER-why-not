"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { OfflineMeshStorage } from "@/lib/offlineMeshStorage";
import { ChargingReceipt } from "@/types/ble";

interface OfflineMeshContextType {
  isOnline: boolean;
  queuedCount: number;
  isSyncing: boolean;
  triggerSync: () => Promise<{ synced: number; failed: number }>;
  enqueueReceipt: (receipt: ChargingReceipt) => void;
  lastSyncMessage: string | null;
}

const OfflineMeshContext = createContext<OfflineMeshContextType>({
  isOnline: true,
  queuedCount: 0,
  isSyncing: false,
  triggerSync: async () => ({ synced: 0, failed: 0 }),
  enqueueReceipt: () => {},
  lastSyncMessage: null,
});

export const useOfflineMesh = () => useContext(OfflineMeshContext);

export function OfflineMeshProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  // Update queued receipt count
  const refreshQueueCount = useCallback(() => {
    const queue = OfflineMeshStorage.getQueuedReceipts();
    setQueuedCount(queue.length);
  }, []);

  // Trigger sync of queued receipts
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) {
      setLastSyncMessage("Cannot sync: device is in cellular dead zone.");
      return { synced: 0, failed: 0 };
    }

    setIsSyncing(true);
    setLastSyncMessage("Syncing offline receipts with cloud...");
    try {
      const result = await OfflineMeshStorage.syncQueuedReceipts();
      refreshQueueCount();
      if (result.synced > 0) {
        setLastSyncMessage(`Synced ${result.synced} offline receipt(s) with cloud!`);
      } else if (result.failed > 0) {
        setLastSyncMessage(`Failed to sync ${result.failed} receipt(s). Will retry automatically.`);
      } else {
        setLastSyncMessage("All receipts are up to date.");
      }
      return result;
    } catch {
      setLastSyncMessage("Sync failed. Check cloud connectivity.");
      return { synced: 0, failed: 1 };
    } finally {
      setIsSyncing(false);
      setTimeout(() => setLastSyncMessage(null), 6000);
    }
  }, [refreshQueueCount]);

  const enqueueReceipt = useCallback((receipt: ChargingReceipt) => {
    OfflineMeshStorage.enqueueOfflineReceipt(receipt);
    refreshQueueCount();
  }, [refreshQueueCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);
    refreshQueueCount();

    const handleOnline = () => {
      console.log("[OfflineMesh] 🟢 Cellular network connection restored.");
      setIsOnline(true);
      // Auto-flush queued receipts when cellular connectivity resumes
      triggerSync();
    };

    const handleOffline = () => {
      console.log("[OfflineMesh] 📡 Cellular dead zone detected: Offline Mesh Mode activated.");
      setIsOnline(false);
      setLastSyncMessage("📡 Offline Mesh Mode active. WebBLE & Escrow operating locally.");
      setTimeout(() => setLastSyncMessage(null), 7000);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshQueueCount, triggerSync]);

  return (
    <OfflineMeshContext.Provider
      value={{
        isOnline,
        queuedCount,
        isSyncing,
        triggerSync,
        enqueueReceipt,
        lastSyncMessage,
      }}
    >
      {children}
    </OfflineMeshContext.Provider>
  );
}
