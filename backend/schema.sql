-- ============================================================================
-- RelayEV Supabase / PostgreSQL Database Schema
-- Offline-First Rural EV Charging Mesh Backend
-- ============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'driver', -- 'driver', 'host', 'mule'
    wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CHARGING NODES TABLE (Zero-OPEX Offline Host Hardware)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host_name TEXT NOT NULL,
    host_user_id TEXT NULL REFERENCES users(id),
    location TEXT NOT NULL,
    latitude NUMERIC(10, 6) NULL DEFAULT 28.6139,
    longitude NUMERIC(10, 6) NULL DEFAULT 77.2090,
    rate_per_kwh NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    max_power_kw NUMERIC(6, 2) NOT NULL DEFAULT 3.30,
    host_wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    hardware_secret TEXT NOT NULL DEFAULT 'relay_ev_hardware_master_secret_2026',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    firmware_version TEXT NOT NULL DEFAULT 'v1.4-pzem-ble',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TRANSACTIONS / ESCROW SESSIONS TABLE
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    node_id TEXT NOT NULL REFERENCES nodes(id),
    escrow_amount NUMERIC(10, 2) NOT NULL,
    rate_per_kwh NUMERIC(10, 2) NOT NULL,
    max_energy_kwh NUMERIC(10, 3) NOT NULL,
    energy_consumed_kwh NUMERIC(10, 3) DEFAULT 0.000,
    actual_cost NUMERIC(10, 2) DEFAULT 0.00,
    refund_amount NUMERIC(10, 2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'ESCROW_LOCKED', 
    -- Statuses: 'ESCROW_LOCKED', 'ACTIVE', 'SETTLED', 'MULE_SYNCED', 'CANCELLED', 'DISPUTED'
    escrow_token TEXT NOT NULL,
    signed_receipt TEXT NULL,
    receipt_hash TEXT NULL,
    node_signature TEXT NULL,
    nonce TEXT NULL,
    mule_user_id TEXT NULL REFERENCES users(id),
    mule_reward_inr NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ NULL
);

-- 4. NONCE TABLE FOR ANTI-REPLAY PROTECTION
CREATE TABLE IF NOT EXISTS nonces (
    nonce TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WALLET AUDIT LEDGER TABLE
CREATE TABLE IF NOT EXISTS wallet_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    change_type TEXT NOT NULL, -- 'ESCROW_LOCK', 'ESCROW_REFUND', 'ESCROW_CANCEL', 'TOPUP', 'HOST_EARNING', 'MULE_REWARD'
    amount NUMERIC(10, 2) NOT NULL,
    balance_after NUMERIC(10, 2) NOT NULL,
    reference_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_node_id ON transactions(node_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_nonces_nonce ON nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON wallet_audit_logs(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive public read access for community mesh participants
DROP POLICY IF EXISTS "Public read nodes" ON nodes;
CREATE POLICY "Public read nodes" ON nodes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read user profiles" ON users;
CREATE POLICY "Public read user profiles" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read transactions" ON transactions;
CREATE POLICY "Public read transactions" ON transactions FOR SELECT USING (true);

-- Seed Initial Sprint Users
INSERT INTO users (id, name, phone, role, wallet_balance)
VALUES 
    ('user_88', 'Anaya Rao (EV Driver)', '+91-9876543210', 'driver', 500.00),
    ('user_99_mule', 'Rohan Verma (Data Mule)', '+91-9811223344', 'mule', 50.00),
    ('host_mohan', 'Mohan Ram (Host)', '+91-9822334455', 'host', 0.00)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Sprint Charging Nodes
INSERT INTO nodes (id, name, host_name, host_user_id, location, latitude, longitude, rate_per_kwh, max_power_kw, host_wallet_balance, hardware_secret)
VALUES
    ('RelayEV-Node-01', 'Mohan''s Courtyard Node', 'Mohan Ram', 'host_mohan', 'Rampur Village, Plot 4', 28.6140, 77.2090, 10.00, 3.30, 0.00, 'relay_ev_hardware_master_secret_2026'),
    ('RelayEV-Node-02', 'Kavita''s Farmhouse Node', 'Kavita Devi', NULL, 'Old Highway Jn, Rampur', 28.6180, 77.2150, 12.00, 2.80, 0.00, 'relay_ev_hardware_master_secret_2026'),
    ('RelayEV-Node-03', 'Village Co-op Charging Hub', 'Rampur Panchayat', NULL, 'Market Road, Rampur', 28.6110, 77.2020, 8.50, 3.50, 0.00, 'relay_ev_hardware_master_secret_2026'),
    ('RelayEV-Node-04', 'Sharma Dhaba Fast Tap', 'Ramesh Sharma', NULL, 'NH-48 Milestone 42', 28.6250, 77.2280, 14.00, 3.30, 0.00, 'relay_ev_hardware_master_secret_2026')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. PERSON 2: ADVANCED ANALYTICS VIEWS & STORED RPC FUNCTIONS
-- ============================================================================

-- View: Station performance summary
CREATE OR REPLACE VIEW view_node_performance AS
SELECT 
    n.id AS node_id,
    n.name AS node_name,
    n.host_name,
    n.rate_per_kwh,
    n.host_wallet_balance,
    COUNT(t.id) AS total_sessions,
    COUNT(CASE WHEN t.status IN ('SETTLED', 'MULE_SYNCED') THEN 1 END) AS settled_sessions,
    COALESCE(SUM(CASE WHEN t.status IN ('SETTLED', 'MULE_SYNCED') THEN t.energy_consumed_kwh ELSE 0 END), 0) AS total_kwh_delivered,
    COALESCE(SUM(CASE WHEN t.status IN ('SETTLED', 'MULE_SYNCED') THEN t.actual_cost ELSE 0 END), 0) AS total_revenue
FROM nodes n
LEFT JOIN transactions t ON n.id = t.node_id
GROUP BY n.id, n.name, n.host_name, n.rate_per_kwh, n.host_wallet_balance;

-- View: Data mule mesh contributions
CREATE OR REPLACE VIEW view_mule_contributions AS
SELECT 
    u.id AS mule_user_id,
    u.name AS mule_name,
    COUNT(t.id) AS vouchers_synced,
    COALESCE(SUM(t.mule_reward_inr), 0) AS total_bounties_earned
FROM users u
JOIN transactions t ON u.id = t.mule_user_id
GROUP BY u.id, u.name;

-- Stored RPC: Sweep expired unredeemed escrows & auto-refund
CREATE OR REPLACE FUNCTION rpc_sweep_expired_escrows()
RETURNS json AS $$
DECLARE
    swept_count INT := 0;
    total_refund NUMERIC(10, 2) := 0.00;
    r RECORD;
BEGIN
    FOR r IN 
        SELECT session_id, user_id, escrow_amount 
        FROM transactions 
        WHERE status = 'ESCROW_LOCKED' AND expires_at < NOW()
    LOOP
        UPDATE transactions 
        SET status = 'EXPIRED', refund_amount = r.escrow_amount, settled_at = NOW()
        WHERE session_id = r.session_id;

        UPDATE users
        SET wallet_balance = wallet_balance + r.escrow_amount, updated_at = NOW()
        WHERE id = r.user_id;

        INSERT INTO wallet_audit_logs (id, user_id, change_type, amount, balance_after, reference_id, timestamp)
        SELECT 'LOG-SWEEP-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8), r.user_id, 'ESCROW_EXPIRED_REFUND', r.escrow_amount, wallet_balance, r.session_id, NOW()
        FROM users WHERE id = r.user_id;

        swept_count := swept_count + 1;
        total_refund := total_refund + r.escrow_amount;
    END LOOP;

    RETURN json_build_object(
        'status', 'SUCCESS',
        'swept_count', swept_count,
        'total_refunded_inr', total_refund
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stored RPC: Cloud telemetry & mesh analytics aggregation
CREATE OR REPLACE FUNCTION rpc_get_mesh_analytics()
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'total_kwh_delivered', COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN energy_consumed_kwh ELSE 0 END), 0),
        'total_gmv_inr', COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN actual_cost ELSE 0 END), 0),
        'total_mule_bounties_inr', COALESCE(SUM(mule_reward_inr), 0),
        'active_nodes_count', (SELECT COUNT(*) FROM nodes WHERE is_active = TRUE),
        'total_transactions_count', COUNT(*),
        'settled_transactions_count', COUNT(CASE WHEN status IN ('SETTLED', 'MULE_SYNCED') THEN 1 END)
    ) INTO result
    FROM transactions;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

