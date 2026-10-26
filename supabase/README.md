# RelayEV Supabase Integration & 20 Stations Cloud Setup

This directory contains the database schema, seeds, and migrations for running RelayEV backed by **Supabase Cloud (PostgreSQL + PostgREST + Realtime)**.

---

## ⚡ Quick Start: Connecting Supabase to RelayEV

### 1. Create a Supabase Project
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project** and select region (e.g., `ap-south-1` Mumbai / India).
3. Once provisioned, navigate to **Project Settings → API**.
4. Copy the following credentials:
   - `Project URL`
   - `anon public` key
   - `service_role secret` (for backend admin operations)

---

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the root (or `backend/.env` and `frontend/.env.local`):

```bash
# Backend (.env or backend/.env)
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_KEY=<your-service-role-or-anon-key>

# Frontend (frontend/.env.local)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
```

---

### 3. Apply Schema & Seed 20 Stations
You can seed the 20 charging stations in **two easy ways**:

#### Option A: Run the Automated Python Seeder (Recommended)
From project root:
```bash
python scripts/seed_supabase_20_nodes.py
```
This script will:
- Connect directly to your Supabase project via PostgREST.
- Create / upsert all 20 charging stations and host profiles.
- Synchronize your local edge database (`backend/relay_ev.db`) simultaneously.

#### Option B: Run in Supabase SQL Editor
1. In your Supabase Dashboard, open **SQL Editor**.
2. Click **New Query**.
3. Paste the contents of [`supabase/seed.sql`](./seed.sql).
4. Click **Run**. All 20 stations and host users will be instantly loaded into your database with full Row Level Security (RLS) enabled.

---

## 📍 20 Verified Stations Dataset Breakdown

The dataset covers the Vellore Highway & Rural EV Mesh Corridor with realistic dynamic tariffs:

| Station ID | Station Name | Power | Grid State | Base Tariff | Dynamic Tariff | Highlights |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `node_esp32_01` | VIT Campus Solar Relay | 3.3 kW | 🟢 Surplus | ₹10.00 | ₹8.00/kWh | 100% Rooftop solar + PZEM-004T |
| `node_esp32_02` | Katpadi Junction Point | 3.3 kW | 🟡 Normal | ₹12.50 | ₹12.50/kWh | Railway junction service road |
| `node_esp32_03` | Sripuram Golden Temple Hub | 7.2 kW | 🟢 Surplus | ₹8.50 | ₹6.80/kWh | Fast AC pilgrim rest area |
| `node_esp32_04` | Vellore Fort Heritage Tap | 3.3 kW | 🟡 Normal | ₹11.00 | ₹11.00/kWh | Moat garden shade & tea tap |
| `node_esp32_05` | Bagayam Rural Clean Hub | 3.3 kW | 🟢 Surplus | ₹9.50 | ₹7.60/kWh | CMC campus solar buffer |
| `node_esp32_06` | Ranipet Industrial Relay | 7.4 kW | 🔴 Strained | ₹13.00 | ₹17.55/kWh | SIPCOT heavy cargo line |
| `node_esp32_07` | Ambur Leather Town Node | 3.3 kW | ⚡ Battery | ₹12.00 | ₹14.40/kWh | Biryani expressway rest stop |
| `node_esp32_08` | Sholinghur Hill Temple | 3.3 kW | 🔴 Strained | ₹10.50 | ₹14.18/kWh | Pilgrim hill battery buffer |
| `node_esp32_09` | Walajah Highway Toll Dhaba | 7.2 kW | ⚡ Battery | ₹14.00 | ₹16.80/kWh | 24/7 overnight fenced bay |
| `node_esp32_10` | Gudiyatham Agro Feeder | 3.3 kW | 🟢 Surplus | ₹9.00 | ₹7.20/kWh | Agro market solar canopy |
| `node_esp32_11` | Arcot Royal Palace Tap | 3.3 kW | 🟡 Normal | ₹10.50 | ₹10.50/kWh | Arcot sweet corner tap |
| `node_esp32_12` | Vaniyambadi Biryani Stop | 7.4 kW | 🟢 Surplus | ₹13.50 | ₹10.80/kWh | Highway 32A solar canopy |
| `node_esp32_13` | Pallikonda Toll Safe Rest | 3.3 kW | ⚡ Battery | ₹12.00 | ₹14.40/kWh | Night rest area 16A socket |
| `node_esp32_14` | Melvisharam Tannery Node | 3.3 kW | 🔴 Strained | ₹11.50 | ₹15.53/kWh | Industrial feeder surge zone |
| `node_esp32_15` | Tiruvallam Bridge Tap | 3.3 kW | 🟢 Surplus | ₹9.00 | ₹7.20/kWh | Riverbed coconut grove tap |
| `node_esp32_16` | Sathuvachari Expressway | 3.3 kW | 🟡 Normal | ₹10.00 | ₹10.00/kWh | District collectorate transit |
| `node_esp32_17` | VIT Lake Back-Gate Eco-Tap | 3.3 kW | 🟢 Surplus | ₹8.00 | ₹6.40/kWh | Student micro-grid research |
| `node_esp32_18` | Vellore Old Town Bazaar | 3.3 kW | 🔴 Strained | ₹12.50 | ₹16.88/kWh | Long Bazaar 3W delivery bay |
| `node_esp32_19` | Otteri Lake Nature Relay | 7.2 kW | 🟡 Normal | ₹10.00 | ₹10.00/kWh | Eco-park dual charging bay |
| `node_esp32_20` | Arakkonam Rail Hub | 7.4 kW | ⚡ Battery | ₹11.00 | ₹13.20/kWh | Railway junction battery bank |

---

## 🔒 Offline & Edge Fallback
If Supabase is temporarily unreachable (e.g., driver in an offline dead zone), RelayEV **seamlessly transitions to local SQLite WAL mode** with zero downtime. As soon as cellular connectivity returns, the Data Mule or PWA background sync updates Supabase PostgREST automatically.
