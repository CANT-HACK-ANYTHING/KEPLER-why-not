export type NodeStatus = 'available' | 'busy' | 'offline_fault';
export type Theme = 'dark' | 'light';
export type GridAvailability = 'SURPLUS' | 'NORMAL' | 'STRAINED' | 'BATTERY' | 'surplus' | 'normal' | 'strained' | 'inverter_backup';
export type PowerSource = 'SOLAR' | 'GRID' | 'BATTERY' | 'COMMUNITY_BATTERY' | 'HYBRID' | 'solar' | 'grid' | 'battery_backup' | 'hybrid';

export interface ChargingNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tariff_per_kwh: number;
  rate_per_kwh?: number;
  base_rate_per_kwh?: number;
  effective_rate_per_kwh?: number;
  grid_availability?: GridAvailability;
  power_source?: PowerSource;
  tariff_multiplier?: number;
  tariff_reason?: string;
  badge_color?: string;
  max_power_kw: number;
  status: NodeStatus;
  address?: string;
  address_reference?: string;
  host_name?: string;
  description?: string;
  last_ping?: string;
  hexCellId?: string;
  coverageRadiusKm?: number;
}

export interface NodeSelectionPayload {
  nodeId: string;
  tariffPerKwh: number;
  latitude: number;
  longitude: number;
  name: string;
  maxPowerKw: number;
  gridAvailability?: GridAvailability;
}
