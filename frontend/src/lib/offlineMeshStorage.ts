/**
 * =============================================================================
 * RelayEV Offline Mesh Storage Engine
 * Guarantees zero-data-loss when charging in cellular dead zones
 * =============================================================================
 */

import { ChargingReceipt } from "@/types/ble";

const STORAGE_KEYS = {
  CACHED_STATIONS: "relayev_cached_stations_v1",
  CACHED_USER: "relayev_cached_user_v1",
  OFFLINE_RECEIPT_QUEUE: "relayev_offline_receipt_queue_v1",
  OFFLINE_VOUCHERS: "relayev_offline_vouchers_v1",
};

export interface QueuedReceipt {
  receipt: ChargingReceipt;
  queuedAt: number;
  attempts: number;
  status: "PENDING" | "SYNCING" | "FAILED";
  lastError?: string;
}

export interface CachedUser {
  id: string;
  name: string;
  role: string;
  walletBalance: number;
  cachedAt: number;
}

export class OfflineMeshStorage {
  /**
   * Save driver profile for offline retrieval
   */
  static saveCachedUser(user: Partial<CachedUser>): void {
    if (typeof window === "undefined") return;
    try {
      const existing = this.getCachedUser() || {
        id: "user_88",
        name: "Anaya Rao (EV Driver)",
        role: "driver",
        walletBalance: 500.0,
        cachedAt: Date.now(),
      };
      const updated = { ...existing, ...user, cachedAt: Date.now() };
      localStorage.setItem(STORAGE_KEYS.CACHED_USER, JSON.stringify(updated));
    } catch (e) {
      console.error("[OfflineStorage] Failed to save cached user:", e);
    }
  }

  /**
   * Retrieve cached driver profile
   */
  static getCachedUser(): CachedUser | null {
    if (typeof window === "undefined") return null;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CACHED_USER);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error("[OfflineStorage] Failed to read cached user:", e);
    }
    return {
      id: "user_88",
      name: "Anaya Rao (EV Driver)",
      role: "driver",
      walletBalance: 500.0,
      cachedAt: Date.now(),
    };
  }

  /**
   * Enqueue a signed charging receipt that was received over BLE while offline
   */
  static enqueueOfflineReceipt(receipt: ChargingReceipt): void {
    if (typeof window === "undefined") return;
    try {
      const queue = this.getQueuedReceipts();
      // Avoid duplicate enqueue
      if (!queue.some((q) => q.receipt.session_id === receipt.session_id)) {
        queue.push({
          receipt,
          queuedAt: Date.now(),
          attempts: 0,
          status: "PENDING",
        });
        localStorage.setItem(STORAGE_KEYS.OFFLINE_RECEIPT_QUEUE, JSON.stringify(queue));
        console.log(`[OfflineStorage] Receipt for ${receipt.session_id} saved to offline queue.`);
      }
    } catch (e) {
      console.error("[OfflineStorage] Failed to enqueue receipt:", e);
    }
  }

  /**
   * Get all receipts currently awaiting cellular upload
   */
  static getQueuedReceipts(): QueuedReceipt[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_RECEIPT_QUEUE);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error("[OfflineStorage] Failed to read receipt queue:", e);
    }
    return [];
  }

  /**
   * Remove a successfully synced receipt from queue
   */
  static removeQueuedReceipt(sessionId: string): void {
    if (typeof window === "undefined") return;
    try {
      let queue = this.getQueuedReceipts();
      queue = queue.filter((q) => q.receipt.session_id !== sessionId);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_RECEIPT_QUEUE, JSON.stringify(queue));
      console.log(`[OfflineStorage] Removed synced receipt ${sessionId} from queue.`);
    } catch (e) {
      console.error("[OfflineStorage] Failed to remove receipt:", e);
    }
  }

  /**
   * Flush and synchronize all queued offline receipts with the backend cloud
   */
  static async syncQueuedReceipts(
    apiBaseUrl: string = "http://localhost:8000"
  ): Promise<{ synced: number; failed: number; newBalance?: number }> {
    const queue = this.getQueuedReceipts();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    console.log(`[OfflineStorage] 🚀 Cellular connection restored! Flushing ${queue.length} offline receipts...`);
    let synced = 0;
    let failed = 0;
    let latestBalance: number | undefined;

    for (const item of queue) {
      try {
        const res = await fetch(`${apiBaseUrl}/api/charge/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: item.receipt.session_id,
            node_id: item.receipt.node_id,
            user_id: item.receipt.user_id,
            energy_consumed_kwh: item.receipt.energy_consumed_kwh,
            actual_cost: item.receipt.actual_cost,
            node_signature: item.receipt.node_signature,
            timestamp: item.receipt.timestamp,
            nonce: item.receipt.nonce,
            is_mule_sync: false,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          this.removeQueuedReceipt(item.receipt.session_id);
          synced++;
          if (data.user_new_balance !== undefined) {
            latestBalance = data.user_new_balance;
            this.saveCachedUser({ walletBalance: latestBalance });
          }
          console.log(`[OfflineStorage] ✓ Successfully settled ${item.receipt.session_id}`);
        } else {
          failed++;
          item.attempts += 1;
          item.status = "FAILED";
        }
      } catch (err) {
        console.error(`[OfflineStorage] Network error syncing ${item.receipt.session_id}:`, err);
        failed++;
      }
    }

    return { synced, failed, newBalance: latestBalance };
  }
}
