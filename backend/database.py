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

    # 2. Nodes table
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
        max_power_kw REAL NOT NULL DEFAULT 3.30,
        host_wallet_balance REAL NOT NULL DEFAULT 0.00,
        hardware_secret TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        firmware_version TEXT NOT NULL DEFAULT 'v1.4-pzem-ble',
        created_at TEXT NOT NULL
    );
    """)

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

    # Seed Default Charging Nodes if missing
    cursor.execute("SELECT COUNT(*) FROM nodes")
    if cursor.fetchone()[0] == 0:
        now = datetime.now(timezone.utc).isoformat()
        seed_nodes = [
            ("RelayEV-Node-01", "Mohan's Courtyard Node", "Mohan Ram", "host_mohan", "Rampur Village, Plot 4", 28.6140, 77.2090, 10.00, 3.30, 0.00, settings.NODE_SIGNATURE_KEY, now),
            ("RelayEV-Node-02", "Kavita's Farmhouse Node", "Kavita Devi", None, "Old Highway Jn, Rampur", 28.6180, 77.2150, 12.00, 2.80, 0.00, settings.NODE_SIGNATURE_KEY, now),
            ("RelayEV-Node-03", "Village Co-op Charging Hub", "Rampur Panchayat", None, "Market Road, Rampur", 28.6110, 77.2020, 8.50, 3.50, 0.00, settings.NODE_SIGNATURE_KEY, now),
            ("RelayEV-Node-04", "Sharma Dhaba Fast Tap", "Ramesh Sharma", None, "NH-48 Milestone 42", 28.6250, 77.2280, 14.00, 3.30, 0.00, settings.NODE_SIGNATURE_KEY, now),
        ]
        cursor.executemany("""
        INSERT INTO nodes (id, name, host_name, host_user_id, location, latitude, longitude, rate_per_kwh, max_power_kw, host_wallet_balance, hardware_secret, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_nodes)

    conn.commit()
    conn.close()

# Auto-initialize on module load
init_database()

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
        conn = DatabaseManager.get_connection()
        rows = conn.execute("SELECT * FROM nodes WHERE is_active = 1").fetchall()
        conn.close()
        return [dict(r) for r in rows]

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
        return dict(row) if row else None

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
        INSERT INTO nodes (id, name, host_name, host_user_id, location, latitude, longitude, rate_per_kwh, max_power_kw, host_wallet_balance, hardware_secret, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?)
        """, (node_id, name, host_name, host_user_id, location, latitude, longitude, rate_per_kwh, max_power_kw, hardware_secret, now))
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

