# ⚡ RelayEV: Master Project Context & AI Agent Handoff Document

> **Audience:** Any AI coding assistant, human engineer, or evaluator stepping into the RelayEV codebase.  
> **Repository Root:** `c:\sustainathon`  
> **Status as of Sprint:** Backend Escrow Engine (100% verified), Map & Station Discovery UI (100% compiled & tested), WebBLE Handshake Protocol (Defined), Hardware ESP32 Implementation (In Progress).

---

## 1. Executive Summary & Problem Statement

In rural, mountainous, and remote agricultural areas, reliable cellular coverage and Wi-Fi are practically non-existent. Traditional EV charging networks (e.g., Tesla Supercharger, ChargePoint) rely on persistent internet connections to authorize payments and communicate with central cloud servers via OCPP. When connectivity drops, charging stations fail.

**RelayEV** solves this by creating an **offline-first rural EV charging mesh**. The physical charging station (**ESP32 micro-controller + Relay + Power Meter**) operates **100% disconnected from the internet**. 

Instead of requiring cellular towers at every charging pole, **the driver’s smartphone acts as an opportunistic cryptographic data mule**:
1. When in coverage (or via local cache), the phone contacts the Cloud to place funds into an **escrow vault** and receives a **tamper-proof signed authorization token**.
2. At the station, the phone pairs with the offline ESP32 over **Web Bluetooth (WebBLE)** and beams the token.
3. The ESP32 validates the token locally, turns on the power relay, and meters electricity consumed.
4. When done, the ESP32 produces a cryptographically signed **offline receipt**.
5. Once the phone regains internet access, it submits the receipt to the Cloud, which **settles the escrow and refunds the unused change** to the driver's wallet.

---

## 2. Technical Stack & Architecture

- **Frontend:** Next.js (App Router, React 19, TypeScript), Tailwind CSS v4, Lucide Icons, Leaflet / React-Leaflet.
- **Backend:** Python FastAPI, Uvicorn, PyJWT, Cryptography, Pydantic v2.
- **Database:** Supabase (PostgreSQL with Row-Level Security, Atomic Stored Procedures / RPCs, Realtime WebSockets). Also features an **auto-fallback In-Memory Mock Engine** for zero-config offline testing.
- **Hardware Bridge:** Web Bluetooth API (`navigator.bluetooth` GATT protocol).
- **Embedded Hardware:** ESP32 (Single or Dual-Core DevKit), Relay Module, Current/Energy Sensor (ACS712 / PZEM-004T).
- **Mobile Target:** Prepared for Android APK wrapping via Capacitor (`output: 'export'`).

---

## 3. The 4-Stage Cryptographic Data Loop

```text
       ┌────────────────────────────────────────────────────────┐
       │             Cloud (FastAPI + Supabase)                 │
       │  • User Wallet: ₹1000                                  │
       │  • Station Directory: Geo-coordinates & Tariff Rates   │
       └─────────────────────────┬──────────────────────────────┘
                                 │
     (1) POST /api/charge/start   │ (5) POST /api/charge/stop
     • Locks ₹200 deposit        │ • Submits offline receipt + signature
     • Mints signed offline JWT  │ • Reconciles bill (8.42 kWh × ₹12.50 = ₹105.25)
                                 │ • Refunds change (₹94.75) to wallet
                                 ▼
       ┌────────────────────────────────────────────────────────┐
       │             Driver's Phone (Next.js WebBLE)            │
       │  • Interactive Map of Rural Nodes                      │
       │  • Bluetooth GATT Client (navigator.bluetooth)         │
       └─────────────────────────┬──────────────────────────────┘
                                 │
     (2) Write Characteristic    │ (4) Notify Characteristic
     • Beams signed JWT token    │ • Reads final signed consumption receipt
     • Enforces max kWh limit    │
                                 ▼
       ┌────────────────────────────────────────────────────────┐
       │          Offline Hardware Node (ESP32)                 │
       │  • NO INTERNET / NO CELLULAR                           │
       │  • Verifies JWT claims locally                         │
       │  • Energizes Relay & meters electricity                │
       │  • Signs receipt with HMAC-SHA256 hardware seal        │
       └────────────────────────────────────────────────────────┘
```

---

## 4. Work Completed to Date

### Phase 1: Environment Scaffolding
- Next.js frontend initialized under `frontend/` with Tailwind CSS and Leaflet map support.
- Python FastAPI environment initialized under `backend/venv` with all cryptographic packages (`pyjwt`, `cryptography`, `supabase`, `fastapi`).

### Phase 2: Financial Escrow & Cloud Database (`backend/`)
- **`backend/schema.sql`**: Complete PostgreSQL schema with:
  - `users` table: Seeded with test driver `user_88` (₹1000 balance).
  - `nodes` table: Seeded with 3 rural nodes (`node_esp32_01` Dharwad, `node_esp32_02` Alnavar, `node_esp32_03` Kalghatgi).
  - `transactions` table: Tracks lifecycle (`escrow_locked` ➡️ `settled`).
  - **Atomic RPC `lock_escrow_for_charge`**: Prevents double-spend and atomically locks deposits.
  - **Atomic RPC `settle_charge_transaction`**: Prevents race conditions, deducts actual energy cost, refunds change, and marks station available.
- **`backend/main.py`**:
  - `POST /api/charge/start`: Locks deposit, mints 24-hr offline JWT token containing `max_kwh`.
  - `POST /api/charge/stop`: Validates canonical HMAC-SHA256 signature from ESP32. Rejects tampered payloads with `403 Forbidden`. Reconciles unspent change.
  - **Dual Mode Database**: Runs against live Supabase or automatically falls back to an in-memory mock engine if `.env` keys are empty.
- **Automated Verification**: `test_escrow.py` and `run_test.bat` verify all 6 financial/cryptographic steps.

### Phase 3: Station Discovery & UI (`frontend/`)
- **`frontend/src/components/MapViewer.tsx`**: Dynamic Leaflet map centered on rural Karnataka cluster with pulsing status pins (🟢 Available, 🟡 Busy, 🔴 Fault).
- **`frontend/src/components/StationDrawer.tsx`**: Mobile-responsive bottom sheet showing tariffs, escrow deposit selector (₹100, ₹200, ₹500), live kWh charging simulation, and settlement receipt.
- **`frontend/src/app/settle/page.tsx`**: Dedicated Visual Escrow Inspector showing live wallet deduction, offline token inspection, hacker attack simulation, and atomic refunds.

---

## 5. Hardware Specifications & Contract for ESP32

When building or reviewing the firmware on the ESP32:

### A. Cryptographic Secret
Must match backend secret:
```cpp
const char* JWT_SECRET = "relayev_super_secret_offline_mesh_key_2026";
```

### B. BLE GATT Profile
- **Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b` (RelayEV Primary Service)
- **Token Write Characteristic:** `beb5483e-36e1-4688-b7f5-ea07361b26a8`
  - Write Property. Receives the signed JWT token from the phone.
  - ESP32 extracts `tx_id` and `max_kwh`.
- **Receipt Read / Notify Characteristic:** `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e`
  - Read + Notify Property. ESP32 notifies phone with final JSON receipt + HMAC signature upon charge completion or disconnect.

### C. Pin Assignments
- **Relay Control:** GPIO 23 (Active LOW or HIGH depending on relay board).
- **Current / Energy Sensor:** GPIO 34 (Analog ADC) or PZEM-004T Serial (UART2 RX=16, TX=17).
- **Status LED:** GPIO 2 (Built-in Blue LED).
- **Manual Stop Button:** GPIO 0 (BOOT button).

---

## 6. Directory Map

```text
c:\sustainathon\
├── backend\
│   ├── main.py                  # Core FastAPI server & escrow endpoints
│   ├── schema.sql               # PostgreSQL schema & atomic RPC stored procedures
│   ├── supabase_client.py       # Supabase client singleton
│   ├── test_escrow_loop.py      # Automated loop test
│   ├── requirements.txt         # Python dependencies
│   └── venv\                    # Python virtual environment
├── frontend\
│   ├── src\
│   │   ├── app\
│   │   │   ├── page.tsx         # Main Driver App (Mobile Map + Charging Drawer)
│   │   │   ├── layout.tsx       # Root layout
│   │   │   ├── globals.css      # Tailwind v4 styles & Leaflet CSS
│   │   │   └── settle\page.tsx  # Visual Escrow Settlement Inspector
│   │   ├── components\
│   │   │   ├── MapViewer.tsx    # Leaflet map with pulsing pins
│   │   │   └── StationDrawer.tsx# Mobile charging drawer & WebBLE simulation
│   │   ├── lib\
│   │   │   └── supabaseClient.ts# Frontend Supabase SDK client
│   │   └── types\               # TypeScript data models
│   ├── package.json
│   └── next.config.ts           # Configured for static APK export ('export')
├── readmes\
│   ├── README.md                # General project overview
│   ├── ROADMAP_AND_TESTING_GUIDE.md # Sprint checklist & test criteria
│   ├── PERSON_1_MAP_AND_DISCOVERY.md # Map & UI specs
│   ├── PERSON_2_ESCROW_AND_BACKEND.md# Escrow & backend cryptography specs
│   └── PERSON_3_BLE_AND_HARDWARE_BRIDGE.md # Hardware & WebBLE bridge specs
├── test_escrow.py               # Comprehensive 6-step test suite
└── run_test.bat                 # One-click Windows test runner
```

---

## 7. How to Resume or Run Everything

### 1. Run Backend Server
```powershell
cd c:\sustainathon\backend
.\venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Run Frontend Web App
```powershell
cd c:\sustainathon\frontend
npm run dev -- -H 0.0.0.0
```
- Driver App: `http://localhost:3000` (or `http://<your-local-ip>:3000` on mobile)
- Escrow Settlement Demo: `http://localhost:3000/settle`
- Backend Swagger Docs: `http://localhost:8000/docs`

### 3. Run Automated Escrow Tests
```powershell
cd c:\sustainathon
.\run_test.bat
# Or: .\backend\venv\Scripts\python.exe test_escrow.py --direct
```
