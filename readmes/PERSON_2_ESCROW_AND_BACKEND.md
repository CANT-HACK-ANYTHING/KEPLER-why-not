# Role 2: Financial Escrow & Cryptography Engineer

## 🚦 Status: ✅ COMPLETED & VERIFIED (Step 2)

## 🎯 Primary Mission
Built the FastAPI backend engine that handles atomic financial escrow holds (`POST /api/charge/start`), mints tamper-proof offline JWT tokens, and settles verified offline ESP32 hardware receipts (`POST /api/charge/stop`) with atomic refunds.

---

## 📁 Key Files Built
- Core API: `backend/main.py`
- Supabase Client: `backend/supabase_client.py`
- PostgreSQL Database & Atomic RPCs: `backend/schema.sql`
- Automated Test Suite: `backend/test_escrow_loop.py`

---

## 🛠️ Implemented Architecture & Endpoints

### 1. `POST /api/charge/start`
- **What it does:** Locks funds into escrow and mints signed offline JWT token for ESP32.
- **Request:**
  ```json
  {
    "user_id": "user_88",
    "node_id": "node_esp32_01",
    "escrow_amount": 200.00
  }
  ```
- **Execution:**
  1. Checks user wallet balance >= ₹200 and node status == `available`.
  2. Runs PostgreSQL RPC `lock_escrow_for_charge`: atomically holds balance and marks station `busy`.
  3. Mints signed JWT token (`session_token`) encoded with `max_kwh = escrow_amount / tariff`.
  4. Returns `session_token` and `tx_id`.

### 2. `POST /api/charge/stop`
- **What it does:** Settles offline receipt, refunds unspent money, frees station.
- **Request:**
  ```json
  {
    "tx_id": "<uuid>",
    "offline_receipt": {
      "tx_id": "<uuid>",
      "node_id": "node_esp32_01",
      "kwh_delivered": 8.42,
      "timestamp_end": 1730003600
    },
    "signature": "<esp32_hmac_sha256>"
  }
  ```
- **Execution:**
  1. Cryptographically verifies HMAC-SHA256 signature using `JWT_SECRET`. Rejects forged data with `403 Forbidden`.
  2. Calculates bill: `final_cost = kwh_delivered * tariff`.
  3. Calculates refund: `refund_amount = escrow_amount - final_cost`.
  4. Runs PostgreSQL RPC `settle_charge_transaction`: unlocks hold, deposits refund to `wallet_balance`, marks transaction `settled`, and sets node back to `available`.

---

## 🧪 Verification & Test Command
To verify at any time:
```powershell
cd backend
.\venv\Scripts\python test_escrow_loop.py
```
*(Confirms 200 OK escrow locks, HMAC verification, refund accuracy, and 403 anti-tampering rejection).*
