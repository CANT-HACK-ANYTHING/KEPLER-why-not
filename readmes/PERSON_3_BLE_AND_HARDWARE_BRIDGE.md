# Role 3: Hardware Bridge & BLE Simulator Engineer

## 🚦 Status: ⏳ QUEUED (Step 4 - Starts immediately after Step 3)

## 🎯 Primary Mission
Build the Web Bluetooth (WebBLE) connector inside the Next.js app that pairs with the offline ESP32, pushes the cryptographic authorization token, reads live telemetry, and pulls the signed charging receipt back to the cloud. Also provides an embedded Mock ESP32 Simulator for instant hardware-free team testing.

---

## 📁 Workspace & Key Files
- Work primarily in: `frontend/src/`
- Target components: 
  - `frontend/src/components/BleConnector.tsx`
  - `frontend/src/components/BleSimulator.tsx` (Mock hardware testing fallback)
- Page integration: Embedded inside the Station Drawer on the main map (`frontend/src/app/page.tsx`)

---

## 🛠️ Step-by-Step Implementation Guide

### 1. Web Bluetooth API Configuration
- Browser native `navigator.bluetooth.requestDevice()`.
- GATT Configuration:
  - **Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b` (RelayEV Primary Service)
  - **Token Write Characteristic:** `beb5483e-36e1-4688-b7f5-ea07361b26a8` (Write `session_token`)
  - **Receipt Read / Notify Characteristic:** `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e` (Read / Subscribe to receipt)

### 2. Live Session Lifecycle in UI
1. **Idle**: User selects a station on the map and clicks "Start Charging".
2. **Escrow Locked**: Person 2's API returns `session_token`.
3. **Connecting**: WebBLE searches for `RelayEV-Node-XX` and connects to GATT server.
4. **Authorizing**: Writes the `session_token` to the ESP32 characteristic.
5. **Charging**: Live gauge shows kWh delivered and elapsed time.
6. **Completed**: ESP32 notifies phone with signed JSON receipt.
7. **Settling**: Next.js automatically POSTs receipt to `http://localhost:8000/api/charge/stop` and displays final bill and refund amount!

### 3. Virtual Hardware Simulator Mode (Crucial for Demo & Grading)
- Include a toggle: **"Use Mock ESP32 Hardware"**.
- Allows anyone on the team or judges to experience the full flow on laptops/phones without needing physical ESP32 boards in hand!

---

## 🧪 Testing Checklist
- [ ] Clicking "Simulate Offline Charge" simulates BLE transfer of `session_token`.
- [ ] Gauge increments power up to a simulated cutoff (e.g. 8.42 kWh).
- [ ] Receipt is generated and verified with HMAC.
- [ ] Server returns settlement confirmation and the wallet balance updates live on screen!
