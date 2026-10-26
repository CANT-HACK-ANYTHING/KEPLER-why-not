# ⚡ RelayEV Architecture & Team Guide

Welcome to the RelayEV engineering workspace! We are building an offline-first rural EV charging mesh connecting offline ESP32 micro-hubs with Supabase and FastAPI via Web Bluetooth on Next.js.

---

## 🚦 GOLDEN RULE FOR THE TEAM
> **"Complete 1 Step ➡️ Test It Live ➡️ Only Then Proceed to the Next"**
> 
> Detailed checklist & test scripts are in: [`readmes/ROADMAP_AND_TESTING_GUIDE.md`](./readmes/ROADMAP_AND_TESTING_GUIDE.md)

---

## 👥 3-Person Team Breakdown
Each team member has a dedicated implementation guide in the `/readmes` folder:

| Role | Guide File | Key Responsibilities |
| :--- | :--- | :--- |
| **Person 1** | [`readmes/PERSON_1_MAP_AND_DISCOVERY.md`](./readmes/PERSON_1_MAP_AND_DISCOVERY.md) | **Cloud Map & Station Discovery**: Interactive map, node pins, tariffs, drawer UI, and Supabase real-time status sync. |
| **Person 2** | [`readmes/PERSON_2_ESCROW_AND_BACKEND.md`](./readmes/PERSON_2_ESCROW_AND_BACKEND.md) | **Escrow Engine & Cryptography**: FastAPI `/api/charge/start` & `/stop`, wallet deduction, offline token minting & receipt verification. |
| **Person 3** | [`readmes/PERSON_3_BLE_AND_HARDWARE_BRIDGE.md`](./readmes/PERSON_3_BLE_AND_HARDWARE_BRIDGE.md) | **WebBLE Bridge & Hardware Simulator**: `navigator.bluetooth` GATT client to push JWT tokens, pull receipts, and virtual ESP32 simulator for testing. |

---

## 🚀 Running the Project Locally

### 1. Database Setup (Supabase)
1. Open your Supabase project's **SQL Editor**.
2. Run the SQL script from [`backend/schema.sql`](./backend/schema.sql) to create `users`, `nodes`, and `transactions` tables with pre-seeded data for `user_88`.

### 2. Backend (FastAPI)
```powershell
cd backend
.\venv\Scripts\activate
# Make sure your .env has SUPABASE_URL and SUPABASE_KEY
uvicorn main:app --reload --port 8000
```
API Documentation will be live at: `http://localhost:8000/docs`

### 3. Frontend (Next.js)
```powershell
cd frontend
# Make sure your .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```
Web App will be live at: `http://localhost:3000`

---

## 🔁 Complete Data Loop
```text
[Cloud: FastAPI + Supabase]
       │
       ▼ (1) Issue signed JWT Escrow Token (POST /api/charge/start)
[Phone: Next.js Web App]
       │
       ▼ (2) Push token over WebBLE GATT
[Hardware: Offline ESP32 Charger]
       │  (Meter power, charges EV, reaches max kWh or stopped)
       ▼ (3) Produce signed consumption receipt
[Phone: Next.js Web App]
       │
       ▼ (4) Relay offline receipt back to Cloud (POST /api/charge/stop)
[Cloud: Settle escrow, refund unused balance, persist in Supabase]
```
