export type NodeStatus = 'available' | 'busy' | 'offline_fault';
export type Theme = 'dark' | 'light';

export interface ChargingNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tariff_per_kwh: number;
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
}
