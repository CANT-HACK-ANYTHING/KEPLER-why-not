// Standard RelayEV GATT Configuration UUIDs
export const RELAY_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const TOKEN_WRITE_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
export const RECEIPT_NOTIFY_UUID = "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e";

export type BleConnectionState =
  | "IDLE"
  | "SCANNING"
  | "CONNECTING"
  | "GATT_CONNECTED"
  | "WRITING_TOKEN"
  | "CHARGING"
  | "STOPPING"
  | "RECEIPT_RECEIVED"
  | "ERROR";

export interface ChargingReceipt {
  session_id: string;
  node_id: string;
  user_id: string;
  energy_consumed_kwh: number;
  actual_cost: number;
  timestamp: number;
  nonce: string;
  node_signature: string;
}

export interface LiveTelemetry {
  voltage: number;       // Volts (PZEM-004T AC reading, ~230V)
  current: number;       // Amperes (~13.8A)
  power_kw: number;      // Active Kilowatts (~3.17 kW)
  energy_kwh: number;    // Accumulated kWh
  cost_inr: number;      // Live cost in INR
  duration_seconds: number;
  relay_state: "CLOSED" | "OPEN"; // CLOSED = Conducting / Charging, OPEN = Disconnected
}

export interface BleConnectorProps {
  nodeId: string;
  sessionToken: string;
  onReceiptReceived: (receipt: ChargingReceipt) => void;
  onStateChange?: (state: BleConnectionState) => void;
  ratePerKwh?: number;
}

export interface BleSimulatorProps {
  nodeId: string;
  sessionToken: string;
  onReceiptReceived: (receipt: ChargingReceipt) => void;
  onStateChange?: (state: BleConnectionState) => void;
  ratePerKwh?: number;
  durationSeconds?: number; // Default 8-10 seconds for sprint demo
  targetKwh?: number;       // Default 8.42 kWh cutoff
}
