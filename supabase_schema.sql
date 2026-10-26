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
