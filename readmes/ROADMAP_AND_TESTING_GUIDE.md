# ⚡ RelayEV Sprint Execution Roadmap
## Rule of the Sprint: "Complete 1 Step ➡️ Test It Live ➡️ Only Then Proceed to the Next"

Do not skip ahead or write code for step N+1 until step N passes its verification test.

---

## 🚦 Status Dashboard

| Step | Focus Area | Owner | Status | Verification Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | **Scaffolding & Server Setup** | All | ✅ **DONE** | FastAPI imports verified, Next.js installed, Supabase clients configured. |
| **Step 2A** | **Escrow Stop Endpoint & Atomic DB RPC** | Person 2 | ✅ **DONE** | `POST /api/charge/stop` written with HMAC check and PostgreSQL RPC written in `schema.sql`. |
| **Step 2B** | **Escrow Start Endpoint (`/api/charge/start`)** | Person 2 | 🟡 **NEXT (In Progress)** | Locks funds in wallet, mints signed offline JWT token, inserts transaction in DB. |
| **Step 3** | **Interactive Map & Discovery** | Person 1 | ⏳ Queued | Displays 3 rural nodes from Supabase, color-coded pins, tariff drawer. |
| **Step 4** | **WebBLE Bridge & Mock ESP32 Simulator** | Person 3 | ⏳ Queued | Connects to hardware, pushes JWT, pulls receipt, triggers `/api/charge/stop`. |

---

## 🎯 What To Do RIGHT NOW: Finish & Test Step 2

### 1. Execute SQL in Supabase (Action for Team)
Open your **Supabase Dashboard** ➡️ **SQL Editor** ➡️ Paste and run all of [`backend/schema.sql`](../backend/schema.sql).
- Creates `users` (seeds `user_88` with 1000 balance).
- Creates `nodes` (seeds Dharwad, Alnavar, Kalghatgi stations).
- Creates `transactions` table.
- Creates the atomic `settle_charge_transaction` RPC function.

### 2. Implement `POST /api/charge/start` (Completing the Escrow Pair)
To test `POST /api/charge/stop`, we first need `POST /api/charge/start` to lock the escrow and issue the initial transaction.

---

## 🧪 How Each Role Tests Their Step Before Proceeding

### 👤 Person 2: Testing the Escrow Engine (FastAPI)
1. **Start backend server:**
   ```powershell
   cd backend
   .\venv\Scripts\activate
   uvicorn main:app --reload --port 8000
   ```
2. **Test 1: Call `POST /api/charge/start`**
   - Locks ₹200 from `user_88`.
   - Returns a signed JWT token and a transaction `tx_id`.
   - *Pass check:* Check Supabase — `wallet_balance` is now 800, `locked_escrow_balance` is 200.
3. **Test 2: Call `POST /api/charge/stop`**
   - Send the simulated receipt with 8.42 kWh delivered.
   - *Pass check:* Server returns 200 OK, `wallet_balance` is refunded the change, transaction is marked `settled`.
4. **Test 3: Tamper Test**
   - Change 1 digit in signature or kWh ➡️ Server must reject with `403 Forbidden`.

👉 **Only when all 3 tests pass, mark Step 2 DONE.**

---

### 👤 Person 1: Testing the Map & Discovery (Next.js)
1. **Start frontend server:**
   ```powershell
   cd frontend
   npm run dev
   ```
2. Open `http://localhost:3000/map`.
3. **Pass checks:**
   - [ ] All 3 rural stations appear on the map with accurate pins.
   - [ ] Clicking a pin opens a card showing Tariff (₹/kWh) and station name.
   - [ ] Changing a node's status in Supabase table from `available` to `busy` immediately changes the pin color on screen without page refresh.

👉 **Only when all 3 tests pass, mark Step 3 DONE.**

---

### 👤 Person 3: Testing the WebBLE / Mock Simulator
1. In the frontend app, open the Charging Drawer for a selected station.
2. Click **"Simulate Offline Charge"** (or connect real ESP32).
3. **Pass checks:**
   - [ ] WebBLE pushes the JWT token from Person 2's start endpoint.
   - [ ] Simulator counts energy delivered (e.g. 5.2 kWh).
   - [ ] Automatically generates HMAC signature and calls `POST /api/charge/stop`.
   - [ ] Screen displays "Session Complete: ₹XX refunded to wallet!".

👉 **Final integration complete.**
