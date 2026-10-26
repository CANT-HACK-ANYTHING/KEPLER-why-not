export interface ChargingNode {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  address_reference?: string;
  tariff_per_kwh: number;
  max_power_kw: number;
  status: "available" | "busy" | "offline_fault";
  last_synced_at?: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email?: string;
  wallet_balance: number;
  locked_escrow_balance: number;
}

export interface EscrowTokenPayload {
  tx_id: string;
  node_id: string;
  escrow_amount: number;
  max_kwh: number;
  session_token: string;
}

export interface OfflineReceiptPayload {
  tx_id: string;
  node_id: string;
  kwh_delivered: number;
  timestamp_end: number;
}
