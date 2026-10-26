#!/usr/bin/env python3
"""
RelayEV Person 2 (Backend & Supabase Cloud Lead) Automated Verification Suite
Verifies:
1. Supabase Cloud Connection & Dual-Mode PostgREST Adapter
2. Escrow Expiry Sweeper & Automated Wallet Refund Ledger
3. Cryptographic Receipt Verification & Dispute Resolution Engine
4. Cloud Mesh Telemetry & Analytics Overview
5. Supabase Database Webhook Event Consumption
"""

import sys
import io
import json
import time
import uuid
import hmac
import hashlib
import urllib.request
import urllib.error

# Ensure UTF-8 output on Windows PowerShell
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"

def api_request(endpoint: str, method: str = "GET", payload: dict = None):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload else None
    headers = {"Content-Type": "application/json"} if payload else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}

def run_verification():
    print("==================================================================")
    print("☁️ RelayEV Person 2 (Backend & Supabase Cloud Lead) Verification")
    print("==================================================================")

    # ------------------------------------------------------------------
    # TEST 1: Supabase Cloud Status & Features
    # ------------------------------------------------------------------
    print("\n[TEST 1] Checking Supabase Cloud REST Status & Capabilities...")
    code, status_data = api_request("/api/cloud/supabase/status")
    assert code == 200, f"Failed to get Supabase status: {status_data}"
    conn_status = status_data["connection_status"]
    features = status_data["features"]
    print(f"  OK Supabase Adapter Status: {conn_status}")
    print(f"  OK Active Cloud Features: {', '.join(features[:3])}...")

    # ------------------------------------------------------------------
    # TEST 2: Escrow Expiry Sweeper & Automated Refund Engine
    # ------------------------------------------------------------------
    print("\n[TEST 2] Testing Escrow Expiry Sweeper & Auto-Refund Ledger...")
    # Clean previous sweepers
    api_request("/api/charge/expire-sweeper", method="POST")
    api_request("/api/user/reset_balance", method="POST", payload={"user_id": "user_88", "amount": 500.00})

    # Start session with ₹150 escrow
    code, start_data = api_request("/api/charge/start", method="POST", payload={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 150.00
    })
    assert code == 200, f"Failed charge start: {start_data}"
    sid = start_data["session_id"]
    rem_bal = start_data["user_remaining_balance"]
    print(f"  OK Created Session: {sid} (Locked ₹150.00 | Wallet: ₹{rem_bal:.2f})")

    # Connect to SQLite to backdate expiration time for this test session
    import sqlite3
    import os
    db_path = os.path.join(os.path.dirname(__file__), "..", "backend", "relay_ev.db")
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE transactions SET expires_at = '2020-01-01T00:00:00' WHERE session_id = ?", (sid,))
    conn.commit()
    conn.close()

    # Trigger Sweeper
    code, sweep_data = api_request("/api/charge/expire-sweeper", method="POST")
    assert code == 200, f"Failed to run sweeper: {sweep_data}"
    assert sid in sweep_data["swept_sessions"], f"Session {sid} was not swept!"
    print(f"  OK Swept {sweep_data['swept_count']} expired session(s). Refunded ₹{sweep_data['total_refunded_inr']:.2f}")

    # Verify wallet balance
    code, user_data = api_request("/api/user/me?user_id=user_88")
    assert user_data["wallet_balance"] == 500.00, f"Expected 500.00, got {user_data['wallet_balance']}"
    print(f"  OK Driver wallet balance 100% restored: ₹{user_data['wallet_balance']:.2f}")

    # ------------------------------------------------------------------
    # TEST 3: Cryptographic Dispute & Receipt Verification Engine
    # ------------------------------------------------------------------
    print("\n[TEST 3] Testing Cryptographic Receipt Audit & Dispute Resolution...")
    secret = "relay_ev_hardware_master_secret_2026"
    test_sid = f"REV-AUDIT-{uuid.uuid4().hex[:8].upper()}"
    kwh = 6.450
    rate = 10.00
    expected_cost = 64.50
    canonical = f"{test_sid}:{kwh:.3f}:{expected_cost:.2f}"
    valid_hmac = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()

    # Case A: Authentic receipt
    code, audit_a = api_request("/api/charge/verify-receipt", method="POST", payload={
        "session_id": test_sid,
        "node_id": "RelayEV-Node-01",
        "energy_consumed_kwh": kwh,
        "actual_cost": expected_cost,
        "node_signature": valid_hmac,
        "nonce": f"nonce_{uuid.uuid4().hex[:6]}",
        "timestamp": int(time.time())
    })
    assert code == 200 and audit_a["audit_verdict"] == "VERIFIED_AUTHENTIC", f"Audit failed: {audit_a}"
    print(f"  OK Case A (Authentic): Verdict '{audit_a['audit_verdict']}' with HMAC match")

    # Case B: Tampered energy (12 kWh billed for only ₹64.50 on ₹10 rate)
    tampered_canonical = f"{test_sid}:12.000:{expected_cost:.2f}"
    tampered_hmac = hmac.new(secret.encode(), tampered_canonical.encode(), hashlib.sha256).hexdigest()
    code, audit_b = api_request("/api/charge/verify-receipt", method="POST", payload={
        "session_id": test_sid,
        "node_id": "RelayEV-Node-01",
        "energy_consumed_kwh": 12.000,
        "actual_cost": expected_cost,
        "node_signature": tampered_hmac,
        "nonce": f"nonce_{uuid.uuid4().hex[:6]}",
        "timestamp": int(time.time())
    })
    assert code == 200 and audit_b["audit_verdict"] == "TAMPERED_ENERGY_CALCULATION", f"Tamper detect failed: {audit_b}"
    print(f"  OK Case B (Tampered kWh): Verdict '{audit_b['audit_verdict']}' flagged successfully")

    # ------------------------------------------------------------------
    # TEST 4: Cloud Telemetry & Mesh Intelligence
    # ------------------------------------------------------------------
    print("\n[TEST 4] Testing Mesh Analytics Overview & Per-Node Telemetry...")
    code, overview = api_request("/api/analytics/overview")
    assert code == 200, f"Failed analytics overview: {overview}"
    print(f"  OK Network GMV: ₹{overview['total_gmv_inr']:.2f} | Total kWh: {overview['total_kwh_delivered']:.2f}")
    print(f"  OK Total Transactions: {overview['total_transactions_count']} | Active Nodes: {overview['active_nodes_count']}")

    code, node_stats = api_request("/api/analytics/node/RelayEV-Node-01")
    assert code == 200, f"Failed node analytics: {node_stats}"
    print(f"  OK Node {node_stats['node_id']} Status: {node_stats['uptime_status']} (Sessions: {node_stats['total_sessions']})")

    # ------------------------------------------------------------------
    # TEST 5: Supabase Database Webhook State Synchronization
    # ------------------------------------------------------------------
    print("\n[TEST 5] Testing Supabase Database Webhook Receiver...")
    webhook_payload = {
        "type": "UPDATE",
        "table": "users",
        "record": {
            "id": "user_88",
            "name": "Anaya Rao (EV Driver)",
            "wallet_balance": 999.00
        }
    }
    code, webhook_res = api_request("/api/webhooks/supabase", method="POST", payload=webhook_payload)
    assert code == 200 and webhook_res["status"] == "SUCCESS", f"Webhook error: {webhook_res}"
    print(f"  OK Webhook Consumed: {webhook_res['action_taken']}")

    code, user_after = api_request("/api/user/me?user_id=user_88")
    assert user_after["wallet_balance"] == 999.00
    print(f"  OK Verified User Wallet synced to ₹{user_after['wallet_balance']:.2f}")

    # Reset balance back to ₹500
    api_request("/api/user/reset_balance", method="POST", payload={"user_id": "user_88", "amount": 500.00})

    print("==================================================================")
    print("🎉 ALL PERSON 2 (BACKEND & SUPABASE LEAD) TESTS PASSED (100% SUCCESS)!")
    print("==================================================================")

if __name__ == "__main__":
    run_verification()
