#!/usr/bin/env python3
"""
RelayEV Person 1 (Frontend Map & Driver UX) Automated Verification Suite
Validates Haversine Geolocation, Wallet Top-Ups, Route Navigation, and Station Escrow.
"""

import math
import urllib.request
import json
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://localhost:8000"

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)

def test_haversine_geolocation():
    print("[TEST 1] Testing Haversine Geolocation & Distance Calculation...")
    driver_lat, driver_lon = 28.6140, 77.2090
    mohan_lat, mohan_lon = 28.6140, 77.2090
    sharma_lat, sharma_lon = 28.6250, 77.2280

    dist_mohan = haversine_km(driver_lat, driver_lon, mohan_lat, mohan_lon)
    dist_sharma = haversine_km(driver_lat, driver_lon, sharma_lat, sharma_lon)

    assert dist_mohan == 0.0, f"Expected 0.0, got {dist_mohan}"
    assert 2.0 <= dist_sharma <= 2.8, f"Expected ~2.2 km, got {dist_sharma}"
    print(f"  OK Driver to Mohan's Courtyard: {dist_mohan} km (On site)")
    print(f"  OK Driver to Sharma Dhaba Tap: {dist_sharma} km")

def test_driver_wallet_topup():
    print("\n[TEST 2] Testing Driver Wallet Quick Top-Up Modal Endpoint...")
    # Fetch initial balance
    with urllib.request.urlopen(f"{BASE_URL}/api/user/me?user_id=user_88") as res:
        initial_user = json.loads(res.read().decode("utf-8"))
    initial_balance = initial_user["wallet_balance"]
    print(f"  OK Initial Driver Wallet: ₹{initial_balance:.2f}")

    # Top up ₹200.00 via simulated UPI
    topup_payload = json.dumps({
        "user_id": "user_88",
        "amount": 200.00,
        "payment_method": "UPI_INSTANT"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/user/topup",
        data=topup_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        topup_res = json.loads(res.read().decode("utf-8"))

    assert topup_res["amount_added"] == 200.00
    assert topup_res["new_balance"] == round(initial_balance + 200.00, 2)
    print(f"  OK Deposit Approved: ₹200.00 added. Reference: {topup_res['reference_id']}")
    print(f"  OK New Driver Wallet Balance: ₹{topup_res['new_balance']:.2f}")

def test_station_escrow_handshake():
    print("\n[TEST 3] Testing Navigation to Station & Escrow Voucher Handshake...")
    start_payload = json.dumps({
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/charge/start",
        data=start_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        start_res = json.loads(res.read().decode("utf-8"))

    assert "session_token" in start_res
    assert start_res["escrow_amount"] == 100.00
    print(f"  OK Session {start_res['session_id']} started on node {start_res['node_id']}.")
    print(f"  OK Escrow token successfully issued for WebBLE connection!")

if __name__ == "__main__":
    print("==================================================================")
    print("🗺️ RelayEV Person 1 (Frontend Map & Driver UX) Verification")
    print("==================================================================")
    test_haversine_geolocation()
    test_driver_wallet_topup()
    test_station_escrow_handshake()
    print("==================================================================")
    print("🎉 ALL DRIVER UX & MAP INTEGRATION TESTS PASSED (100% SUCCESS)!\n")
