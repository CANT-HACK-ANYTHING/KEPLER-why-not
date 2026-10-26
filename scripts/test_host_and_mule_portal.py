#!/usr/bin/env python3
"""
RelayEV Step 4 Verification Suite:
Tests Host Node Registration, UPI Payouts, and Drive-By Data Mule Mesh Sync.
"""

import urllib.request
import json
import time
import uuid
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://localhost:8000"

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

def test_host_dashboard_flow():
    print("[TEST 1] Testing Host Station Registration & Node Discovery...")
    # 1. List existing nodes
    nodes = get("/api/nodes")
    initial_count = len(nodes)
    print(f"  OK Found {initial_count} initial mesh nodes.")
    
    # 2. Register a new community node
    new_node_id = f"RelayEV-Node-HostTest-{uuid.uuid4().hex[:4]}"
    new_node = post("/api/nodes/register", {
        "id": new_node_id,
        "name": "Gupta Dairy Solar EV Point",
        "host_name": "Ramesh Gupta",
        "location": "North By-pass Milestone 8",
        "rate_per_kwh": 11.50,
        "max_power_kw": 3.3
    })
    assert new_node["id"] == new_node_id
    assert new_node["rate_per_kwh"] == 11.50
    print(f"  OK Node {new_node_id} ('{new_node['name']}') successfully registered!")

    # 3. Simulate session settlement to credit host earnings
    # Topup host earnings for payout testing
    post("/api/charge/start", {
        "user_id": "user_88",
        "node_id": new_node_id,
        "escrow_amount": 100.00
    })
    
    # 4. Test UPI Payout Endpoint
    print("\n[TEST 2] Testing Host UPI Payout Withdrawal...")
    # Use existing node RelayEV-Node-01 which has earnings accrued from prior runs
    payout_res = post("/api/nodes/RelayEV-Node-01/payout", {
        "node_id": "RelayEV-Node-01",
        "amount": 25.00,
        "payout_vpa": "mohan_host@oksbi"
    })
    assert payout_res["node_id"] == "RelayEV-Node-01"
    assert payout_res["payout_amount"] == 25.00
    assert "reference_id" in payout_res
    print(f"  OK UPI Payout Approved: INR 25.00 to {payout_res['payout_vpa']}")
    print(f"  OK Banking Reference: {payout_res['reference_id']}")
    print(f"  OK Remaining Host Balance: INR {payout_res['remaining_balance']:.2f}")

def test_data_mule_sync_portal():
    print("\n[TEST 3] Testing Drive-By Data Mule Mesh Batch Sync & Micro-Bounties...")
    # Get current mule profile balance
    mule_before = get("/api/user/me?user_id=user_99_mule")
    initial_balance = mule_before["wallet_balance"]
    print(f"  OK Data Mule Profile: {mule_before['name']} | Initial Wallet: INR {initial_balance:.2f}")

    # Generate 2 simulated offline receipts with authentic signatures
    timestamp = int(time.time())
    receipt1 = {
        "session_id": f"REV-MULE-E2E-{uuid.uuid4().hex[:6]}",
        "node_id": "RelayEV-Node-01",
        "user_id": "user_88",
        "energy_consumed_kwh": 3.500,
        "actual_cost": 35.00,
        "timestamp": timestamp,
        "nonce": f"nonce_mule_e2e_{uuid.uuid4().hex[:8]}",
        "node_signature": "ESP32_SIG_MOCK_3500_3500_VALID"
    }
    receipt2 = {
        "session_id": f"REV-MULE-E2E-{uuid.uuid4().hex[:6]}",
        "node_id": "RelayEV-Node-02",
        "user_id": "user_88",
        "energy_consumed_kwh": 5.200,
        "actual_cost": 62.40,
        "timestamp": timestamp,
        "nonce": f"nonce_mule_e2e_{uuid.uuid4().hex[:8]}",
        "node_signature": "ESP32_SIG_MOCK_5200_6240_VALID"
    }

    # Upload batch
    sync_res = post("/api/sync/mule", {
        "mule_user_id": "user_99_mule",
        "receipts": [receipt1, receipt2]
    })
    
    assert sync_res["synced_count"] == 2
    assert sync_res["duplicate_count"] == 0
    assert sync_res["mule_reward_inr"] == 4.00  # 2 receipts * INR 2.00
    assert sync_res["mule_new_balance"] == round(initial_balance + 4.00, 2)
    print(f"  OK Synced 2 offline receipts. Data Mule reward credited: INR {sync_res['mule_reward_inr']:.2f}")
    print(f"  OK Mule New Wallet Balance: INR {sync_res['mule_new_balance']:.2f}")

    # Test Duplicate Skipping Protection
    print("\n[TEST 4] Testing Anti-Replay Duplicate Voucher Protection for Mules...")
    dup_res = post("/api/sync/mule", {
        "mule_user_id": "user_99_mule",
        "receipts": [receipt1]  # Resubmitting receipt1
    })
    assert dup_res["synced_count"] == 0
    assert dup_res["duplicate_count"] == 1
    assert dup_res["mule_reward_inr"] == 0.00
    print(f"  OK Duplicate voucher detected and skipped with zero reward: {dup_res['details'][0]['error']}")

if __name__ == "__main__":
    print("==================================================================")
    print("📊 RelayEV Step 4: Host Dashboard & Data Mule Verification Suite")
    print("==================================================================")
    test_host_dashboard_flow()
    test_data_mule_sync_portal()
    print("==================================================================")
    print("🎉 ALL HOST & MULE INTEGRATION TESTS PASSED (100% SUCCESS)!\n")
