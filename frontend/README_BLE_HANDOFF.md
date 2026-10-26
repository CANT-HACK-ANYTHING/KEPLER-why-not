# RelayEV Web Bluetooth (WebBLE) Hardware Bridge & Simulator

This module implements the **offline-first cryptographic charging handshake** between the Next.js web application and the ESP32-S3 charging hardware for **RelayEV**.

---

## 📁 Key Files Created in Your Workspace (`frontend/src/`)

| File | Purpose |
|---|---|
| [`src/types/ble.ts`](file:///C:/Users/Piyush/Documents/Codex/2026-10-26/goal-slashcommand-goal-india-s-ev/outputs/relayev-frontend/src/types/ble.ts) | TypeScript definitions for GATT UUIDs, charging receipts, live telemetry, and component props. |
| [`src/lib/bleService.ts`](file:///C:/Users/Piyush/Documents/Codex/2026-10-26/goal-slashcommand-goal-india-s-ev/outputs/relayev-frontend/src/lib/bleService.ts) | Low-level Web Bluetooth API service handling `navigator.bluetooth.requestDevice()`, token writing, and GATT notifications. |
| [`src/components/BleConnector.tsx`](file:///C:/Users/Piyush/Documents/Codex/2026-10-26/goal-slashcommand-goal-india-s-ev/outputs/relayev-frontend/src/components/BleConnector.tsx) | Real WebBLE React component that prompts the browser pairing dialog, writes the signed token to ESP32, and listens for the final receipt. |
| [`src/components/BleSimulator.tsx`](file:///C:/Users/Piyush/Documents/Codex/2026-10-26/goal-slashcommand-goal-india-s-ev/outputs/relayev-frontend/src/components/BleSimulator.tsx) | Virtual ESP32 Hardware Simulator with 10s countdown, ~5.2 kWh power delivery emulation, relay toggle indicator, and mock receipt generation. |
| [`src/components/ChargingSessionManager.tsx`](file:///C:/Users/Piyush/Documents/Codex/2026-10-26/goal-slashcommand-goal-india-s-ev/outputs/relayev-frontend/src/components/ChargingSessionManager.tsx) | The orchestrator wiring Person 1's selected `node_id`, Person 2's `/api/charge/start`, WebBLE/Simulator, and Person 2's `/api/charge/stop`. |
| [`src/app/charge/page.tsx`](file:///C:/Users/Piyush/Documents/Codex/2026-10-26/goal-slashcommand-goal-india-s-ev/outputs/relayev-frontend/src/app/charge/page.tsx) | Dedicated `/charge` route matching the team's pastoral rural theme. |

---

## 🛠️ Standard GATT Configuration (Team Spec)

- **Primary Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b` (RelayEV Primary Service)
- **Token Write Characteristic UUID:** `beb5483e-36e1-4688-b7f5-ea07361b26a8` (Write `session_token` via `writeValueWithResponse`)
- **Receipt Read / Notify Characteristic UUID:** `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e` (Read or subscribe to `characteristicvaluechanged`)

---

## 🔗 Team Handoff Interfaces

### 1. From Person 1 (Map & Station UI)
- Pass the selected `node_id` into the `ChargingSessionManager` or `BleConnector`:
  ```tsx
  <ChargingSessionManager initialNodeId={selectedStation.id} />
  ```

### 2. From Person 2 (FastAPI / Supabase Backend)
- **Start Endpoint:** `POST /api/charge/start`
  - Input: `{ user_id: "user_88", node_id: "mohan_courtyard_01", escrow_amount: 100 }`
  - Output: `{ session_token: "eyJhbGciOi...", session_id: "REV-XXXX" }`
- **Stop Endpoint:** `POST /api/charge/stop`
  - Input: The `ChargingReceipt` received from ESP32 / Simulator:
    ```json
    {
      "session_id": "SES-...",
      "node_id": "mohan_courtyard_01",
      "user_id": "user_88",
      "energy_consumed_kwh": 5.2,
      "actual_cost": 62.40,
      "timestamp": 1729938000,
      "nonce": "sim90a21",
      "node_signature": "ESP32_SIG_..."
    }
    ```

---

## 🚀 How to Run & Demo

1. Open a terminal in this directory:
   ```powershell
   npm run dev
   ```
2. Open [http://localhost:3000](http://localhost:3000) or [http://localhost:3000/charge](http://localhost:3000/charge).
3. Click **"Connect to a charger"** on the dashboard:
   - Toggle **"Mock Simulator"** to test without any hardware (10s charging countdown, 5.2 kWh delivered, mock receipt).
   - Toggle **"Physical WebBLE"** when pairing with the real ESP32-S3 over Google Chrome / Edge.
