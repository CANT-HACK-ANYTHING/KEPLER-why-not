import sqlite3
import os
import json
import uuid
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from config import settings

DB_PATH = os.path.join(os.path.dirname(__file__), "relay_ev.db")

def init_database():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    cursor = conn.cursor()

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'driver',
        wallet_balance REAL NOT NULL DEFAULT 500.00,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # 2. Nodes table (Zero-OPEX Offline Host Hardware with Grid-Aware Dynamic Tariffs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host_name TEXT NOT NULL,
        host_user_id TEXT NULL,
        location TEXT NOT NULL,
        latitude REAL DEFAULT 28.6140,
        longitude REAL DEFAULT 77.2090,
        rate_per_kwh REAL NOT NULL DEFAULT 10.00,
        base_rate_per_kwh REAL NOT NULL DEFAULT 10.00,
        grid_availability TEXT NOT NULL DEFAULT 'NORMAL',
        power_source TEXT NOT NULL DEFAULT 'HYBRID',
        dynamic_pricing_enabled INTEGER NOT NULL DEFAULT 1,
        max_power_kw REAL NOT NULL DEFAULT 3.30,
        host_wallet_balance REAL NOT NULL DEFAULT 0.00,
        hardware_secret TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        firmware_version TEXT NOT NULL DEFAULT 'v1.4-pzem-ble',
        created_at TEXT NOT NULL
    );
    """)

    # Seamless upgrades for existing database schemas
    for col, col_def in [
        ("base_rate_per_kwh", "REAL DEFAULT 10.00"),
        ("grid_availability", "TEXT DEFAULT 'NORMAL'"),
        ("power_source", "TEXT DEFAULT 'HYBRID'"),
        ("dynamic_pricing_enabled", "INTEGER DEFAULT 1"),
        ("coverage_radius_km", "REAL DEFAULT 2.50"),
        ("hex_cell_id", "TEXT DEFAULT '87602816BFFFFFF'"),
        ("hardware_note", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE nodes ADD COLUMN {col} {col_def};")
        except sqlite3.OperationalError:
            pass

    # 3. Transactions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        session_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        node_id TEXT NOT NULL REFERENCES nodes(id),
        escrow_amount REAL NOT NULL,
        rate_per_kwh REAL NOT NULL,
        max_energy_kwh REAL NOT NULL,
        energy_consumed_kwh REAL DEFAULT 0.0,
        actual_cost REAL DEFAULT 0.0,
        refund_amount REAL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'ESCROW_LOCKED',
        escrow_token TEXT NOT NULL,
        signed_receipt TEXT NULL,
        receipt_hash TEXT NULL,
        node_signature TEXT NULL,
        nonce TEXT NULL,
        mule_user_id TEXT NULL REFERENCES users(id),
        mule_reward_inr REAL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        settled_at TEXT NULL
    );
    """)

    # 4. Nonces table for Replay Attack Prevention
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS nonces (
        nonce TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        used_at TEXT NOT NULL
    );
    """)

    # 5. Wallet Audit Ledger table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wallet_audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        change_type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        reference_id TEXT NOT NULL,
        timestamp TEXT NOT NULL
    );
    """)

    # Performance Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tx_session_id ON transactions(session_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_nonces_nonce ON nonces(nonce);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON wallet_audit_logs(user_id);")

    # Seed Default Users if missing
    cursor.execute("SELECT id FROM users WHERE id = 'user_88'")
    if not cursor.fetchone():
        now = datetime.now(timezone.utc).isoformat()
        cursor.executemany("""
        INSERT INTO users (id, name, phone, role, wallet_balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            ("user_88", "Anaya Rao (EV Driver)", "+91-9876543210", "driver", 500.00, now, now),
            ("user_99_mule", "Rohan Verma (Data Mule)", "+91-9811223344", "mule", 50.00, now, now),
            ("host_mohan", "Mohan Ram (Host)", "+91-9822334455", "host", 0.00, now, now)
        ])

    # Seed / Upsert All 20 Verified Mock Charging Nodes
    now = datetime.now(timezone.utc).isoformat()
    seed_nodes_20 = [
        ("node_esp32_01", "VIT Campus Solar Relay", "Rajesh Kumar (VIT Solar Grid)", "host_rajesh", "Near VIT Main Gate, Tiruvalam Road, Katpadi", 12.9692, 79.1559, 8.00, 10.00, "SURPLUS", "SOLAR", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.4, "87602816BFFFFFF", "100% Rooftop solar + PZEM-004T with shaded 2W bay", now),
        ("node_esp32_02", "Katpadi Junction Charging Point", "Murugan S. (Station Relay)", "host_murugan", "Near Katpadi Railway Station, NH-46", 12.9783, 79.1450, 12.50, 12.50, "NORMAL", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.4, "87602816AFFFFFF", "24/7 Chai point beside station parking, 30A relay", now),
        ("node_esp32_03", "Sripuram Golden Temple Hub", "Lakshmi Narayani Trust", "host_sripuram", "Malaikodi, Sripuram Temple Road", 12.8998, 79.1162, 6.80, 8.50, "SURPLUS", "SOLAR", 7.20, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.2, "87602814DFFFFFF", "Dual Type-2 Fast AC with pilgrimage visitor parking", now),
        ("node_esp32_04", "Vellore Fort Heritage Tap", "Kannan Heritage Cafeteria", "host_kannan", "Opp. Vellore Fort East Gate, Anna Salai", 12.9205, 79.1325, 11.00, 11.00, "NORMAL", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.5, "87602815AFFFFFF", "Heritage moat parking with shaded tree canopy", now),
        ("node_esp32_05", "Bagayam Rural Clean Hub", "Dr. Anand Green Energy", "host_anand", "Near CMC Bagayam Campus, College Hill", 12.8710, 79.1350, 7.60, 9.50, "SURPLUS", "SOLAR", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.8, "876028143FFFFFF", "Solar battery buffer, open for public 2W/3W charging", now),
        ("node_esp32_06", "Ranipet Industrial Corridor Relay", "Ranipet Fleet Co-op", "host_ranipet", "SIPCOT Phase 1, Chennai Highway, Ranipet", 12.9275, 79.3330, 17.55, 13.00, "STRAINED", "GRID", 7.40, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.6, "876028172FFFFFF", "Heavy-duty 32A industrial line for commercial cargo 3W", now),
        ("node_esp32_07", "Ambur Leather Town Node", "Ismail Leather Works", "host_ismail", "NH-48 Bypass, Near Star Biryani, Ambur", 12.7905, 78.7160, 14.40, 12.00, "BATTERY", "HYBRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 4.0, "87602810CFFFFFF", "Highway rest stop node with 24/7 tea & tire check", now),
        ("node_esp32_08", "Sholinghur Hill Temple Relay", "Govindarajan Temple Inn", "host_govind", "Foot of Yoga Narasimha Swamy Hill, Sholinghur", 13.1140, 79.4240, 14.18, 10.50, "STRAINED", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.0, "87602811EFFFFFF", "Solar off-grid battery backed charging tap", now),
        ("node_esp32_09", "Walajah Highway Toll Dhaba", "Highway King Dhaba Tap", "host_walajah", "NH-48 Toll Plaza Corridor, Walajapet", 12.9810, 79.3620, 16.80, 14.00, "BATTERY", "HYBRID", 7.20, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.5, "87602817AFFFFFF", "24/7 Dhaba dining with fenced overnight EV charging bay", now),
        ("node_esp32_10", "Gudiyatham Agricultural Feeder", "Venkatesan Agro Solar", "host_gudiyatham", "Agricultural Market Yard, Gudiyatham Bypass", 12.9460, 78.8710, 7.20, 9.00, "SURPLUS", "SOLAR", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.8, "87602812EFFFFFF", "Subsidized farm community tariff with solar canopy", now),
        ("node_esp32_11", "Arcot Royal Palace Tap", "Nawaz Basha (Arcot Sweets Corner)", "host_nawaz", "Palace Road, Near Arcot Clock Tower", 12.9042, 79.3326, 10.50, 10.50, "NORMAL", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.5, "876028173FFFFFF", "Town center sweet stall tap with shaded e-bike parking", now),
        ("node_esp32_12", "Vaniyambadi Biryani Expressway Stop", "Farooq Hospitality & EV Point", "host_farooq", "Chennai-Bengaluru Highway, Vaniyambadi Toll", 12.6830, 78.6180, 10.80, 13.50, "SURPLUS", "SOLAR", 7.40, 0.00, settings.NODE_SIGNATURE_KEY, 1, 4.2, "876028105FFFFFF", "Express highway dual 32A charging with 24h restaurant", now),
        ("node_esp32_13", "Pallikonda Toll Plaza Safe Rest", "Senguttuvan Highway Lodge", "host_senguttuvan", "NH-48 KM 126, Pallikonda Service Road", 12.9090, 78.9660, 14.40, 12.00, "BATTERY", "HYBRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.2, "876028135FFFFFF", "Quiet night parking with 16A industrial plug socket", now),
        ("node_esp32_14", "Melvisharam Tannery Eco-Charge", "Tariq Leather Works & Green Power", "host_tariq", "Trunk Road, Melvisharam Industrial Area", 12.9350, 79.2480, 15.53, 11.50, "STRAINED", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.6, "87602816EFFFFFF", "Secured yard with surge protector & fire safety buffer", now),
        ("node_esp32_15", "Tiruvallam Bridge River Tap", "Selvam Coconut Grove & Charging", "host_selvam", "Ponnai Road Junction, Tiruvallam", 12.9960, 79.2230, 7.20, 9.00, "SURPLUS", "SOLAR", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.8, "87602816DFFFFFF", "Shaded coconut orchard parking with cool breeze & water", now),
        ("node_esp32_16", "Sathuvachari Expressway Transit", "Ramesh Babu Express Laundry", "host_ramesh", "Near Collectorate Office, Sathuvachari", 12.9380, 79.1650, 10.00, 10.00, "NORMAL", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.2, "87602815BFFFFFF", "Convenient urban node near govt offices & commercial banks", now),
        ("node_esp32_17", "VIT Lake Back-Gate Eco-Tap", "Student Tech Innovators Co-op", "host_techcoop", "Behind VIT Lake, Kangeyanallur Road", 12.9730, 79.1620, 6.40, 8.00, "SURPLUS", "SOLAR", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.0, "876028169FFFFFF", "IoT PZEM telemetry node with experimental solar tracker", now),
        ("node_esp32_18", "Vellore Old Town Bazaar Point", "Mustafa Merchant Union", "host_mustafa", "Main Bazaar Road, Near Long Bazaar", 12.9150, 79.1300, 16.88, 12.50, "STRAINED", "GRID", 3.30, 0.00, settings.NODE_SIGNATURE_KEY, 1, 2.0, "876028158FFFFFF", "Heavy traffic commercial corridor with delivery 3W bay", now),
        ("node_esp32_19", "Otteri Lake Nature Park Relay", "Green Valley Eco Resort", "host_greenvalley", "Otteri Circular Road, Southern Foothills", 12.8870, 79.1240, 10.00, 10.00, "NORMAL", "HYBRID", 7.20, 0.00, settings.NODE_SIGNATURE_KEY, 1, 3.0, "876028148FFFFFF", "Dual fast AC charging bay surrounded by nature walking trail", now),
        ("node_esp32_20", "Arakkonam Rail Hub Inter-Connect", "Murthy Transport Logistics", "host_murthy", "Station Road, Arakkonam Junction Feeder", 13.0800, 79.6700, 13.20, 11.00, "BATTERY", "BATTERY_BACKUP", 7.40, 0.00, settings.NODE_SIGNATURE_KEY, 1, 4.5, "876028189FFFFFF", "High-capacity railway interchange buffer for 2W/3W fleets", now),
    ]

    for n in seed_nodes_20:
        cursor.execute("""
        INSERT INTO nodes (
            id, name, host_name, host_user_id, location, latitude, longitude,
            rate_per_kwh, base_rate_per_kwh, grid_availability, power_source,
            max_power_kw, host_wallet_balance, hardware_secret, is_active,
            coverage_radius_km, hex_cell_id, hardware_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        """, n)
    conn.commit()
    conn.close()

# Auto-initialize on module load
init_database()


def calculate_dynamic_tariff(node: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes grid-aware dynamic pricing based on power availability at the charging location:
    - SURPLUS (Solar/Micro-hydro abundance): 20% Green Energy Discount (multiplier 0.80)
    - NORMAL (Standard stable grid): 1.00x baseline tariff
    - STRAINED (Peak hours / Low capacity feeder): 35% Peak Surge (multiplier 1.35)
    - BATTERY (Inverter/Battery backup during blackout): 20% Storage Surcharge (multiplier 1.20)
    """
    base_rate = float(node.get("base_rate_per_kwh") or node.get("rate_per_kwh") or 10.0)
    availability = str(node.get("grid_availability") or "NORMAL").upper()
    power_source = str(node.get("power_source") or "HYBRID").upper()

    if availability == "SURPLUS":
        multiplier = 0.80
        reason = "Surplus Green Solar / Off-Peak (20% Discount)"
        badge_color = "green"
    elif availability == "STRAINED":
        multiplier = 1.35
        reason = "Grid Peak Strain / Low Capacity (+35% Surge)"
        badge_color = "red"
    elif availability == "BATTERY":
        multiplier = 1.20
        reason = "Inverter Battery Storage Backup (+20%)"
        badge_color = "amber"
    else:
        multiplier = 1.00
        reason = "Standard Grid Availability"
        badge_color = "blue"

    effective_rate = round(base_rate * multiplier, 2)
    return {
        "base_rate_per_kwh": base_rate,
        "effective_rate_per_kwh": effective_rate,
        "grid_availability": availability,
        "power_source": power_source,
        "tariff_multiplier": multiplier,
        "tariff_reason": reason,
        "badge_color": badge_color
    }

class DatabaseManager:
    @staticmethod
    def get_connection():
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        return conn

    # =========================================================================
    # USER OPERATIONS
    # =========================================================================

    @staticmethod
    def get_user(user_id: str) -> Optional[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def create_user(user_id: str, name: str, phone: str, role: str = "driver", initial_balance: float = 500.0) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        conn = DatabaseManager.get_connection()
        conn.execute("""
        INSERT INTO users (id, name, phone, role, wallet_balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, name, phone, role, initial_balance, now, now))
        conn.commit()
        conn.close()
        return DatabaseManager.get_user(user_id) # type: ignore

    @staticmethod
    def update_user_balance(user_id: str, new_balance: float, change_type: str = "SYSTEM_ADJUST", reference_id: str = ""):
        now = datetime.now(timezone.utc).isoformat()
        conn = DatabaseManager.get_connection()
        old_user = conn.execute("SELECT wallet_balance FROM users WHERE id = ?", (user_id,)).fetchone()
        old_bal = old_user["wallet_balance"] if old_user else 0.0
        delta = round(new_balance - old_bal, 2)

        conn.execute("""
        UPDATE users SET wallet_balance = ?, updated_at = ? WHERE id = ?
        """, (round(new_balance, 2), now, user_id))

        # Record ledger entry
        log_id = f"LOG-{uuid.uuid4().hex[:10].upper()}"
        conn.execute("""
        INSERT INTO wallet_audit_logs (id, user_id, change_type, amount, balance_after, reference_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (log_id, user_id, change_type, delta, round(new_balance, 2), reference_id, now))

        conn.commit()
        conn.close()

    # =========================================================================
    # CHARGING NODES OPERATIONS
    # =========================================================================

    @staticmethod
    def get_nodes() -> List[Dict[str, Any]]:
        # 1. Check if Supabase Cloud is configured and operational
        try:
            from supabase_client import supabase_client
            if supabase_client.is_configured:
                cloud_nodes = supabase_client.select("nodes")
                if cloud_nodes and len(cloud_nodes) > 0:
                    cloud_result = []
                    for cn in cloud_nodes:
                        if cn.get("is_active", True):
                            dyn = calculate_dynamic_tariff(cn)
                            cn.update(dyn)
                            cn["rate_per_kwh"] = dyn["effective_rate_per_kwh"]
                            cloud_result.append(cn)
                    if len(cloud_result) > 0:
                        return cloud_result
        except Exception:
            pass

        # 2. Local SQLite Edge database query
        conn = DatabaseManager.get_connection()
        rows = conn.execute("SELECT * FROM nodes WHERE is_active = 1").fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            dyn = calculate_dynamic_tariff(d)
            d.update(dyn)
            d["rate_per_kwh"] = dyn["effective_rate_per_kwh"]
            result.append(d)
        return result

    @staticmethod
    def get_node(node_id: str) -> Optional[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        row = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
        if not row:
            # Flexible matching for mock / alias identifiers
            alt_id = node_id.replace("RelayEV-Node-", "node_")
            row = conn.execute("SELECT * FROM nodes WHERE id = ? OR name LIKE ?", (alt_id, f"%{node_id}%")).fetchone()
        if not row:
            # Fallback to first active node
            row = conn.execute("SELECT * FROM nodes WHERE is_active = 1 LIMIT 1").fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        dyn = calculate_dynamic_tariff(d)
        d.update(dyn)
        d["rate_per_kwh"] = dyn["effective_rate_per_kwh"]
        return d

    @staticmethod
    def update_node_grid_status(
        node_id: str,
        grid_availability: str,
        power_source: Optional[str] = None,
        base_rate_per_kwh: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        node = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
        if not node:
            conn.close()
            return None

        keys = node.keys()
        ps = power_source or (node["power_source"] if "power_source" in keys else "HYBRID")
        br = base_rate_per_kwh if base_rate_per_kwh is not None else (node["base_rate_per_kwh"] if "base_rate_per_kwh" in keys else node["rate_per_kwh"])

        conn.execute("""
        UPDATE nodes 
        SET grid_availability = ?, power_source = ?, base_rate_per_kwh = ?
        WHERE id = ?
        """, (grid_availability.upper(), ps.upper(), br, node_id))
        conn.commit()
        conn.close()
        return DatabaseManager.get_node(node_id)

    @staticmethod
    def register_node(
        node_id: str,
        name: str,
        host_name: str,
        location: str,
        rate_per_kwh: float,
        max_power_kw: float = 3.3,
        latitude: float = 28.6140,
        longitude: float = 77.2090,
        hardware_secret: str = settings.NODE_SIGNATURE_KEY,
        host_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        conn = DatabaseManager.get_connection()
        conn.execute("""
        INSERT INTO nodes (id, name, host_name, host_user_id, location, latitude, longitude, rate_per_kwh, base_rate_per_kwh, grid_availability, power_source, max_power_kw, host_wallet_balance, hardware_secret, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', 'HYBRID', ?, 0.0, ?, ?)
        """, (node_id, name, host_name, host_user_id, location, latitude, longitude, rate_per_kwh, rate_per_kwh, max_power_kw, hardware_secret, now))
        conn.commit()
        conn.close()
        return DatabaseManager.get_node(node_id) # type: ignore

    @staticmethod
    def credit_host_wallet(node_id: str, amount: float, reference_id: str = ""):
        conn = DatabaseManager.get_connection()
        conn.execute("""
        UPDATE nodes SET host_wallet_balance = host_wallet_balance + ? WHERE id = ?
        """, (round(amount, 2), node_id))
        conn.commit()
        conn.close()

    @staticmethod
    def payout_host_wallet(node_id: str, amount: float) -> Tuple[bool, float, str]:
        conn = DatabaseManager.get_connection()
        row = conn.execute("SELECT host_wallet_balance FROM nodes WHERE id = ?", (node_id,)).fetchone()
        if not row or row["host_wallet_balance"] < amount:
            conn.close()
            return False, 0.0, "Insufficient host earnings balance."

        new_bal = round(row["host_wallet_balance"] - amount, 2)
        conn.execute("UPDATE nodes SET host_wallet_balance = ? WHERE id = ?", (new_bal, node_id))
        conn.commit()
        conn.close()
        return True, new_bal, "Payout processed."

    # =========================================================================
    # ESCROW & TRANSACTION OPERATIONS
    # =========================================================================

    @staticmethod
    def create_transaction(
        session_id: str,
        user_id: str,
        node_id: str,
        escrow_amount: float,
        rate_per_kwh: float,
        max_energy_kwh: float,
        escrow_token: str,
        expires_at_epoch: int
    ) -> Dict[str, Any]:
        tx_id = f"TX-{uuid.uuid4().hex[:12].upper()}"
        now = datetime.now(timezone.utc).isoformat()
        expires_at = datetime.fromtimestamp(expires_at_epoch, timezone.utc).isoformat()

        conn = DatabaseManager.get_connection()
        conn.execute("""
        INSERT INTO transactions (id, session_id, user_id, node_id, escrow_amount, rate_per_kwh, max_energy_kwh, escrow_token, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ESCROW_LOCKED', ?, ?)
        """, (tx_id, session_id, user_id, node_id, escrow_amount, rate_per_kwh, max_energy_kwh, escrow_token, now, expires_at))
        conn.commit()
        conn.close()
        return DatabaseManager.get_transaction(session_id) # type: ignore

    @staticmethod
    def get_transaction(session_id: str) -> Optional[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        row = conn.execute("SELECT * FROM transactions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def get_active_session_for_user(user_id: str) -> Optional[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        row = conn.execute("""
        SELECT * FROM transactions 
        WHERE user_id = ? AND status = 'ESCROW_LOCKED'
        ORDER BY created_at DESC LIMIT 1
        """, (user_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def settle_transaction(
        session_id: str,
        energy_kwh: float,
        actual_cost: float,
        refund_amount: float,
        signed_receipt_json: str,
        node_signature: str,
        nonce: Optional[str] = None,
        mule_user_id: Optional[str] = None,
        mule_reward_inr: float = 0.0
    ):
        now = datetime.now(timezone.utc).isoformat()
        status = "MULE_SYNCED" if mule_user_id else "SETTLED"
        conn = DatabaseManager.get_connection()
        conn.execute("""
        UPDATE transactions
        SET energy_consumed_kwh = ?,
            actual_cost = ?,
            refund_amount = ?,
            status = ?,
            signed_receipt = ?,
            node_signature = ?,
            nonce = ?,
            mule_user_id = ?,
            mule_reward_inr = ?,
            settled_at = ?
        WHERE session_id = ?
        """, (
            round(energy_kwh, 3),
            round(actual_cost, 2),
            round(refund_amount, 2),
            status,
            signed_receipt_json,
            node_signature,
            nonce,
            mule_user_id,
            round(mule_reward_inr, 2),
            now,
            session_id
        ))
        conn.commit()
        conn.close()

    @staticmethod
    def cancel_transaction(session_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        conn = DatabaseManager.get_connection()
        res = conn.execute("""
        UPDATE transactions
        SET status = 'CANCELLED', settled_at = ?
        WHERE session_id = ? AND status = 'ESCROW_LOCKED'
        """, (now, session_id))
        count = res.rowcount
        conn.commit()
        conn.close()
        return count > 0

    @staticmethod
    def get_user_transactions(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        rows = conn.execute("""
        SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
        """, (user_id, limit)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def get_all_transactions(limit: int = 100) -> List[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        rows = conn.execute("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    # =========================================================================
    # ANTI-REPLAY PROTECTION (NONCES)
    # =========================================================================

    @staticmethod
    def consume_nonce(nonce: str, session_id: str) -> bool:
        """
        Attempts to insert a nonce atomically.
        Returns True if fresh nonce; Returns False if nonce was already used (Replay Attack!).
        """
        if not nonce:
            return True
        now = datetime.now(timezone.utc).isoformat()
        conn = DatabaseManager.get_connection()
        try:
            conn.execute("INSERT INTO nonces (nonce, session_id, used_at) VALUES (?, ?, ?)", (nonce, session_id, now))
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            conn.close()
            return False

    # =========================================================================
    # AUDIT LOGS & HEALTH
    # =========================================================================

    @staticmethod
    def get_wallet_audit_logs(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        conn = DatabaseManager.get_connection()
        rows = conn.execute("""
        SELECT * FROM wallet_audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?
        """, (user_id, limit)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def get_system_stats() -> Dict[str, Any]:
        conn = DatabaseManager.get_connection()
        active_nodes = conn.execute("SELECT COUNT(*) FROM nodes WHERE is_active = 1").fetchone()[0]
        total_tx = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        conn.close()
        return {
            "active_nodes_count": active_nodes,
            "total_transactions_count": total_tx
        }

    # =========================================================================
    # PERSON 2: CLOUD ESCROW SWEEPER & MESH ANALYTICS
    # =========================================================================

    @staticmethod
    def sweep_expired_escrows() -> Tuple[int, float, List[str]]:
        """
        Scans for all active sessions with status 'ESCROW_LOCKED' whose expires_at timestamp has passed.
        Marks them as 'EXPIRED', restores 100% of escrow back to driver wallet, and records audit ledger logs.
        Returns: (swept_count, total_refunded_inr, swept_session_ids)
        """
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        conn = DatabaseManager.get_connection()

        rows = conn.execute("""
        SELECT session_id, user_id, escrow_amount, expires_at 
        FROM transactions 
        WHERE status = 'ESCROW_LOCKED'
        """).fetchall()

        swept_sessions: List[str] = []
        total_refunded = 0.0

        for r in rows:
            is_expired = False
            expires_at_str = r["expires_at"]
            try:
                # Handle ISO 8601 string or numeric timestamp
                if "T" in str(expires_at_str):
                    exp_dt = datetime.fromisoformat(expires_at_str)
                    if exp_dt.tzinfo is None:
                        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                    if now_dt >= exp_dt:
                        is_expired = True
                else:
                    exp_epoch = float(expires_at_str)
                    if now_dt.timestamp() >= exp_epoch:
                        is_expired = True
            except Exception:
                is_expired = False

            if is_expired:
                session_id = r["session_id"]
                user_id = r["user_id"]
                escrow_amt = round(float(r["escrow_amount"]), 2)

                # 1. Update transaction status
                conn.execute("""
                UPDATE transactions 
                SET status = 'EXPIRED', refund_amount = ?, settled_at = ?
                WHERE session_id = ?
                """, (escrow_amt, now_iso, session_id))

                # 2. Refund driver wallet
                u_row = conn.execute("SELECT wallet_balance FROM users WHERE id = ?", (user_id,)).fetchone()
                current_bal = u_row["wallet_balance"] if u_row else 0.0
                new_bal = round(current_bal + escrow_amt, 2)
                conn.execute("UPDATE users SET wallet_balance = ?, updated_at = ? WHERE id = ?", (new_bal, now_iso, user_id))

                # 3. Log audit ledger
                log_id = f"LOG-SWEEP-{uuid.uuid4().hex[:8].upper()}"
                conn.execute("""
                INSERT INTO wallet_audit_logs (id, user_id, change_type, amount, balance_after, reference_id, timestamp)
                VALUES (?, ?, 'ESCROW_EXPIRED_REFUND', ?, ?, ?, ?)
                """, (log_id, user_id, escrow_amt, new_bal, session_id, now_iso))

                swept_sessions.append(session_id)
                total_refunded = round(total_refunded + escrow_amt, 2)

        conn.commit()
        conn.close()
        return len(swept_sessions), total_refunded, swept_sessions

    @staticmethod
    def get_mesh_analytics() -> Dict[str, Any]:
        """
        Computes network-wide cloud telemetry and business metrics across all nodes and sessions.
        """
        conn = DatabaseManager.get_connection()
        
        # Transactions stats
        tx_stats = conn.execute("""
        SELECT 
            COUNT(*) as total_count,
            COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN energy_consumed_kwh ELSE 0 END), 0.0) as total_kwh,
            COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN actual_cost ELSE 0 END), 0.0) as total_gmv,
            COALESCE(SUM(mule_reward_inr), 0.0) as total_mule_bounties,
            COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN 1 ELSE 0 END), 0) as settled_count,
            COALESCE(SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END), 0) as expired_count,
            COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) as cancelled_count,
            COALESCE(SUM(CASE WHEN status = 'ESCROW_LOCKED' THEN 1 ELSE 0 END), 0) as active_escrows_count
        FROM transactions
        """).fetchone()

        # Nodes stats
        node_stats = conn.execute("""
        SELECT 
            COUNT(*) as active_count,
            COALESCE(SUM(host_wallet_balance), 0.0) as total_host_balance
        FROM nodes WHERE is_active = 1
        """).fetchone()

        conn.close()

        total_tx = tx_stats["total_count"] if tx_stats else 0
        settled_tx = tx_stats["settled_count"] if tx_stats else 0
        total_kwh = round(float(tx_stats["total_kwh"]), 3) if tx_stats else 0.0
        total_gmv = round(float(tx_stats["total_gmv"]), 2) if tx_stats else 0.0
        total_mule = round(float(tx_stats["total_mule_bounties"]), 2) if tx_stats else 0.0
        total_host_balance = round(float(node_stats["total_host_balance"]), 2) if node_stats else 0.0
        active_nodes = node_stats["active_count"] if node_stats else 0

        avg_kwh = round(total_kwh / settled_tx, 2) if settled_tx > 0 else 0.0
        avg_cost = round(total_gmv / settled_tx, 2) if settled_tx > 0 else 0.0

        return {
            "total_kwh_delivered": total_kwh,
            "total_gmv_inr": total_gmv,
            "total_host_payouts_inr": total_host_balance,
            "total_mule_bounties_inr": total_mule,
            "active_nodes_count": active_nodes,
            "total_transactions_count": total_tx,
            "settled_transactions_count": settled_tx,
            "expired_transactions_count": tx_stats["expired_count"] if tx_stats else 0,
            "cancelled_transactions_count": tx_stats["cancelled_count"] if tx_stats else 0,
            "active_escrows_count": tx_stats["active_escrows_count"] if tx_stats else 0,
            "avg_kwh_per_session": avg_kwh,
            "avg_cost_per_session": avg_cost
        }

    @staticmethod
    def get_node_analytics(node_id: str) -> Optional[Dict[str, Any]]:
        """
        Aggregates performance analytics for a single specific charging node.
        """
        node = DatabaseManager.get_node(node_id)
        if not node:
            return None

        conn = DatabaseManager.get_connection()
        stats = conn.execute("""
        SELECT 
            COUNT(*) as total_sessions,
            COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN 1 ELSE 0 END), 0) as settled_sessions,
            COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN energy_consumed_kwh ELSE 0 END), 0.0) as total_kwh,
            COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN actual_cost ELSE 0 END), 0.0) as total_revenue
        FROM transactions
        WHERE node_id = ?
        """, (node["id"],)).fetchone()
        conn.close()

        total_sessions = stats["total_sessions"] if stats else 0
        settled_sessions = stats["settled_sessions"] if stats else 0
        total_kwh = round(float(stats["total_kwh"]), 3) if stats else 0.0
        total_revenue = round(float(stats["total_revenue"]), 2) if stats else 0.0

        return {
            "node_id": node["id"],
            "node_name": node["name"],
            "host_name": node["host_name"],
            "location": node["location"],
            "rate_per_kwh": node["rate_per_kwh"],
            "host_wallet_balance": node["host_wallet_balance"],
            "total_sessions": total_sessions,
            "settled_sessions": settled_sessions,
            "total_kwh_delivered": total_kwh,
            "total_revenue_inr": total_revenue,
            "is_active": bool(node["is_active"]),
            "uptime_status": "ONLINE_HEALTHY" if node["is_active"] else "OFFLINE_MAINTENANCE"
        }

