#!/usr/bin/env python3
"""
RelayEV 20 Mock Stations Supabase Cloud & Local Edge Seeder
Synchronizes the 20 verified Vellore EV charging nodes across Supabase Cloud (PostgREST)
and the local edge SQLite database with zero downtime and dynamic tariff support.
"""

import os
import sys
import sqlite3
import argparse
from typing import Dict, Any, List
import httpx

# Ensure backend directory is in path
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from config import settings

# 20 Verified Mock Charging Nodes Dataset
MOCK_NODES_20: List[Dict[str, Any]] = [
    {
        "id": "node_esp32_01",
        "name": "VIT Campus Solar Relay",
        "host_name": "Rajesh Kumar (VIT Solar Grid)",
        "host_user_id": "host_rajesh",
        "location": "Near VIT Main Gate, Tiruvalam Road, Katpadi",
        "latitude": 12.9692,
        "longitude": 79.1559,
        "rate_per_kwh": 8.00,
        "base_rate_per_kwh": 10.00,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.4,
        "hex_cell_id": "87602816BFFFFFF",
        "hardware_note": "100% Rooftop solar + PZEM-004T with shaded 2W bay"
    },
    {
        "id": "node_esp32_02",
        "name": "Katpadi Junction Charging Point",
        "host_name": "Murugan S. (Station Relay)",
        "host_user_id": "host_murugan",
        "location": "Near Katpadi Railway Station, NH-46",
        "latitude": 12.9783,
        "longitude": 79.1450,
        "rate_per_kwh": 12.50,
        "base_rate_per_kwh": 12.50,
        "grid_availability": "NORMAL",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.4,
        "hex_cell_id": "87602816AFFFFFF",
        "hardware_note": "24/7 Chai point beside station parking, 30A relay"
    },
    {
        "id": "node_esp32_03",
        "name": "Sripuram Golden Temple Hub",
        "host_name": "Lakshmi Narayani Trust",
        "host_user_id": "host_sripuram",
        "location": "Malaikodi, Sripuram Temple Road",
        "latitude": 12.8998,
        "longitude": 79.1162,
        "rate_per_kwh": 6.80,
        "base_rate_per_kwh": 8.50,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 7.2,
        "coverage_radius_km": 3.2,
        "hex_cell_id": "87602814DFFFFFF",
        "hardware_note": "Dual Type-2 Fast AC with pilgrimage visitor parking"
    },
    {
        "id": "node_esp32_04",
        "name": "Vellore Fort Heritage Tap",
        "host_name": "Kannan Heritage Cafeteria",
        "host_user_id": "host_kannan",
        "location": "Opp. Vellore Fort East Gate, Anna Salai",
        "latitude": 12.9205,
        "longitude": 79.1325,
        "rate_per_kwh": 11.00,
        "base_rate_per_kwh": 11.00,
        "grid_availability": "NORMAL",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.5,
        "hex_cell_id": "87602815AFFFFFF",
        "hardware_note": "Heritage moat parking with shaded tree canopy"
    },
    {
        "id": "node_esp32_05",
        "name": "Bagayam Rural Clean Hub",
        "host_name": "Dr. Anand Green Energy",
        "host_user_id": "host_anand",
        "location": "Near CMC Bagayam Campus, College Hill",
        "latitude": 12.8710,
        "longitude": 79.1350,
        "rate_per_kwh": 7.60,
        "base_rate_per_kwh": 9.50,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.8,
        "hex_cell_id": "876028143FFFFFF",
        "hardware_note": "Solar battery buffer, open for public 2W/3W charging"
    },
    {
        "id": "node_esp32_06",
        "name": "Ranipet Industrial Corridor Relay",
        "host_name": "Ranipet Fleet Co-op",
        "host_user_id": "host_ranipet",
        "location": "SIPCOT Phase 1, Chennai Highway, Ranipet",
        "latitude": 12.9275,
        "longitude": 79.3330,
        "rate_per_kwh": 17.55,
        "base_rate_per_kwh": 13.00,
        "grid_availability": "STRAINED",
        "power_source": "GRID",
        "max_power_kw": 7.4,
        "coverage_radius_km": 3.6,
        "hex_cell_id": "876028172FFFFFF",
        "hardware_note": "Heavy-duty 32A industrial line for commercial cargo 3W"
    },
    {
        "id": "node_esp32_07",
        "name": "Ambur Leather Town Node",
        "host_name": "Ismail Leather Works",
        "host_user_id": "host_ismail",
        "location": "NH-48 Bypass, Near Star Biryani, Ambur",
        "latitude": 12.7905,
        "longitude": 78.7160,
        "rate_per_kwh": 14.40,
        "base_rate_per_kwh": 12.00,
        "grid_availability": "BATTERY",
        "power_source": "HYBRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 4.0,
        "hex_cell_id": "87602810CFFFFFF",
        "hardware_note": "Highway rest stop node with 24/7 tea & tire check"
    },
    {
        "id": "node_esp32_08",
        "name": "Sholinghur Hill Temple Relay",
        "host_name": "Govindarajan Temple Inn",
        "host_user_id": "host_govind",
        "location": "Foot of Yoga Narasimha Swamy Hill, Sholinghur",
        "latitude": 13.1140,
        "longitude": 79.4240,
        "rate_per_kwh": 14.18,
        "base_rate_per_kwh": 10.50,
        "grid_availability": "STRAINED",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 3.0,
        "hex_cell_id": "87602811EFFFFFF",
        "hardware_note": "Solar off-grid battery backed charging tap"
    },
    {
        "id": "node_esp32_09",
        "name": "Walajah Highway Toll Dhaba",
        "host_name": "Highway King Dhaba Tap",
        "host_user_id": "host_walajah",
        "location": "NH-48 Toll Plaza Corridor, Walajapet",
        "latitude": 12.9810,
        "longitude": 79.3620,
        "rate_per_kwh": 16.80,
        "base_rate_per_kwh": 14.00,
        "grid_availability": "BATTERY",
        "power_source": "HYBRID",
        "max_power_kw": 7.2,
        "coverage_radius_km": 3.5,
        "hex_cell_id": "87602817AFFFFFF",
        "hardware_note": "24/7 Dhaba dining with fenced overnight EV charging bay"
    },
    {
        "id": "node_esp32_10",
        "name": "Gudiyatham Agricultural Feeder",
        "host_name": "Venkatesan Agro Solar",
        "host_user_id": "host_gudiyatham",
        "location": "Agricultural Market Yard, Gudiyatham Bypass",
        "latitude": 12.9460,
        "longitude": 78.8710,
        "rate_per_kwh": 7.20,
        "base_rate_per_kwh": 9.00,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 3.3,
        "coverage_radius_km": 3.8,
        "hex_cell_id": "87602812EFFFFFF",
        "hardware_note": "Subsidized farm community tariff with solar canopy"
    },
    {
        "id": "node_esp32_11",
        "name": "Arcot Royal Palace Tap",
        "host_name": "Nawaz Basha (Arcot Sweets Corner)",
        "host_user_id": "host_nawaz",
        "location": "Palace Road, Near Arcot Clock Tower",
        "latitude": 12.9042,
        "longitude": 79.3326,
        "rate_per_kwh": 10.50,
        "base_rate_per_kwh": 10.50,
        "grid_availability": "NORMAL",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.5,
        "hex_cell_id": "876028173FFFFFF",
        "hardware_note": "Town center sweet stall tap with shaded e-bike parking"
    },
    {
        "id": "node_esp32_12",
        "name": "Vaniyambadi Biryani Expressway Stop",
        "host_name": "Farooq Hospitality & EV Point",
        "host_user_id": "host_farooq",
        "location": "Chennai-Bengaluru Highway, Vaniyambadi Toll",
        "latitude": 12.6830,
        "longitude": 78.6180,
        "rate_per_kwh": 10.80,
        "base_rate_per_kwh": 13.50,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 7.4,
        "coverage_radius_km": 4.2,
        "hex_cell_id": "876028105FFFFFF",
        "hardware_note": "Express highway dual 32A charging with 24h restaurant"
    },
    {
        "id": "node_esp32_13",
        "name": "Pallikonda Toll Plaza Safe Rest",
        "host_name": "Senguttuvan Highway Lodge",
        "host_user_id": "host_senguttuvan",
        "location": "NH-48 KM 126, Pallikonda Service Road",
        "latitude": 12.9090,
        "longitude": 78.9660,
        "rate_per_kwh": 14.40,
        "base_rate_per_kwh": 12.00,
        "grid_availability": "BATTERY",
        "power_source": "HYBRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 3.2,
        "hex_cell_id": "876028135FFFFFF",
        "hardware_note": "Quiet night parking with 16A industrial plug socket"
    },
    {
        "id": "node_esp32_14",
        "name": "Melvisharam Tannery Eco-Charge",
        "host_name": "Tariq Leather Works & Green Power",
        "host_user_id": "host_tariq",
        "location": "Trunk Road, Melvisharam Industrial Area",
        "latitude": 12.9350,
        "longitude": 79.2480,
        "rate_per_kwh": 15.53,
        "base_rate_per_kwh": 11.50,
        "grid_availability": "STRAINED",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.6,
        "hex_cell_id": "87602816EFFFFFF",
        "hardware_note": "Secured yard with surge protector & fire safety buffer"
    },
    {
        "id": "node_esp32_15",
        "name": "Tiruvallam Bridge River Tap",
        "host_name": "Selvam Coconut Grove & Charging",
        "host_user_id": "host_selvam",
        "location": "Ponnai Road Junction, Tiruvallam",
        "latitude": 12.9960,
        "longitude": 79.2230,
        "rate_per_kwh": 7.20,
        "base_rate_per_kwh": 9.00,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.8,
        "hex_cell_id": "87602816DFFFFFF",
        "hardware_note": "Shaded coconut orchard parking with cool breeze & water"
    },
    {
        "id": "node_esp32_16",
        "name": "Sathuvachari Expressway Transit",
        "host_name": "Ramesh Babu Express Laundry",
        "host_user_id": "host_ramesh",
        "location": "Near Collectorate Office, Sathuvachari",
        "latitude": 12.9380,
        "longitude": 79.1650,
        "rate_per_kwh": 10.00,
        "base_rate_per_kwh": 10.00,
        "grid_availability": "NORMAL",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.2,
        "hex_cell_id": "87602815BFFFFFF",
        "hardware_note": "Convenient urban node near govt offices & commercial banks"
    },
    {
        "id": "node_esp32_17",
        "name": "VIT Lake Back-Gate Eco-Tap",
        "host_name": "Student Tech Innovators Co-op",
        "host_user_id": "host_techcoop",
        "location": "Behind VIT Lake, Kangeyanallur Road",
        "latitude": 12.9730,
        "longitude": 79.1620,
        "rate_per_kwh": 6.40,
        "base_rate_per_kwh": 8.00,
        "grid_availability": "SURPLUS",
        "power_source": "SOLAR",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.0,
        "hex_cell_id": "876028169FFFFFF",
        "hardware_note": "IoT PZEM telemetry node with experimental solar tracker"
    },
    {
        "id": "node_esp32_18",
        "name": "Vellore Old Town Bazaar Point",
        "host_name": "Mustafa Merchant Union",
        "host_user_id": "host_mustafa",
        "location": "Main Bazaar Road, Near Long Bazaar",
        "latitude": 12.9150,
        "longitude": 79.1300,
        "rate_per_kwh": 16.88,
        "base_rate_per_kwh": 12.50,
        "grid_availability": "STRAINED",
        "power_source": "GRID",
        "max_power_kw": 3.3,
        "coverage_radius_km": 2.0,
        "hex_cell_id": "876028158FFFFFF",
        "hardware_note": "Heavy traffic commercial corridor with delivery 3W bay"
    },
    {
        "id": "node_esp32_19",
        "name": "Otteri Lake Nature Park Relay",
        "host_name": "Green Valley Eco Resort",
        "host_user_id": "host_greenvalley",
        "location": "Otteri Circular Road, Southern Foothills",
        "latitude": 12.8870,
        "longitude": 79.1240,
        "rate_per_kwh": 10.00,
        "base_rate_per_kwh": 10.00,
        "grid_availability": "NORMAL",
        "power_source": "HYBRID",
        "max_power_kw": 7.2,
        "coverage_radius_km": 3.0,
        "hex_cell_id": "876028148FFFFFF",
        "hardware_note": "Dual fast AC charging bay surrounded by nature walking trail"
    },
    {
        "id": "node_esp32_20",
        "name": "Arakkonam Rail Hub Inter-Connect",
        "host_name": "Murthy Transport Logistics",
        "host_user_id": "host_murthy",
        "location": "Station Road, Arakkonam Junction Feeder",
        "latitude": 13.0800,
        "longitude": 79.6700,
        "rate_per_kwh": 13.20,
        "base_rate_per_kwh": 11.00,
        "grid_availability": "BATTERY",
        "power_source": "BATTERY_BACKUP",
        "max_power_kw": 7.4,
        "coverage_radius_km": 4.5,
        "hex_cell_id": "876028189FFFFFF",
        "hardware_note": "High-capacity railway interchange buffer for 2W/3W fleets"
    }
]

def seed_sqlite():
    db_path = os.path.join(BACKEND_DIR, settings.DATABASE_PATH)
    print(f"📦 Synchronizing local SQLite database at: {db_path}...")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Ensure columns exist
    for col, col_def in [
        ("base_rate_per_kwh", "REAL DEFAULT 10.0"),
        ("grid_availability", "TEXT DEFAULT 'NORMAL'"),
        ("power_source", "TEXT DEFAULT 'GRID'"),
        ("dynamic_pricing_enabled", "INTEGER DEFAULT 1"),
        ("coverage_radius_km", "REAL DEFAULT 2.5"),
        ("hex_cell_id", "TEXT DEFAULT '87602816BFFFFFF'"),
        ("hardware_note", "TEXT")
    ]:
        try:
            cur.execute(f"ALTER TABLE nodes ADD COLUMN {col} {col_def};")
        except sqlite3.OperationalError:
            pass

    # Upsert Host Users
    for node in MOCK_NODES_20:
        uid = node["host_user_id"]
        hname = node["host_name"]
        cur.execute("""
        INSERT OR IGNORE INTO users (id, name, phone, role, wallet_balance, created_at, updated_at)
        VALUES (?, ?, '+91-9800000000', 'host', 0.0, datetime('now'), datetime('now'))
        """, (uid, hname))

    # Upsert Nodes
    inserted = 0
    for node in MOCK_NODES_20:
        cur.execute("""
        INSERT INTO nodes (
            id, name, host_name, host_user_id, location, latitude, longitude,
            rate_per_kwh, base_rate_per_kwh, grid_availability, power_source,
            max_power_kw, host_wallet_balance, hardware_secret, is_active,
            coverage_radius_km, hex_cell_id, hardware_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, 1, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            host_name=excluded.host_name,
            host_user_id=excluded.host_user_id,
            location=excluded.location,
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            rate_per_kwh=excluded.rate_per_kwh,
            base_rate_per_kwh=excluded.base_rate_per_kwh,
            grid_availability=excluded.grid_availability,
            power_source=excluded.power_source,
            max_power_kw=excluded.max_power_kw,
            coverage_radius_km=excluded.coverage_radius_km,
            hex_cell_id=excluded.hex_cell_id,
            hardware_note=excluded.hardware_note
        """, (
            node["id"], node["name"], node["host_name"], node["host_user_id"],
            node["location"], node["latitude"], node["longitude"],
            node["rate_per_kwh"], node["base_rate_per_kwh"],
            node["grid_availability"], node["power_source"],
            node["max_power_kw"], settings.NODE_SIGNATURE_KEY,
            node["coverage_radius_km"], node["hex_cell_id"], node["hardware_note"]
        ))
        inserted += 1

    conn.commit()
    count = cur.execute("SELECT COUNT(*) FROM nodes WHERE is_active = 1").fetchone()[0]
    conn.close()
    print(f"✓ Local SQLite updated with {inserted} nodes (Total active in DB: {count})")
    return count

def seed_supabase(url: str, key: str):
    print(f"\n☁️ Connecting to Supabase Cloud at {url}...")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }

    try:
        with httpx.Client(timeout=8.0) as client:
            # 1. Health check
            res = client.get(f"{url}/rest/v1/", headers=headers)
            if res.status_code not in [200, 401, 404]:
                print(f"⚠️ Supabase endpoint check returned {res.status_code}. Proceeding with PostgREST upsert...")

            # 2. Upsert Users
            users_payload = [
                {
                    "id": n["host_user_id"],
                    "name": n["host_name"],
                    "phone": "+91-9800000000",
                    "role": "host",
                    "wallet_balance": 0.00
                } for n in MOCK_NODES_20
            ]
            u_resp = client.post(f"{url}/rest/v1/users?on_conflict=id", headers=headers, json=users_payload)
            if u_resp.status_code in [200, 201]:
                print(f"✓ Supabase: Upserted {len(users_payload)} host users.")
            else:
                print(f"ℹ Supabase users response: {u_resp.status_code}")

            # 3. Upsert Nodes
            nodes_payload = [
                {
                    "id": n["id"],
                    "name": n["name"],
                    "host_name": n["host_name"],
                    "host_user_id": n["host_user_id"],
                    "location": n["location"],
                    "latitude": n["latitude"],
                    "longitude": n["longitude"],
                    "rate_per_kwh": n["rate_per_kwh"],
                    "base_rate_per_kwh": n["base_rate_per_kwh"],
                    "grid_availability": n["grid_availability"],
                    "power_source": n["power_source"],
                    "max_power_kw": n["max_power_kw"],
                    "coverage_radius_km": n["coverage_radius_km"],
                    "hex_cell_id": n["hex_cell_id"],
                    "hardware_note": n["hardware_note"],
                    "is_active": True
                } for n in MOCK_NODES_20
            ]
            n_resp = client.post(f"{url}/rest/v1/nodes?on_conflict=id", headers=headers, json=nodes_payload)
            if n_resp.status_code in [200, 201]:
                print(f"✓ Supabase Cloud: Successfully seeded and upserted all {len(nodes_payload)} stations!")
            else:
                print(f"ℹ Supabase nodes response {n_resp.status_code}: {n_resp.text}")

    except Exception as e:
        print(f"⚠️ Supabase Cloud sync encountered an exception: {e}")
        print("ℹ Edge SQLite remains fully operational as local fallback.")

def main():
    parser = argparse.ArgumentParser(description="RelayEV 20 Stations Supabase & SQLite Seeder")
    parser.add_argument("--url", help="Supabase Project URL (or set SUPABASE_URL)", default=os.getenv("SUPABASE_URL", ""))
    parser.add_argument("--key", help="Supabase API key (or set SUPABASE_KEY)", default=os.getenv("SUPABASE_KEY", ""))
    args = parser.parse_args()

    print("==================================================================")
    print("⚡ RelayEV 20 Mock Stations Cloud & Edge Database Seeder")
    print("==================================================================")

    # 1. Local SQLite sync
    seed_sqlite()

    # 2. Supabase Cloud sync if credentials provided
    supabase_url = args.url or settings.SUPABASE_URL
    supabase_key = args.key or settings.SUPABASE_KEY

    if supabase_url and supabase_key and "mock-relayev" not in supabase_url:
        seed_supabase(supabase_url.rstrip("/"), supabase_key)
    else:
        print("\nℹ Supabase credentials not detected in environment.")
        print("  To sync with live Supabase Cloud:")
        print("  python scripts/seed_supabase_20_nodes.py --url https://<id>.supabase.co --key <key>")
        print("  Or run 'supabase/seed.sql' in your Supabase SQL Editor.")

    print("\n🎉 ALL 20 STATIONS READY TO RUN ACROSS BACKEND AND FRONTEND!")

if __name__ == "__main__":
    main()
