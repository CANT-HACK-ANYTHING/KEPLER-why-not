from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# ==============================================================================
# USER / WALLET SCHEMAS
# ==============================================================================

class UserOut(BaseModel):
    id: str
    name: str
    phone: str
    role: str
    wallet_balance: float
    created_at: str

class UserTopupRequest(BaseModel):
    user_id: str = Field(default="user_88", description="Driver user ID to top up")
    amount: float = Field(..., gt=0, le=10000, description="Amount in INR to deposit into wallet")
    payment_method: str = Field(default="UPI_INSTANT", description="Payment instrument used (e.g. UPI, Card)")

class UserTopupResponse(BaseModel):
    user_id: str
    amount_added: float
    previous_balance: float
    new_balance: float
    reference_id: str
    message: str

class UserResetRequest(BaseModel):
    user_id: str = "user_88"
    amount: float = 500.00

# ==============================================================================
# CHARGING NODE SCHEMAS
# ==============================================================================

class NodeOut(BaseModel):
    id: str
    name: str
    host_name: str
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rate_per_kwh: float
    base_rate_per_kwh: Optional[float] = None
    effective_rate_per_kwh: Optional[float] = None
    grid_availability: Optional[str] = "NORMAL"
    power_source: Optional[str] = "HYBRID"
    tariff_multiplier: Optional[float] = 1.0
    tariff_reason: Optional[str] = "Standard Grid Availability"
    badge_color: Optional[str] = "blue"
    max_power_kw: float
    host_wallet_balance: float
    is_active: bool
    firmware_version: str

class GridStatusUpdateRequest(BaseModel):
    grid_availability: str = Field(..., description="Power availability: SURPLUS, NORMAL, STRAINED, or BATTERY")
    power_source: Optional[str] = Field(default="HYBRID", description="SOLAR, GRID, BATTERY, or HYBRID")
    base_rate_per_kwh: Optional[float] = Field(default=None, gt=0, description="Base tariff per kWh in INR")
    voltage_v: Optional[float] = Field(default=None, description="Local grid voltage reading in Volts")
    grid_frequency_hz: Optional[float] = Field(default=None, description="Grid AC frequency in Hz")

class DynamicTariffResponse(BaseModel):
    node_id: str
    node_name: str
    base_rate_per_kwh: float
    effective_rate_per_kwh: float
    grid_availability: str
    power_source: str
    tariff_multiplier: float
    tariff_reason: str
    badge_color: str
    voltage_reading: Optional[float] = None

class NodeRegisterRequest(BaseModel):
    id: str = Field(..., description="Unique Bluetooth node identifier, e.g. RelayEV-Node-05")
    name: str = Field(..., description="Community-friendly display name, e.g. Verma House Charging")
    host_name: str = Field(..., description="Host owner name, e.g. Suresh Verma")
    host_user_id: Optional[str] = Field(default="host_mohan", description="User ID receiving host earnings")
    location: str = Field(..., description="Address or milestone, e.g. East Village Well Road")
    latitude: Optional[float] = 28.6140
    longitude: Optional[float] = 77.2090
    rate_per_kwh: float = Field(..., gt=0, description="Tariff charged per kWh in INR")
    max_power_kw: float = Field(default=3.3, gt=0, description="Max power rating in kW")
    hardware_secret: Optional[str] = Field(default="relay_ev_hardware_master_secret_2026", description="Node HMAC secret")

class NodePayoutRequest(BaseModel):
    node_id: str
    amount: float = Field(..., gt=0, description="Amount in INR to withdraw from host earnings")
    payout_vpa: str = Field(default="host@upi", description="Host UPI VPA for settlement")

class NodePayoutResponse(BaseModel):
    node_id: str
    payout_amount: float
    remaining_balance: float
    payout_vpa: str
    reference_id: str
    message: str

# ==============================================================================
# CRYPTOGRAPHIC ESCROW SESSIONS
# ==============================================================================

class ChargeStartRequest(BaseModel):
    user_id: str = Field(default="user_88", description="Driver user identifier")
    node_id: str = Field(..., description="Target ESP32 Charging Node ID, e.g. RelayEV-Node-01")
    escrow_amount: float = Field(..., gt=0, le=1000, description="Escrow amount in INR to lock, e.g. 100.0")

class ChargeStartResponse(BaseModel):
    session_id: str
    user_id: str
    node_id: str
    node_name: str
    escrow_amount: float
    rate_per_kwh: float
    base_rate_per_kwh: Optional[float] = None
    effective_rate_per_kwh: Optional[float] = None
    grid_availability: Optional[str] = "NORMAL"
    tariff_multiplier: Optional[float] = 1.0
    tariff_reason: Optional[str] = "Standard Grid Tariff"
    max_energy_kwh: float
    session_token: str
    escrow_jwt_token: str
    user_remaining_balance: float
    issued_at: int
    expires_at: int
    # Aliases for frontend teammate compatibility
    tx_id: Optional[str] = None
    max_kwh: Optional[float] = None

class ReceiptData(BaseModel):
    session_id: str
    node_id: str
    user_id: str
    energy_consumed_kwh: float
    actual_cost: float
    timestamp: int
    nonce: str
    node_signature: str

class ChargeStopRequest(BaseModel):
    session_id: str
    node_id: str
    user_id: str = "user_88"
    energy_consumed_kwh: float
    actual_cost: float
    node_signature: str
    timestamp: Optional[int] = None
    nonce: Optional[str] = None
    is_mule_sync: bool = False
    mule_user_id: Optional[str] = None

class ChargeStopResponse(BaseModel):
    session_id: str
    status: str
    escrow_amount: float
    actual_cost: float
    refund_amount: float
    energy_consumed_kwh: float
    user_new_balance: float
    host_earnings: float
    signature_verified: bool
    synced_via: str  # "DIRECT_PHONE" or "DRIVE_BY_DATA_MULE"
    message: str

class ChargeCancelRequest(BaseModel):
    session_id: str
    user_id: str = "user_88"
    reason: Optional[str] = "Driver aborted before BLE connection"

class ChargeCancelResponse(BaseModel):
    session_id: str
    status: str
    refunded_escrow: float
    user_new_balance: float
    message: str

# ==============================================================================
# DRIVE-BY DATA MULE MESH SYNC
# ==============================================================================

class MuleSyncRequest(BaseModel):
    mule_user_id: str = Field(default="user_99_mule", description="The ID of the passing phone carrying stranded receipts")
    receipts: List[ReceiptData] = Field(..., min_length=1, description="List of offline signed charging receipts")

class MuleSyncDetail(BaseModel):
    session_id: str
    node_id: str
    status: str
    energy_consumed_kwh: float
    actual_cost: float
    refund_amount: float
    signature_verified: bool
    duplicate: bool
    error: Optional[str] = None

class MuleSyncResponse(BaseModel):
    mule_user_id: str
    synced_count: int
    duplicate_count: int
    mule_reward_inr: float
    mule_new_balance: float
    details: List[MuleSyncDetail]
    message: str

# ==============================================================================
# TRANSACTION HISTORY & AUDIT LOGS
# ==============================================================================

class TransactionOut(BaseModel):
    id: str
    session_id: str
    user_id: str
    node_id: str
    escrow_amount: float
    rate_per_kwh: float
    max_energy_kwh: float
    energy_consumed_kwh: float
    actual_cost: float
    refund_amount: float
    status: str
    node_signature: Optional[str] = None
    mule_user_id: Optional[str] = None
    mule_reward_inr: float
    created_at: str
    expires_at: str
    settled_at: Optional[str] = None

class WalletAuditLogOut(BaseModel):
    id: str
    user_id: str
    change_type: str
    amount: float
    balance_after: float
    reference_id: str
    timestamp: str

class HealthCheckResponse(BaseModel):
    status: str
    service: str
    version: str
    database_connected: bool
    active_nodes_count: int
    total_transactions_count: int
    timestamp: str

# ==============================================================================
# PERSON 2: BACKEND & SUPABASE CLOUD LEAD SCHEMAS
# ==============================================================================

class EscrowSweeperResponse(BaseModel):
    swept_count: int
    total_refunded_inr: float
    swept_sessions: List[str]
    message: str

class ReceiptAuditRequest(BaseModel):
    session_id: str
    node_id: Optional[str] = None
    energy_consumed_kwh: Optional[float] = None
    actual_cost: Optional[float] = None
    node_signature: Optional[str] = None
    nonce: Optional[str] = None
    timestamp: Optional[int] = None

class ReceiptAuditResponse(BaseModel):
    session_id: str
    node_id: str
    is_authentic: bool
    is_valid_metering: bool
    is_replay_safe: bool
    clock_skew_seconds: Optional[int] = None
    audit_verdict: str  # e.g., "VERIFIED_AUTHENTIC", "TAMPERED_ENERGY_CALCULATION", "INVALID_SIGNATURE", "REPLAY_ATTACK_DETECTED"
    details: Dict[str, Any]

class MeshAnalyticsOverview(BaseModel):
    total_kwh_delivered: float
    total_gmv_inr: float
    total_host_payouts_inr: float
    total_mule_bounties_inr: float
    active_nodes_count: int
    total_transactions_count: int
    settled_transactions_count: int
    expired_transactions_count: int
    cancelled_transactions_count: int
    active_escrows_count: int
    avg_kwh_per_session: float
    avg_cost_per_session: float

class NodeAnalyticsResponse(BaseModel):
    node_id: str
    node_name: str
    host_name: str
    location: str
    rate_per_kwh: float
    host_wallet_balance: float
    total_sessions: int
    settled_sessions: int
    total_kwh_delivered: float
    total_revenue_inr: float
    is_active: bool
    uptime_status: str

class SupabaseWebhookPayload(BaseModel):
    type: str = Field(..., description="Event operation: INSERT, UPDATE, or DELETE")
    table: str = Field(..., description="Target database table")
    record: Dict[str, Any] = Field(..., description="The record data inserted or updated")
    old_record: Optional[Dict[str, Any]] = None
    schema_name: Optional[str] = Field(default="public", alias="schema")

class SupabaseWebhookResponse(BaseModel):
    status: str
    action_taken: str
    record_id: Optional[str] = None
    message: str

class SupabaseHealthResponse(BaseModel):
    is_configured: bool
    supabase_url: Optional[str] = None
    connection_status: str
    features: List[str]
    message: str

