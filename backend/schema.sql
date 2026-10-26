-- ============================================================================
-- RelayEV Supabase / PostgreSQL Database Schema
-- Offline-First Rural EV Charging Mesh Backend
-- 20 Verified Mock Charging Stations in Vellore Highway & Mesh Corridor
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
    latitude NUMERIC(10, 6) NULL DEFAULT 12.9692,
    longitude NUMERIC(10, 6) NULL DEFAULT 79.1559,
    rate_per_kwh NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    base_rate_per_kwh NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    grid_availability TEXT NOT NULL DEFAULT 'NORMAL', -- 'SURPLUS', 'NORMAL', 'STRAINED', 'BATTERY'
    power_source TEXT NOT NULL DEFAULT 'GRID',       -- 'SOLAR', 'GRID', 'BATTERY_BACKUP', 'HYBRID'
    dynamic_pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_power_kw NUMERIC(6, 2) NOT NULL DEFAULT 3.30,
    host_wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    hardware_secret TEXT NOT NULL DEFAULT 'relay_ev_hardware_master_secret_2026',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    firmware_version TEXT NOT NULL DEFAULT 'v1.4-pzem-ble',
    coverage_radius_km NUMERIC(5, 2) DEFAULT 2.50,
    hex_cell_id TEXT DEFAULT '87602816BFFFFFF',
    hardware_note TEXT NULL,
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
    -- Statuses: 'ESCROW_LOCKED', 'ACTIVE', 'SETTLED', 'MULE_SYNCED', 'CANCELLED', 'DISPUTED', 'EXPIRED'
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
CREATE INDEX IF NOT EXISTS idx_nodes_grid_avail ON nodes(grid_availability);

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

-- Seed Initial Users (Drivers, Mules, and Station Hosts)
INSERT INTO users (id, name, phone, role, wallet_balance)
VALUES 
    ('user_88', 'Anaya Rao (EV Driver)', '+91-9876543210', 'driver', 500.00),
    ('user_99_mule', 'Rohan Verma (Data Mule)', '+91-9811223344', 'mule', 50.00),
    ('host_rajesh', 'Rajesh Kumar (VIT Solar)', '+91-9822334401', 'host', 0.00),
    ('host_murugan', 'Murugan S. (Katpadi Relay)', '+91-9822334402', 'host', 0.00),
    ('host_sripuram', 'Lakshmi Narayani Trust', '+91-9822334403', 'host', 0.00),
    ('host_kannan', 'Kannan Heritage Cafeteria', '+91-9822334404', 'host', 0.00),
    ('host_anand', 'Dr. Anand Green Energy', '+91-9822334405', 'host', 0.00),
    ('host_ranipet', 'Ranipet Fleet Co-op', '+91-9822334406', 'host', 0.00),
    ('host_ismail', 'Ismail Leather Works', '+91-9822334407', 'host', 0.00),
    ('host_govind', 'Govindarajan Temple Inn', '+91-9822334408', 'host', 0.00),
    ('host_walajah', 'Highway King Dhaba Tap', '+91-9822334409', 'host', 0.00),
    ('host_gudiyatham', 'Venkatesan Agro Solar', '+91-9822334410', 'host', 0.00),
    ('host_nawaz', 'Nawaz Basha (Arcot Sweets)', '+91-9822334411', 'host', 0.00),
    ('host_farooq', 'Farooq Hospitality & EV', '+91-9822334412', 'host', 0.00),
    ('host_senguttuvan', 'Senguttuvan Highway Lodge', '+91-9822334413', 'host', 0.00),
    ('host_tariq', 'Tariq Leather & Green Power', '+91-9822334414', 'host', 0.00),
    ('host_selvam', 'Selvam Coconut Grove', '+91-9822334415', 'host', 0.00),
    ('host_ramesh', 'Ramesh Babu Express Laundry', '+91-9822334416', 'host', 0.00),
    ('host_techcoop', 'Student Tech Innovators Co-op', '+91-9822334417', 'host', 0.00),
    ('host_mustafa', 'Mustafa Merchant Union', '+91-9822334418', 'host', 0.00),
    ('host_greenvalley', 'Green Valley Eco Resort', '+91-9822334419', 'host', 0.00),
    ('host_murthy', 'Murthy Transport Logistics', '+91-9822334420', 'host', 0.00)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

-- Seed 20 Verified Mock Charging Stations in Vellore & Surrounding Corridors
INSERT INTO nodes (
    id, name, host_name, host_user_id, location, latitude, longitude,
    rate_per_kwh, base_rate_per_kwh, grid_availability, power_source,
    max_power_kw, host_wallet_balance, hardware_secret, is_active,
    coverage_radius_km, hex_cell_id, hardware_note
)
VALUES
    ('node_esp32_01', 'VIT Campus Solar Relay', 'Rajesh Kumar (VIT Solar Grid)', 'host_rajesh', 'Near VIT Main Gate, Tiruvalam Road, Katpadi', 12.9692, 79.1559, 8.00, 10.00, 'SURPLUS', 'SOLAR', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.4, '87602816BFFFFFF', '100% Rooftop solar + PZEM-004T with shaded 2W bay'),
    ('node_esp32_02', 'Katpadi Junction Charging Point', 'Murugan S. (Station Relay)', 'host_murugan', 'Near Katpadi Railway Station, NH-46', 12.9783, 79.1450, 12.50, 12.50, 'NORMAL', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.4, '87602816AFFFFFF', '24/7 Chai point beside station parking, 30A relay'),
    ('node_esp32_03', 'Sripuram Golden Temple Hub', 'Lakshmi Narayani Trust', 'host_sripuram', 'Malaikodi, Sripuram Temple Road', 12.8998, 79.1162, 6.80, 8.50, 'SURPLUS', 'SOLAR', 7.20, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.2, '87602814DFFFFFF', 'Dual Type-2 Fast AC with pilgrimage visitor parking'),
    ('node_esp32_04', 'Vellore Fort Heritage Tap', 'Kannan Heritage Cafeteria', 'host_kannan', 'Opp. Vellore Fort East Gate, Anna Salai', 12.9205, 79.1325, 11.00, 11.00, 'NORMAL', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.5, '87602815AFFFFFF', 'Heritage moat parking with shaded tree canopy'),
    ('node_esp32_05', 'Bagayam Rural Clean Hub', 'Dr. Anand Green Energy', 'host_anand', 'Near CMC Bagayam Campus, College Hill', 12.8710, 79.1350, 7.60, 9.50, 'SURPLUS', 'SOLAR', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.8, '876028143FFFFFF', 'Solar battery buffer, open for public 2W/3W charging'),
    ('node_esp32_06', 'Ranipet Industrial Corridor Relay', 'Ranipet Fleet Co-op', 'host_ranipet', 'SIPCOT Phase 1, Chennai Highway, Ranipet', 12.9275, 79.3330, 17.55, 13.00, 'STRAINED', 'GRID', 7.40, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.6, '876028172FFFFFF', 'Heavy-duty 32A industrial line for commercial cargo 3W'),
    ('node_esp32_07', 'Ambur Leather Town Node', 'Ismail Leather Works', 'host_ismail', 'NH-48 Bypass, Near Star Biryani, Ambur', 12.7905, 78.7160, 14.40, 12.00, 'BATTERY', 'HYBRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 4.0, '87602810CFFFFFF', 'Highway rest stop node with 24/7 tea & tire check'),
    ('node_esp32_08', 'Sholinghur Hill Temple Relay', 'Govindarajan Temple Inn', 'host_govind', 'Foot of Yoga Narasimha Swamy Hill, Sholinghur', 13.1140, 79.4240, 14.18, 10.50, 'STRAINED', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.0, '87602811EFFFFFF', 'Solar off-grid battery backed charging tap'),
    ('node_esp32_09', 'Walajah Highway Toll Dhaba', 'Highway King Dhaba Tap', 'host_walajah', 'NH-48 Toll Plaza Corridor, Walajapet', 12.9810, 79.3620, 16.80, 14.00, 'BATTERY', 'HYBRID', 7.20, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.5, '87602817AFFFFFF', '24/7 Dhaba dining with fenced overnight EV charging bay'),
    ('node_esp32_10', 'Gudiyatham Agricultural Feeder', 'Venkatesan Agro Solar', 'host_gudiyatham', 'Agricultural Market Yard, Gudiyatham Bypass', 12.9460, 78.8710, 7.20, 9.00, 'SURPLUS', 'SOLAR', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.8, '87602812EFFFFFF', 'Subsidized farm community tariff with solar canopy'),
    ('node_esp32_11', 'Arcot Royal Palace Tap', 'Nawaz Basha (Arcot Sweets Corner)', 'host_nawaz', 'Palace Road, Near Arcot Clock Tower', 12.9042, 79.3326, 10.50, 10.50, 'NORMAL', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.5, '876028173FFFFFF', 'Town center sweet stall tap with shaded e-bike parking'),
    ('node_esp32_12', 'Vaniyambadi Biryani Expressway Stop', 'Farooq Hospitality & EV Point', 'host_farooq', 'Chennai-Bengaluru Highway, Vaniyambadi Toll', 12.6830, 78.6180, 10.80, 13.50, 'SURPLUS', 'SOLAR', 7.40, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 4.2, '876028105FFFFFF', 'Express highway dual 32A charging with 24h restaurant'),
    ('node_esp32_13', 'Pallikonda Toll Plaza Safe Rest', 'Senguttuvan Highway Lodge', 'host_senguttuvan', 'NH-48 KM 126, Pallikonda Service Road', 12.9090, 78.9660, 14.40, 12.00, 'BATTERY', 'HYBRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.2, '876028135FFFFFF', 'Quiet night parking with 16A industrial plug socket'),
    ('node_esp32_14', 'Melvisharam Tannery Eco-Charge', 'Tariq Leather Works & Green Power', 'host_tariq', 'Trunk Road, Melvisharam Industrial Area', 12.9350, 79.2480, 15.53, 11.50, 'STRAINED', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.6, '87602816EFFFFFF', 'Secured yard with surge protector & fire safety buffer'),
    ('node_esp32_15', 'Tiruvallam Bridge River Tap', 'Selvam Coconut Grove & Charging', 'host_selvam', 'Ponnai Road Junction, Tiruvallam', 12.9960, 79.2230, 7.20, 9.00, 'SURPLUS', 'SOLAR', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.8, '87602816DFFFFFF', 'Shaded coconut orchard parking with cool breeze & water'),
    ('node_esp32_16', 'Sathuvachari Expressway Transit', 'Ramesh Babu Express Laundry', 'host_ramesh', 'Near Collectorate Office, Sathuvachari', 12.9380, 79.1650, 10.00, 10.00, 'NORMAL', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.2, '87602815BFFFFFF', 'Convenient urban node near govt offices & commercial banks'),
    ('node_esp32_17', 'VIT Lake Back-Gate Eco-Tap', 'Student Tech Innovators Co-op', 'host_techcoop', 'Behind VIT Lake, Kangeyanallur Road', 12.9730, 79.1620, 6.40, 8.00, 'SURPLUS', 'SOLAR', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.0, '876028169FFFFFF', 'IoT PZEM telemetry node with experimental solar tracker'),
    ('node_esp32_18', 'Vellore Old Town Bazaar Point', 'Mustafa Merchant Union', 'host_mustafa', 'Main Bazaar Road, Near Long Bazaar', 12.9150, 79.1300, 16.88, 12.50, 'STRAINED', 'GRID', 3.30, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 2.0, '876028158FFFFFF', 'Heavy traffic commercial corridor with delivery 3W bay'),
    ('node_esp32_19', 'Otteri Lake Nature Park Relay', 'Green Valley Eco Resort', 'host_greenvalley', 'Otteri Circular Road, Southern Foothills', 12.8870, 79.1240, 10.00, 10.00, 'NORMAL', 'HYBRID', 7.20, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 3.0, '876028148FFFFFF', 'Dual fast AC charging bay surrounded by nature walking trail'),
    ('node_esp32_20', 'Arakkonam Rail Hub Inter-Connect', 'Murthy Transport Logistics', 'host_murthy', 'Station Road, Arakkonam Junction Feeder', 13.0800, 79.6700, 13.20, 11.00, 'BATTERY', 'BATTERY_BACKUP', 7.40, 0.00, 'relay_ev_hardware_master_secret_2026', TRUE, 4.5, '876028189FFFFFF', 'High-capacity railway interchange buffer for 2W/3W fleets')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    host_name = EXCLUDED.host_name,
    location = EXCLUDED.location,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    rate_per_kwh = EXCLUDED.rate_per_kwh,
    base_rate_per_kwh = EXCLUDED.base_rate_per_kwh,
    grid_availability = EXCLUDED.grid_availability,
    power_source = EXCLUDED.power_source,
    max_power_kw = EXCLUDED.max_power_kw,
    coverage_radius_km = EXCLUDED.coverage_radius_km,
    hex_cell_id = EXCLUDED.hex_cell_id,
    hardware_note = EXCLUDED.hardware_note;

-- ============================================================================
-- 6. ADVANCED ANALYTICS VIEWS & STORED RPC FUNCTIONS
-- ============================================================================

-- View: Station performance summary
CREATE OR REPLACE VIEW view_node_performance AS
SELECT 
    n.id AS node_id,
    n.name AS node_name,
    n.host_name,
    n.rate_per_kwh,
    n.base_rate_per_kwh,
    n.grid_availability,
    n.host_wallet_balance,
    COUNT(t.id) AS total_sessions,
    COUNT(CASE WHEN t.status IN ('SETTLED', 'MULE_SYNCED') THEN 1 END) AS settled_sessions,
    COALESCE(SUM(CASE WHEN t.status IN ('SETTLED', 'MULE_SYNCED') THEN t.energy_consumed_kwh ELSE 0 END), 0) AS total_kwh_delivered,
    COALESCE(SUM(CASE WHEN t.status IN ('SETTLED', 'MULE_SYNCED') THEN t.actual_cost ELSE 0 END), 0) AS total_revenue
FROM nodes n
LEFT JOIN transactions t ON n.id = t.node_id
GROUP BY n.id, n.name, n.host_name, n.rate_per_kwh, n.base_rate_per_kwh, n.grid_availability, n.host_wallet_balance;

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
