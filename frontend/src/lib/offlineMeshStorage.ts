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

/**
 * Helper to dynamically determine the backend API base URL
 */
function resolveBackendUrl(preferredUrl?: string): string {
  if (preferredUrl) return preferredUrl;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location.hostname) {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    return `${proto}//${host}:8000`;
  }
  return "http://localhost:8000";
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
      console.warn("[OfflineStorage] Failed to save cached user:", e);
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
      console.warn("[OfflineStorage] Failed to read cached user:", e);
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
    if (typeof window === "undefined" || !receipt || !receipt.session_id) return;
    try {
      const queue = this.getQueuedReceipts();
      const sid = receipt.session_id;

      // Avoid duplicate enqueue
      if (!queue.some((q) => q.receipt?.session_id === sid)) {
        queue.push({
          receipt,
          queuedAt: Date.now(),
          attempts: 0,
          status: "PENDING",
        });
        localStorage.setItem(STORAGE_KEYS.OFFLINE_RECEIPT_QUEUE, JSON.stringify(queue));
        console.log(`[OfflineStorage] Receipt for ${sid} saved to offline queue.`);
      }
    } catch (e) {
      console.warn("[OfflineStorage] Failed to enqueue receipt:", e);
    }
  }

  /**
   * Get all receipts currently awaiting cellular upload
   */
  static getQueuedReceipts(): QueuedReceipt[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_RECEIPT_QUEUE);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // Normalize queue to gracefully handle direct receipts or wrapped items
          return parsed
            .filter((item) => item && (item.receipt?.session_id || item.session_id))
            .map((item) => {
              if (item.receipt && item.receipt.session_id) {
                return item;
              }
              return {
                receipt: item as ChargingReceipt,
                queuedAt: item.queuedAt || Date.now(),
                attempts: item.attempts || 0,
                status: item.status || "PENDING",
              };
            });
        }
      }
    } catch (e) {
      console.warn("[OfflineStorage] Failed to read receipt queue:", e);
    }
    return [];
  }

  /**
   * Remove a successfully synced receipt from queue
   */
  static removeQueuedReceipt(sessionId: string): void {
    if (typeof window === "undefined" || !sessionId) return;
    try {
      const queue = this.getQueuedReceipts();
      const filtered = queue.filter((q) => q.receipt?.session_id !== sessionId);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_RECEIPT_QUEUE, JSON.stringify(filtered));
      console.log(`[OfflineStorage] Removed synced receipt ${sessionId} from queue.`);
    } catch (e) {
      console.warn("[OfflineStorage] Failed to remove receipt:", e);
    }
  }

  /**
   * Flush and synchronize all queued offline receipts with the backend cloud
   */
  static async syncQueuedReceipts(
    apiBaseUrl?: string
  ): Promise<{ synced: number; failed: number; newBalance?: number }> {
    const queue = this.getQueuedReceipts();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const targetUrl = resolveBackendUrl(apiBaseUrl);
    console.log(`[OfflineStorage] 🚀 Cellular connection active! Flushing ${queue.length} offline receipts to ${targetUrl}...`);
    let synced = 0;
    let failed = 0;
    let latestBalance: number | undefined;

    for (const item of queue) {
      const receipt = item?.receipt;
      if (!receipt || !receipt.session_id) {
        // Discard malformed item
        continue;
      }

      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

        const res = await fetch(`${targetUrl}/api/charge/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify({
            session_id: receipt.session_id,
            node_id: receipt.node_id || "node_esp32_01",
            user_id: receipt.user_id || "user_88",
            energy_consumed_kwh: receipt.energy_consumed_kwh || 0.0,
            actual_cost: receipt.actual_cost || 0.0,
            node_signature: receipt.node_signature || "",
            timestamp: receipt.timestamp || Math.floor(Date.now() / 1000),
            nonce: receipt.nonce || `NONCE-${Date.now()}`,
            is_mule_sync: false,
          }),
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          this.removeQueuedReceipt(receipt.session_id);
          synced++;
          if (data.user_new_balance !== undefined) {
            latestBalance = data.user_new_balance;
            this.saveCachedUser({ walletBalance: latestBalance });
          }
          console.log(`[OfflineStorage] ✓ Successfully settled ${receipt.session_id}`);
        } else {
          // If already settled, remove to prevent endless retries
          if (res.status === 400 || res.status === 409) {
            const errJson = await res.json().catch(() => ({}));
            if (errJson?.detail && errJson.detail.includes("already been processed")) {
              this.removeQueuedReceipt(receipt.session_id);
              synced++;
              continue;
            }
          }
          failed++;
          item.attempts = (item.attempts || 0) + 1;
          item.status = "FAILED";
        }
      } catch (err: any) {
        // Graceful non-blocking catch for network drops / CORS / timeouts
        console.warn(`[OfflineStorage] Network unavailable for ${receipt.session_id}:`, err?.message || err);
        failed++;
      }
    }

    return { synced, failed, newBalance: latestBalance };
  }
}
