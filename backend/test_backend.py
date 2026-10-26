import pytest
import hmac
import hashlib
import time
import uuid
from fastapi.testclient import TestClient

from main import app
from config import settings
from database import DatabaseManager

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_test_state():
    # Reset driver balance to 500.0 before each test
    client.post("/api/user/reset_balance", json={"user_id": "user_88", "amount": 500.00})
    client.post("/api/user/reset_balance", json={"user_id": "user_99_mule", "amount": 50.00})

# ==============================================================================
# 1. SYSTEM HEALTH & METADATA TESTS
# ==============================================================================

def test_root_metadata():
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["service"] == settings.PROJECT_NAME
    assert "Zero-OPEX" in data["architecture"]

def test_health_check():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database_connected"] is True
    assert data["active_nodes_count"] >= 4

# ==============================================================================
# 2. USER & WALLET MANAGEMENT TESTS
# ==============================================================================

def test_user_me_profile():
    res = client.get("/api/user/me?user_id=user_88")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "user_88"
    assert data["wallet_balance"] == 500.00
    assert data["role"] == "driver"

def test_user_wallet_topup():
    res = client.post("/api/user/topup", json={
        "user_id": "user_88",
        "amount": 250.00,
        "payment_method": "UPI_PHONEPE"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["previous_balance"] == 500.00
    assert data["amount_added"] == 250.00
    assert data["new_balance"] == 750.00

    # Verify profile reflects new balance
    profile = client.get("/api/user/me?user_id=user_88").json()
    assert profile["wallet_balance"] == 750.00

# ==============================================================================
# 3. CHARGING NODES TESTS
# ==============================================================================

def test_list_nodes():
    res = client.get("/api/nodes")
    assert res.status_code == 200
    nodes = res.json()
    assert len(nodes) >= 4
    node_ids = [n["id"] for n in nodes]
    assert "RelayEV-Node-01" in node_ids

def test_node_registration_and_payout():
    new_node_id = f"RelayEV-Node-TEST-{uuid.uuid4().hex[:6]}"
    res = client.post("/api/nodes/register", json={
        "id": new_node_id,
        "name": "Gupta Farmhouse Charging Hub",
        "host_name": "Rakesh Gupta",
        "location": "North Canal Road, Rampur",
        "rate_per_kwh": 11.50,
        "max_power_kw": 3.3
    })
    assert res.status_code == 200
    node = res.json()
    assert node["id"] == new_node_id
    assert node["rate_per_kwh"] == 11.50

    # Credit node host wallet
    DatabaseManager.credit_host_wallet(new_node_id, 200.0)

    # Process host payout
    payout_res = client.post(f"/api/nodes/{new_node_id}/payout", json={
        "node_id": new_node_id,
        "amount": 150.0,
        "payout_vpa": "gupta@okaxis"
    })
    assert payout_res.status_code == 200
    pdata = payout_res.json()
    assert pdata["payout_amount"] == 150.0
    assert pdata["remaining_balance"] == 50.0

# ==============================================================================
# 4. CRYPTOGRAPHIC ESCROW ENGINE TESTS
# ==============================================================================

def test_charge_start_insufficient_funds():
    res = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 900.00  # Wallet only has 500.00
    })
    assert res.status_code == 400
    assert "Insufficient wallet balance" in res.json()["detail"]

def test_charge_start_valid_escrow():
    res = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    })
    assert res.status_code == 200
    data = res.json()
    assert data["escrow_amount"] == 100.00
    assert data["rate_per_kwh"] == 10.00
    assert data["max_energy_kwh"] == 10.00
    assert data["user_remaining_balance"] == 400.00
    assert len(data["session_token"]) > 40
    assert data["session_id"].startswith("REV-")

    # Verify driver balance was deducted
    user = client.get("/api/user/me?user_id=user_88").json()
    assert user["wallet_balance"] == 400.00

def test_charge_stop_valid_hmac_and_settlement():
    # 1. Start escrow session
    start = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    }).json()
    session_id = start["session_id"]

    # 2. Simulate ESP32 delivers 8.42 kWh
    energy_kwh = 8.42
    actual_cost = 84.20
    secret_key = settings.NODE_SIGNATURE_KEY
    message = f"{session_id}:{energy_kwh:.3f}:{actual_cost:.2f}".encode("utf-8")
    signature = hmac.new(secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()
    nonce = f"nonce_{uuid.uuid4().hex[:8]}"

    # 3. Stop charging session
    stop = client.post("/api/charge/stop", json={
        "session_id": session_id,
        "node_id": "RelayEV-Node-01",
        "user_id": "user_88",
        "energy_consumed_kwh": energy_kwh,
        "actual_cost": actual_cost,
        "node_signature": signature,
        "timestamp": int(time.time()),
        "nonce": nonce
    })
    assert stop.status_code == 200
    res = stop.json()
    assert res["status"] == "SETTLED"
    assert res["signature_verified"] is True
    assert res["actual_cost"] == 84.20
    assert res["refund_amount"] == 15.80  # 100.00 - 84.20
    assert res["user_new_balance"] == 415.80  # 400.00 + 15.80

    # 4. Verify wallet balance on database
    user = client.get("/api/user/me?user_id=user_88").json()
    assert user["wallet_balance"] == 415.80

def test_charge_stop_tampered_signature_rejected():
    start = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    }).json()
    session_id = start["session_id"]

    # Tampered signature
    bad_signature = "bad_tampered_signature_12345"

    stop = client.post("/api/charge/stop", json={
        "session_id": session_id,
        "node_id": "RelayEV-Node-01",
        "user_id": "user_88",
        "energy_consumed_kwh": 5.0,
        "actual_cost": 50.0,
        "node_signature": bad_signature,
        "nonce": f"nonce_{uuid.uuid4().hex[:8]}"
    })
    assert stop.status_code == 401
    assert "signature verification failed" in stop.json()["detail"].lower()

def test_replay_attack_prevention():
    start = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    }).json()
    session_id = start["session_id"]

    energy_kwh = 5.0
    actual_cost = 50.0
    message = f"{session_id}:{energy_kwh:.3f}:{actual_cost:.2f}".encode("utf-8")
    sig = hmac.new(settings.NODE_SIGNATURE_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()
    reuse_nonce = f"replay_nonce_{uuid.uuid4().hex[:8]}"

    # First submission: Valid
    res1 = client.post("/api/charge/stop", json={
        "session_id": session_id,
        "node_id": "RelayEV-Node-01",
        "user_id": "user_88",
        "energy_consumed_kwh": energy_kwh,
        "actual_cost": actual_cost,
        "node_signature": sig,
        "nonce": reuse_nonce
    })
    assert res1.status_code == 200

    # Second submission with fresh session but reused nonce (Replay Attack)
    start2 = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 50.00
    }).json()

    res2 = client.post("/api/charge/stop", json={
        "session_id": start2["session_id"],
        "node_id": "RelayEV-Node-01",
        "user_id": "user_88",
        "energy_consumed_kwh": 2.0,
        "actual_cost": 20.0,
        "node_signature": "ESP32_SIG_MOCK_123",
        "nonce": reuse_nonce  # Reused!
    })
    assert res2.status_code == 400
    assert "replay attack detected" in res2.json()["detail"].lower()

def test_charge_cancel_full_refund():
    # Start escrow of 150 INR
    start = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 150.00
    }).json()
    session_id = start["session_id"]
    assert start["user_remaining_balance"] == 350.00

    # Cancel session
    cancel = client.post("/api/charge/cancel", json={
        "session_id": session_id,
        "user_id": "user_88",
        "reason": "Driver Bluetooth disconnected before handshake"
    })
    assert cancel.status_code == 200
    cdata = cancel.json()
    assert cdata["status"] == "CANCELLED"
    assert cdata["refunded_escrow"] == 150.00
    assert cdata["user_new_balance"] == 500.00

    # Verify wallet restored
    user = client.get("/api/user/me?user_id=user_88").json()
    assert user["wallet_balance"] == 500.00

# ==============================================================================
# 5. DRIVE-BY DATA MULE MESH SYNC TESTS
# ==============================================================================

def test_drive_by_data_mule_batch_sync():
    # Setup 2 offline sessions
    s1 = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 50.00
    }).json()["session_id"]

    s2 = client.post("/api/charge/start", json={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-02",
        "escrow_amount": 60.00
    }).json()["session_id"]

    # ESP32 creates 2 signed receipts on node flash memory
    sig1 = hmac.new(settings.NODE_SIGNATURE_KEY.encode("utf-8"), f"{s1}:3.000:30.00".encode("utf-8"), hashlib.sha256).hexdigest()
    sig2 = hmac.new(settings.NODE_SIGNATURE_KEY.encode("utf-8"), f"{s2}:4.000:48.00".encode("utf-8"), hashlib.sha256).hexdigest()

    receipts = [
        {
            "session_id": s1,
            "node_id": "RelayEV-Node-01",
            "user_id": "user_88",
            "energy_consumed_kwh": 3.0,
            "actual_cost": 30.0,
            "node_signature": sig1,
            "timestamp": int(time.time()),
            "nonce": f"nonce_{uuid.uuid4().hex[:8]}"
        },
        {
            "session_id": s2,
            "node_id": "RelayEV-Node-02",
            "user_id": "user_88",
            "energy_consumed_kwh": 4.0,
            "actual_cost": 48.0,
            "node_signature": sig2,
            "timestamp": int(time.time()),
            "nonce": f"nonce_{uuid.uuid4().hex[:8]}"
        }
    ]

    # Passing phone user_99_mule carries receipts to cell zone and posts
    mule_res = client.post("/api/sync/mule", json={
        "mule_user_id": "user_99_mule",
        "receipts": receipts
    })
    assert mule_res.status_code == 200
    mdata = mule_res.json()
    assert mdata["synced_count"] == 2
    assert mdata["mule_reward_inr"] == 4.00  # 2 * 2.00 INR
    assert mdata["mule_new_balance"] == 54.00  # 50.00 + 4.00

    # Verify both transactions are marked as MULE_SYNCED
    tx1 = client.get(f"/api/charge/session/{s1}").json()
    tx2 = client.get(f"/api/charge/session/{s2}").json()
    assert tx1["status"] == "MULE_SYNCED"
    assert tx2["status"] == "MULE_SYNCED"
    assert tx1["mule_user_id"] == "user_99_mule"

# ==============================================================================
# 6. WALLET AUDIT LEDGER TESTS
# ==============================================================================

def test_wallet_audit_ledger():
    ledger_res = client.get("/api/user/ledger?user_id=user_88")
    assert ledger_res.status_code == 200
    entries = ledger_res.json()
    assert len(entries) > 0
    change_types = [e["change_type"] for e in entries]
    assert any("ESCROW" in ct or "BALANCE" in ct or "TOPUP" in ct for ct in change_types)
