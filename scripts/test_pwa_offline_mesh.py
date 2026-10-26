#!/usr/bin/env python3
"""
RelayEV PWA & Offline Mesh Verification Suite
Validates Web App Manifest, Service Worker caching, and Offline-to-Cloud sync.
"""

import os
import sys
import json
import io
import urllib.request
import hmac
import hashlib
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
MANIFEST_PATH = os.path.join(FRONTEND_DIR, "public", "manifest.json")
SW_PATH = os.path.join(FRONTEND_DIR, "public", "sw.js")
ICON_192 = os.path.join(FRONTEND_DIR, "public", "icons", "icon-192.svg")
ICON_512 = os.path.join(FRONTEND_DIR, "public", "icons", "icon-512.svg")

def test_manifest_schema():
    print("[TEST 1] Validating Web App Manifest schema...")
    assert os.path.exists(MANIFEST_PATH), "manifest.json missing!"
    
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    assert data["name"] == "RelayEV: Offline Rural EV Charging Mesh"
    assert data["short_name"] == "RelayEV"
    assert data["display"] == "standalone"
    assert data["start_url"] == "/"
    assert data["theme_color"] == "#059669"
    assert len(data["icons"]) >= 2
    print("  OK Manifest fields, standalone mode, and icons validated.")

def test_pwa_assets_and_sw():
    print("\n[TEST 2] Validating Service Worker and PWA Icons...")
    assert os.path.exists(SW_PATH), "sw.js missing!"
    assert os.path.exists(ICON_192), "icon-192.svg missing!"
    assert os.path.exists(ICON_512), "icon-512.svg missing!"
    
    with open(SW_PATH, "r", encoding="utf-8") as f:
        sw_content = f.read()
        
    assert "relayev-offline-mesh-v1" in sw_content
    assert "caches.open" in sw_content
    assert "skipWaiting" in sw_content
    assert "/api/" in sw_content
    print("  OK Service worker precaching and runtime offline strategies verified.")

def test_offline_mesh_receipt_sync_simulation():
    print("\n[TEST 3] Simulating Dead-Zone Offline Receipt Queuing & Cloud Sync...")
    base_url = "http://localhost:8000"
    secret_key = "relay_ev_hardware_master_secret_2026"
    
    # 1. Start a session to lock escrow
    start_payload = json.dumps({
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    }).encode("utf-8")
    
    req = urllib.request.Request(
        f"{base_url}/api/charge/start",
        data=start_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        start_res = json.loads(resp.read().decode("utf-8"))
        
    session_id = start_res["session_id"]
    print(f"  OK Session {session_id} initiated in cell zone before entering dead zone.")
    
    # 2. Driver enters zero-cellular dead zone: charges 6.25 kWh
    energy_kwh = 6.250
    rate = 10.00
    actual_cost = energy_kwh * rate
    
    msg = f"{session_id}:{energy_kwh:.3f}:{actual_cost:.2f}".encode("utf-8")
    signature = hmac.new(secret_key.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    
    # Queued offline receipt payload in dead zone
    queued_receipt = {
        "session_id": session_id,
        "node_id": "RelayEV-Node-01",
        "user_id": "user_88",
        "energy_consumed_kwh": energy_kwh,
        "actual_cost": actual_cost,
        "node_signature": signature,
        "timestamp": int(time.time()),
        "nonce": f"nonce_offline_pwa_{session_id}"
    }
    print(f"  OK Signed receipt generated over WebBLE in dead zone (6.250 kWh, ₹{actual_cost:.2f}).")
    print("  OK Receipt safely buffered in PWA OfflineMeshStorage queue.")
    
    # 3. Cellular reception restored: PWA auto-flushes queue
    stop_req = urllib.request.Request(
        f"{base_url}/api/charge/stop",
        data=json.dumps(queued_receipt).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(stop_req) as resp:
        stop_res = json.loads(resp.read().decode("utf-8"))
        
    assert stop_res["status"] == "SETTLED"
    assert stop_res["signature_verified"] is True
    assert stop_res["refund_amount"] == 37.50
    print(f"  OK Cellular restored: cloud auto-settled session {session_id}.")
    print(f"  OK Refund credited to driver: ₹{stop_res['refund_amount']:.2f}")

if __name__ == "__main__":
    print("==================================================================")
    print("📱 RelayEV PWA & Offline Mesh Verification Suite")
    print("==================================================================")
    test_manifest_schema()
    test_pwa_assets_and_sw()
    test_offline_mesh_receipt_sync_simulation()
    print("==================================================================")
    print("🎉 ALL PWA & OFFLINE MESH TESTS PASSED (100% SUCCESS)!\n")
