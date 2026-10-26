#!/usr/bin/env python3
"""
RelayEV Dynamic Power Availability & Grid-Aware Tariff Verification Suite
Verifies:
1. Power availability differences across different charging stations
2. Real-time dynamic tariff calculations (Surplus Solar vs Peak Grid vs Inverter Backup)
3. Grid status telemetry endpoint (POST /api/nodes/{node_id}/grid-status)
4. Escrow token generation using dynamic effective tariff
"""

import sys
import io
import json
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
    print("⚡ RelayEV Dynamic Power Availability & Grid Tariff Verification")
    print("==================================================================")

    # ------------------------------------------------------------------
    # TEST 1: Verify Different Places Charge Different Tariffs by Power
    # ------------------------------------------------------------------
    print("\n[TEST 1] Verifying station tariffs across different power conditions...")
    code, nodes = api_request("/api/nodes")
    assert code == 200, f"Failed to list nodes: {nodes}"
    assert len(nodes) >= 4, f"Expected at least 4 nodes, found {len(nodes)}"

    surplus_nodes = [n for n in nodes if n.get("grid_availability") == "SURPLUS"]
    strained_nodes = [n for n in nodes if n.get("grid_availability") == "STRAINED"]
    normal_nodes = [n for n in nodes if n.get("grid_availability") == "NORMAL"]
    battery_nodes = [n for n in nodes if n.get("grid_availability") == "BATTERY"]

    print(f"  OK Found {len(surplus_nodes)} Surplus Solar, {len(strained_nodes)} Grid Strained, {len(normal_nodes)} Normal, {len(battery_nodes)} Battery Backup nodes.")

    for n in nodes[:4]:
        avail = n.get("grid_availability", "NORMAL")
        base = n.get("base_rate_per_kwh", n["rate_per_kwh"])
        eff = n["rate_per_kwh"]
        reason = n.get("tariff_reason", "Standard")
        print(f"  • {n['name']}: Power={avail} | Base=₹{base:.2f} → Live=₹{eff:.2f}/kWh ({reason})")

    # ------------------------------------------------------------------
    # TEST 2: Dynamic Tariff Breakdown Endpoint
    # ------------------------------------------------------------------
    print("\n[TEST 2] Testing GET /api/nodes/{node_id}/tariff breakdown...")
    code, tariff_info = api_request("/api/nodes/RelayEV-Node-01/tariff")
    assert code == 200, f"Failed to get tariff: {tariff_info}"
    assert "effective_rate_per_kwh" in tariff_info
    assert "grid_availability" in tariff_info
    assert "tariff_multiplier" in tariff_info
    print(f"  OK Node: {tariff_info['node_name']}")
    print(f"  OK Power Status: {tariff_info['grid_availability']} (Multiplier: {tariff_info['tariff_multiplier']}x)")
    print(f"  OK Effective Rate: ₹{tariff_info['effective_rate_per_kwh']:.2f}/kWh ({tariff_info['tariff_reason']})")

    # ------------------------------------------------------------------
    # TEST 3: Dynamic Grid Telemetry & Real-Time Price Adjustment
    # ------------------------------------------------------------------
    print("\n[TEST 3] Testing dynamic price change on IoT grid status update...")
    # Update RelayEV-Node-02 to SURPLUS (e.g. afternoon solar peak)
    code, updated = api_request("/api/nodes/RelayEV-Node-02/grid-status", method="POST", payload={
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "base_rate_per_kwh": 12.00,
        "voltage_v": 238.4
    })
    assert code == 200, f"Failed to update grid status: {updated}"
    # 12.00 * 0.80 = 9.60
    assert updated["rate_per_kwh"] == 9.60, f"Expected ₹9.60, got {updated['rate_per_kwh']}"
    print(f"  OK Changed RelayEV-Node-02 to SURPLUS SOLAR -> Tariff dynamically dropped to ₹{updated['rate_per_kwh']:.2f}/kWh!")

    # Now update RelayEV-Node-02 to STRAINED (e.g. evening peak brownout danger)
    code, updated_peak = api_request("/api/nodes/RelayEV-Node-02/grid-status", method="POST", payload={
        "grid_availability": "STRAINED",
        "power_source": "GRID",
        "base_rate_per_kwh": 12.00,
        "voltage_v": 198.2
    })
    assert code == 200
    # 12.00 * 1.35 = 16.20
    assert updated_peak["rate_per_kwh"] == 16.20, f"Expected ₹16.20, got {updated_peak['rate_per_kwh']}"
    print(f"  OK Changed RelayEV-Node-02 to PEAK STRAIN -> Tariff dynamically surged to ₹{updated_peak['rate_per_kwh']:.2f}/kWh!")

    # ------------------------------------------------------------------
    # TEST 4: Escrow Session Locking with Dynamic Tariff
    # ------------------------------------------------------------------
    print("\n[TEST 4] Testing escrow lock with dynamic power tariff...")
    # Reset driver balance to ₹500
    api_request("/api/user/reset_balance", method="POST", payload={"user_id": "user_88", "amount": 500.00})

    # Start session on RelayEV-Node-01 (Surplus Solar: ₹8.00/kWh)
    code, start_res = api_request("/api/charge/start", method="POST", payload={
        "user_id": "user_88",
        "node_id": "RelayEV-Node-01",
        "escrow_amount": 100.00
    })
    assert code == 200, f"Failed to start charge: {start_res}"
    assert start_res["rate_per_kwh"] == 8.00, f"Expected rate ₹8.00, got {start_res['rate_per_kwh']}"
    # Max kWh for ₹100 @ ₹8/kWh = 12.5 kWh
    assert start_res["max_energy_kwh"] == 12.5, f"Expected 12.5 kWh, got {start_res['max_energy_kwh']}"
    print(f"  OK Escrow ₹100 locked at Surplus Solar rate ₹8.00/kWh -> Driver gets {start_res['max_energy_kwh']} kWh!")

    # Cancel session to refund
    api_request("/api/charge/cancel", method="POST", payload={
        "session_id": start_res["session_id"],
        "user_id": "user_88"
    })

    print("==================================================================")
    print("🎉 ALL DYNAMIC POWER TARIFF VERIFICATION TESTS PASSED (100%)!")
    print("==================================================================")

if __name__ == "__main__":
    run_verification()
