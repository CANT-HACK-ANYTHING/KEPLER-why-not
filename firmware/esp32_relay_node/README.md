# RelayEV ESP32 Hardware Node Firmware

> **Production C++ / Arduino firmware for the RelayEV decentralized rural EV charging station.**  
> Powers the ₹1,500 open-hardware node with **Peacefair PZEM-004T v3.0 AC energy metering**, **30A heavy-duty optoisolated relay actuation**, **Web Bluetooth (WebBLE) GATT server**, **on-chip mbedtls HMAC-SHA256 cryptography**, and **SPIFFS flash storage for Drive-By Data Mules**.

---

## 🔌 Hardware Bill of Materials (BOM)

| Component | Specification | Function | Approx Cost (INR) |
|---|---|---|---|
| **Microcontroller** | ESP32-WROOM-32 or ESP32-S3 | WebBLE GATT Server, Cryptographic Engine & State Controller | ₹350 - ₹450 |
| **AC Energy Meter** | Peacefair PZEM-004T v3.0 + CT Coil | 80-260V AC, 0-100A, Voltage, Current, Power & kWh | ₹650 - ₹750 |
| **Heavy-Duty Relay** | 30A 250V AC Optoisolated Relay Module (SLA-05VDC-SL-A) | Disconnects/Connects 230V 16A/32A EV charging circuit | ₹120 - ₹180 |
| **Power Supply** | Hi-Link HLK-PM01 (5V 3W AC-DC Step-Down) | Powers ESP32 & Relay directly from 230V AC mains | ₹160 - ₹200 |
| **Indicators & Switch** | Blue LED, Red LED, Momentary Pushbutton, Resistors | Visual status, fault lockout, manual emergency cutoff | ₹30 - ₹50 |
| **Enclosure & Socket** | IP65 Weatherproof Junction Box + 16A 3-pin Industrial Socket | Outdoor rural deployment housing | ₹250 - ₹350 |
| **Total Node Cost** | | | **~₹1,500 - ₹1,800** |

---

## 📐 Circuit Wiring & Pinout

### 1. Low-Voltage DC Control Connections

```text
       ESP32 Board                             Peripherals
  +------------------+                    +---------------------+
  |                  |                    |  PZEM-004T v3.0     |
  |             3.3V |------------------->| VCC (3.3V/5V)       |
  |              GND |------------------->| GND                 |
  |     GPIO 16 (RX) |<-------------------| TX                  |
  |     GPIO 17 (TX) |------------------->| RX (via 1k divider) |
  |                  |                    +---------------------+
  |                  |                    
  |                  |                    +---------------------+
  |     GPIO 23      |------------------->| 30A Relay IN (Coil) |
  |              GND |------------------->| Relay GND           |
  |               5V |------------------->| Relay VCC (5V)      |
  |                  |                    +---------------------+
  |                  |                    
  |     GPIO 2       |----[ 330Ω ]------->| Status LED (Blue)   |
  |     GPIO 4       |----[ 330Ω ]------->| Fault LED (Red)     |
  |     GPIO 0       |------------------->| Emergency Stop Btn  |
  +------------------+
```

### 2. High-Voltage 230V AC Wiring

> ⚠️ **DANGER - HIGH VOLTAGE**: Disconnect AC mains breaker before wiring. Ensure protective Earth is grounded directly to the chassis and socket Earth terminal.

```text
AC Mains 230V Live (L) ───────> 30A Relay COM ───[ Normally Open (NO) ]───> CT Coil ───> 16A EV Socket (L)
AC Mains Neutral (N)   ─────────────────────────────────────────────────────────────> 16A EV Socket (N)
Earth (E)              ─────────────────────────────────────────────────────────────> 16A EV Socket (E)
```

---

## ⚡ BLE GATT Specifications

### Service UUID: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`

| Characteristic | UUID | Properties | Purpose |
|---|---|---|---|
| **Session Token Write** | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | `WRITE`, `WRITE_NR` | Driver phone pushes backend-signed JWT or JSON session token. |
| **Receipt Notify** | `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e` | `READ`, `NOTIFY` | ESP32 emits HMAC-SHA256 signed JSON receipt upon charging finish. |
| **Live Telemetry** | `5b9d36e8-23f4-4a5c-9c7a-8f1d3e5b7a9c` | `READ`, `NOTIFY` | Streams live Voltage, Current, kW, and kWh every 1 second. |
| **Mule Sync Mesh** | `c18d09f2-66b2-4d1e-84b7-5a12ef8b3a01` | `READ`, `WRITE` | Passing Data Mules download stranded offline receipts from flash. |

---

## 🛠️ Flashing & Build Instructions

### Option A: Using PlatformIO (Recommended)
1. Open the directory `firmware/esp32_relay_node` in VSCode with PlatformIO installed.
2. Connect your ESP32 board via micro-USB / USB-C.
3. Build and upload:
   ```bash
   pio run -t upload
   pio device monitor -b 115200
   ```

### Option B: Using Arduino IDE
1. Open Arduino IDE (v2.x or v1.8.x).
2. Go to **File -> Preferences -> Additional Boards Manager URLs**:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Install **esp32 by Espressif Systems** via Board Manager.
4. Select Board: **ESP32 Dev Module** or **ESP32S3 Dev Module**.
5. Set Partition Scheme: **Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)**.
6. Open `esp32_relay_node.ino` and click **Upload**.

---

## 🧪 Testing & Verification

### 1. Serial Monitor Verification (Zero-Hardware Simulation Mode)
Open Serial Monitor at **115200 baud**:
- Type `START` and press Enter: Synthesizes an authorized escrow session voucher, closes the relay, and starts simulated EV power delivery.
- Watch live telemetry increment in real-time until the 8.420 kWh cutoff.
- Watch the on-chip HMAC-SHA256 signature calculate automatically.
- Type `STATUS` to verify flash storage records and relay contact state.
- Type `MULE` to inspect the stranded offline receipts awaiting a Data Mule.

### 2. Live Web Bluetooth Testing
1. Run the Next.js frontend (`cd frontend && npm run dev`).
2. Open Chrome or Edge on `http://localhost:3000`.
3. Click "Start Charging" on node `RelayEV-Node-01`.
4. Select `RelayEV-Node-01` in the native browser pairing dialog.
5. The phone writes the session token over WebBLE, the ESP32 relay closes, and live telemetry renders on screen!
