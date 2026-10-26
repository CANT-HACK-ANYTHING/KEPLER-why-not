# Role 1: Cloud Map & Node Discovery Engineer

## 🚦 Status: 🟡 IN PROGRESS (Step 3)

## 🎯 Primary Mission
Build the interactive rural EV charging map in Next.js (App Router, Tailwind CSS, Leaflet) where drivers locate offline stations, view tariffs, and click to initiate escrow and charging.

---

## 📁 Workspace & Key Files
- Work primarily in: `frontend/src/`
- Target page: `frontend/src/app/page.tsx`
- Key Components:
  - `frontend/src/components/MapViewer.tsx` (Dynamic Leaflet Map)
  - `frontend/src/components/StationDrawer.tsx` (Bottom sheet for tariff and station details)
  - `frontend/src/components/WalletBadge.tsx` (Live balance for `user_88`)
- Database Client: `frontend/src/lib/supabaseClient.ts`

---

## 🛠️ Step-by-Step Implementation Guide

### 1. Leaflet Map Setup
- Install dependencies: `npm install leaflet react-leaflet @types/leaflet`
- Import Leaflet CSS in `layout.tsx` or `globals.css`:
  ```css
  @import "leaflet/dist/leaflet.css";
  ```
- Because Leaflet requires the browser `window` object, load `MapViewer` dynamically with `{ ssr: false }`.

### 2. Plotting Rural Nodes with Status Pins
- Fetch nodes from Supabase (`supabase.from('nodes').select('*')`) or from FastAPI (`GET /api/nodes`).
- Pin coordinates:
  - **Dharwad Hub:** `[15.4589, 75.0078]`
  - **Alnavar Forest Station:** `[15.4342, 74.7351]`
  - **Kalghatgi Cooperative:** `[15.1783, 74.9744]`
- Custom pin markers color-coded by status:
  - 🟢 **Green Pin**: `available` (Ready to charge)
  - 🟡 **Amber Pin**: `busy` (Vehicle currently charging)
  - 🔴 **Red Pin**: `offline_fault` (Station error)

### 3. Station Drawer & Action Card
When the driver clicks a pin on the map, open a drawer/card displaying:
- **Station Name & Address**: e.g. *Dharwad Agri-Solar Hub (NH-48 Bypass)*
- **Tariff Rate**: `₹12.50 / kWh`
- **Power Capacity**: `3.3 kW AC Rural Charger`
- **Last Synced**: Telemetry timestamp from the last visiting driver.
- **Action Button**: **"Initiate Charge (Lock Escrow)"**
  - Triggers Person 2's `POST /api/charge/start` with `{ user_id: 'user_88', node_id, escrow_amount: 200.00 }`.
  - Passes the resulting `session_token` to Person 3's BLE connector!

### 4. Supabase Realtime Live Listener
Subscribe to instant node updates without reloading:
```typescript
supabase
  .channel('nodes-status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nodes' }, (payload) => {
    // Update local state so map pin color changes instantly
  })
  .subscribe();
```

---

## 🧪 Testing Checklist (Must Pass Before Step 4)
- [ ] Map renders centered on rural Karnataka cluster (`[15.35, 74.95]`).
- [ ] All 3 stations show on the map with correct status badges.
- [ ] Clicking a pin displays the tariff and specs card.
- [ ] If someone changes status in Supabase from `available` to `busy`, the pin changes to Amber live.
