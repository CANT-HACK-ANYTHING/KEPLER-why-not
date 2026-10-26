import urllib.request
import json
import hmac
import hashlib
import time
import uuid

BASE_URL = "http://127.0.0.1:8000"
SECRET_KEY = "relay_ev_hardware_master_secret_2026"

def post(endpoint, data):
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))

def get(endpoint):
    with urllib.request.urlopen(f"{BASE_URL}{endpoint}") as res:
        return json.loads(res.read().decode("utf-8"))

print("[TEST 1] Resetting user_88 wallet balance to INR 500.00...")
post("/api/user/reset_balance", {"user_id": "user_88", "amount": 500.00})
user = get("/api/user/me")
assert user["wallet_balance"] == 500.00, f"Expected 500.00, got {user['wallet_balance']}"
print(f"  OK User balance verified: INR {user['wallet_balance']:.2f}")

print("\n[TEST 2] Person 2 API: POST /api/charge/start to lock escrow...")
start_res = post("/api/charge/start", {
    "user_id": "user_88",
    "node_id": "RelayEV-Node-01",
    "escrow_amount": 100.0
})
session_id = start_res["session_id"]
session_token = start_res["session_token"]
assert session_token, "session_token must be returned"
assert start_res["user_remaining_balance"] == 400.0, f"Expected 400.0, got {start_res['user_remaining_balance']}"
print(f"  OK Escrow locked: INR 100.00. Session ID: {session_id}")
print(f"  OK Cryptographic session_token generated: {session_token[:40]}...")
print(f"  OK User remaining balance: INR {start_res['user_remaining_balance']:.2f}")

print("\n[TEST 3] Role 3 Simulator: Emulating BLE transfer & charging to 8.42 kWh cutoff...")
target_kwh = 8.42
rate = 10.0
actual_cost = round(target_kwh * rate, 2)  # 84.20
message = f"{session_id}:{target_kwh:.3f}:{actual_cost:.2f}".encode("utf-8")
node_signature = hmac.new(SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()
print(f"  OK Simulated energy delivered: {target_kwh} kWh (Cutoff reached)")
print(f"  OK Actual bill calculated: INR {actual_cost:.2f}")
print(f"  OK HMAC-SHA256 signature generated: {node_signature}")

print("\n[TEST 4] Next.js Auto-settle: POST /api/charge/stop...")
stop_res = post("/api/charge/stop", {
    "session_id": session_id,
    "node_id": "RelayEV-Node-01",
    "user_id": "user_88",
    "energy_consumed_kwh": target_kwh,
    "actual_cost": actual_cost,
    "node_signature": node_signature,
    "timestamp": int(time.time()),
    "nonce": f"test_nonce_{int(time.time())}_{uuid.uuid4().hex[:6]}"
})
assert stop_res["signature_verified"] is True, "Signature must be verified!"
assert stop_res["refund_amount"] == 15.80, f"Expected refund 15.80, got {stop_res['refund_amount']}"
assert stop_res["user_new_balance"] == 415.80, f"Expected 415.80, got {stop_res['user_new_balance']}"
print(f"  OK HMAC Cryptographic Signature Verified: {stop_res['signature_verified']}")
print(f"  OK Status: {stop_res['status']}")
print(f"  OK Escrow: INR {stop_res['escrow_amount']:.2f} | Bill: INR {stop_res['actual_cost']:.2f} | Refund: INR {stop_res['refund_amount']:.2f}")
print(f"  OK User new balance returned: INR {stop_res['user_new_balance']:.2f}")

print("\n[TEST 5] Checking live driver profile balance...")
final_user = get("/api/user/me")
assert final_user["wallet_balance"] == 415.80, f"Expected 415.80, got {final_user['wallet_balance']}"
print(f"  OK Live wallet balance updated: INR {final_user['wallet_balance']:.2f}")

print("\nALL ROLE 3 TESTING CHECKLIST CRITERIA VERIFIED 100% SUCCESSFULLY!")
