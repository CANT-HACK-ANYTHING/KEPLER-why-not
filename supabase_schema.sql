-- RelayEV: Rural EV Charging Network Database Schema
-- Run this in the Supabase SQL Editor

-- 1. Create Nodes Table
CREATE TABLE IF NOT EXISTS public.nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    tariff_per_kwh NUMERIC(6, 2) NOT NULL DEFAULT 12.00,
    max_power_kw NUMERIC(4, 2) NOT NULL DEFAULT 3.3,
    status TEXT NOT NULL CHECK (status IN ('available', 'busy', 'offline_fault')) DEFAULT 'available',
    address TEXT,
    host_name TEXT,
    description TEXT,
    last_ping TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS) & Public Read Access
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access for charging nodes"
    ON public.nodes
    FOR SELECT
    USING (true);

-- 3. Enable Supabase Realtime for Nodes Table
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;

-- 4. Seed Rural EV Demonstration Nodes (Vellore Region, Tamil Nadu)
INSERT INTO public.nodes (id, name, latitude, longitude, tariff_per_kwh, max_power_kw, status, address, host_name, description)
VALUES 
    (
        'node_esp32_01', 
        'VIT Campus Solar Relay', 
        12.9692, 
        79.1559, 
        10.00, 
        3.3, 
        'available', 
        'Near VIT Main Gate, Tiruvalam Road, Katpadi', 
        'Rajesh Kumar', 
        'Solar-backed 16A AC node with rooftop panel array. Ideal for student EVs.'
    ),
    (
        'node_esp32_02', 
        'Katpadi Junction Charging Point', 
        12.9783, 
        79.1450, 
        12.50, 
        3.3, 
        'busy', 
        'Near Katpadi Railway Station, NH46 Service Road', 
        'Murugan S.', 
        'High traffic relay near railway junction. Currently occupied by MG ZS EV.'
    ),
    (
        'node_esp32_03', 
        'Sripuram Golden Temple Hub', 
        12.8998, 
        79.1162, 
        11.50, 
        3.3, 
        'available', 
        'Sripuram Bypass Road, Near Temple Parking', 
        'Lakshmi Narayanan', 
        'Shaded charging bay with temple rest area. Grid-stable zone.'
    ),
    (
        'node_esp32_04', 
        'Ranipet Highway Dhaba Relay', 
        12.9321, 
        79.3333, 
        14.00, 
        3.3, 
        'available', 
        'Chennai-Bangalore NH48, Ranipet Toll Plaza Area', 
        'Gurpreet Singh', 
        'Convenient highway stop with food & rest. 24/7 grid power backup.'
    ),
    (
        'node_esp32_05', 
        'Ambur Leather Town Node', 
        12.7910, 
        78.7160, 
        13.00, 
        3.3, 
        'offline_fault', 
        'Old NH46, Near Ambur Bus Stand', 
        'Mohammed Irfan', 
        'Currently offline — inverter maintenance scheduled. Back online by evening.'
    ),
    (
        'node_esp32_06', 
        'Sholinghur Hill Temple Relay', 
        12.7814, 
        79.3203, 
        15.00, 
        3.3, 
        'busy', 
        'Sholinghur Temple Road, Near Foothill Parking', 
        'Venkatesh R.', 
        'Pilgrim route relay. Currently occupied by Tata Nexon EV Max.'
    )
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    tariff_per_kwh = EXCLUDED.tariff_per_kwh;


-- ============================================================================
-- 5. USERS, TRANSACTIONS, NONCES & AUDIT TABLES (Backend & Supabase Lead)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'driver',
    wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES public.users(id),
    node_id TEXT NOT NULL REFERENCES public.nodes(id),
    escrow_amount NUMERIC(10, 2) NOT NULL,
    rate_per_kwh NUMERIC(10, 2) NOT NULL,
    max_energy_kwh NUMERIC(10, 3) NOT NULL,
    energy_consumed_kwh NUMERIC(10, 3) DEFAULT 0.000,
    actual_cost NUMERIC(10, 2) DEFAULT 0.00,
    refund_amount NUMERIC(10, 2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'ESCROW_LOCKED',
    escrow_token TEXT NOT NULL,
    signed_receipt TEXT NULL,
    receipt_hash TEXT NULL,
    node_signature TEXT NULL,
    nonce TEXT NULL,
    mule_user_id TEXT NULL REFERENCES public.users(id),
    mule_reward_inr NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.nonces (
    nonce TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users(id),
    change_type TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    balance_after NUMERIC(10, 2) NOT NULL,
    reference_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS & Realtime
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public read transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read audit logs" ON public.wallet_audit_logs FOR SELECT USING (true);

-- ============================================================================
-- 6. RPC STORED FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_sweep_expired_escrows()
RETURNS json AS $$
DECLARE
    swept_count INT := 0;
    total_refund NUMERIC(10, 2) := 0.00;
    r RECORD;
BEGIN
    FOR r IN 
        SELECT session_id, user_id, escrow_amount 
        FROM public.transactions 
        WHERE status = 'ESCROW_LOCKED' AND expires_at < NOW()
    LOOP
        UPDATE public.transactions 
        SET status = 'EXPIRED', refund_amount = r.escrow_amount, settled_at = NOW()
        WHERE session_id = r.session_id;

        UPDATE public.users
        SET wallet_balance = wallet_balance + r.escrow_amount, updated_at = NOW()
        WHERE id = r.user_id;

        INSERT INTO public.wallet_audit_logs (id, user_id, change_type, amount, balance_after, reference_id, timestamp)
        SELECT 'LOG-SWEEP-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8), r.user_id, 'ESCROW_EXPIRED_REFUND', r.escrow_amount, wallet_balance, r.session_id, NOW()
        FROM public.users WHERE id = r.user_id;

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
