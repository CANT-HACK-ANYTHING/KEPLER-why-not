import { createClient } from '@supabase/supabase-js';
import { ChargingNode } from '@/types/node';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-relayev-supabase.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('mock-relayev')
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Fallback demo nodes for offline rural testing or prior to database seed
// 6 mock charging stations around Vellore with Hexagonal Spatial Grid Mapping
export const DEMO_NODES: ChargingNode[] = [
  {
    id: 'node_esp32_01',
    name: 'VIT Campus Solar Relay',
    latitude: 12.9692,
    longitude: 79.1559,
    tariff_per_kwh: 10.00,
    max_power_kw: 3.3,
    status: 'available',
    address: 'Near VIT Main Gate, Tiruvalam Road, Katpadi',
    host_name: 'Rajesh Kumar',
    description: 'Solar-backed 16A AC node with rooftop panel array. Ideal for student EVs.',
    hexCellId: '87602816BFFFFFF',
    coverageRadiusKm: 2.4,
  },
  {
    id: 'node_esp32_02',
    name: 'Katpadi Junction Charging Point',
    latitude: 12.9783,
    longitude: 79.1450,
    tariff_per_kwh: 12.50,
    max_power_kw: 3.3,
    status: 'busy',
    address: 'Near Katpadi Railway Station, NH46 Service Road',
    host_name: 'Murugan S.',
    description: 'High traffic relay near railway junction. Currently occupied by MG ZS EV.',
    hexCellId: '87602816AFFFFFF',
    coverageRadiusKm: 2.4,
  },
  {
    id: 'node_esp32_03',
    name: 'Sripuram Golden Temple Hub',
    latitude: 12.8998,
    longitude: 79.1162,
    tariff_per_kwh: 11.50,
    max_power_kw: 3.3,
    status: 'available',
    address: 'Sripuram Bypass Road, Near Temple Parking',
    host_name: 'Lakshmi Narayanan',
    description: 'Shaded charging bay with temple rest area. Grid-stable zone.',
    hexCellId: '87602814DFFFFFF',
    coverageRadiusKm: 3.2,
  },
  {
    id: 'node_esp32_04',
    name: 'Ranipet Highway Dhaba Relay',
    latitude: 12.9321,
    longitude: 79.3333,
    tariff_per_kwh: 14.00,
    max_power_kw: 3.3,
    status: 'available',
    address: 'Chennai-Bangalore NH48, Ranipet Toll Plaza Area',
    host_name: 'Gurpreet Singh',
    description: 'Convenient highway stop with food & rest. 24/7 grid power backup.',
    hexCellId: '876028172FFFFFF',
    coverageRadiusKm: 3.6,
  },
  {
    id: 'node_esp32_05',
    name: 'Ambur Leather Town Node',
    latitude: 12.7910,
    longitude: 78.7160,
    tariff_per_kwh: 13.00,
    max_power_kw: 3.3,
    status: 'offline_fault',
    address: 'Old NH46, Near Ambur Bus Stand',
    host_name: 'Mohammed Irfan',
    description: 'Currently offline — inverter maintenance scheduled. Back online by evening.',
    hexCellId: '87602810CFFFFFF',
    coverageRadiusKm: 4.0,
  },
  {
    id: 'node_esp32_06',
    name: 'Sholinghur Hill Temple Relay',
    latitude: 12.7814,
    longitude: 79.3203,
    tariff_per_kwh: 15.00,
    max_power_kw: 3.3,
    status: 'busy',
    address: 'Sholinghur Temple Road, Near Foothill Parking',
    host_name: 'Venkatesh R.',
    description: 'Pilgrim route relay. Currently occupied by Tata Nexon EV Max.',
    hexCellId: '87602811EFFFFFF',
    coverageRadiusKm: 3.0,
  },
];
