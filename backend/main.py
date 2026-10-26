import json
import time
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, status, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database import DatabaseManager, init_database
from supabase_client import supabase_client
from security import (
    create_escrow_jwt,
    decode_and_verify_escrow_jwt,
    compute_node_hmac,
    verify_node_receipt_signature,
    verify_metering_integrity
)
from schemas import (
    UserOut,
    UserTopupRequest,
    UserTopupResponse,
    UserResetRequest,
    NodeOut,
    NodeRegisterRequest,
    NodePayoutRequest,
    NodePayoutResponse,
    GridStatusUpdateRequest,
    DynamicTariffResponse,
    ChargeStartRequest,
    ChargeStartResponse,
    ChargeStopRequest,
    ChargeStopResponse,
    ChargeCancelRequest,
    ChargeCancelResponse,
    MuleSyncRequest,
    MuleSyncResponse,
    MuleSyncDetail,
    TransactionOut,
    WalletAuditLogOut,
    HealthCheckResponse,
    EscrowSweeperResponse,
    ReceiptAuditRequest,
    ReceiptAuditResponse,
    MeshAnalyticsOverview,
    NodeAnalyticsResponse,
    SupabaseWebhookPayload,
    SupabaseWebhookResponse,
    SupabaseHealthResponse
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database schema is ready
    init_database()
    print(f"[RelayEV] Backend Engine started successfully. Version {settings.VERSION}")
    yield
    print("[RelayEV] Backend Engine shutting down.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Offline-First Rural EV Charging Mesh Backend with Cryptographic Escrow & Drive-By Data Mules",
    lifespan=lifespan
)

# Enable CORS for Next.js and frontend dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# SYSTEM & HEALTH ENDPOINTS
# ==============================================================================

@app.get("/", tags=["System"])
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "architecture": "Zero-OPEX Offline-First EV Charging Mesh",
        "cryptography": "HMAC-SHA256 & JWT Escrow",
        "data_mules": "Drive-By Mesh Synchronization Enabled",
        "dummy_user": "user_88",
        "docs_url": "/docs",
        "redoc_url": "/redoc"
    }

@app.get("/health", response_model=HealthCheckResponse, tags=["System"])
@app.get("/api/health", response_model=HealthCheckResponse, tags=["System"])
def health_check():
    stats = DatabaseManager.get_system_stats()
    return HealthCheckResponse(
        status="healthy",
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        database_connected=True,
        active_nodes_count=stats["active_nodes_count"],
        total_transactions_count=stats["total_transactions_count"],
        timestamp=datetime.now(timezone.utc).isoformat()
    )

# ==============================================================================
# USER & DRIVER WALLET ROUTER
# ==============================================================================

@app.get("/api/user/me", response_model=UserOut, tags=["Driver Wallet"])
def get_user_profile(user_id: str = Query(default="user_88", description="Driver user ID")):
    user = DatabaseManager.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found.")
    return user

@app.post("/api/user/topup", response_model=UserTopupResponse, tags=["Driver Wallet"])
def topup_user_wallet(request: UserTopupRequest):
    user = DatabaseManager.get_user(request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {request.user_id} not found.")

    prev_balance = user["wallet_balance"]
    new_balance = round(prev_balance + request.amount, 2)
    ref_id = f"TOPUP-{uuid.uuid4().hex[:8].upper()}"

    DatabaseManager.update_user_balance(
        user_id=request.user_id,
        new_balance=new_balance,
        change_type="WALLET_TOPUP",
        reference_id=ref_id
    )

    return UserTopupResponse(
        user_id=request.user_id,
        amount_added=request.amount,
        previous_balance=prev_balance,
        new_balance=new_balance,
        reference_id=ref_id,
        message=f"Successfully topped up ₹{request.amount:.2f} via {request.payment_method}."
    )

@app.get("/api/user/transactions", response_model=List[TransactionOut], tags=["Driver Wallet"])
def get_user_transactions(user_id: str = Query(default="user_88"), limit: int = Query(default=20, le=100)):
    return DatabaseManager.get_user_transactions(user_id, limit)

@app.get("/api/user/sessions/active", tags=["Driver Wallet"])
def get_active_session(user_id: str = Query(default="user_88")):
    active = DatabaseManager.get_active_session_for_user(user_id)
    if not active:
        return {"has_active_session": False, "session": None}
    return {"has_active_session": True, "session": active}

@app.get("/api/user/ledger", response_model=List[WalletAuditLogOut], tags=["Driver Wallet"])
def get_user_ledger(user_id: str = Query(default="user_88"), limit: int = Query(default=20)):
    return DatabaseManager.get_wallet_audit_logs(user_id, limit)

@app.post("/api/user/reset_balance", tags=["Driver Wallet"])
def reset_user_balance(request: Optional[UserResetRequest] = None):
    uid = request.user_id if request else "user_88"
    amt = request.amount if request else 500.00
    DatabaseManager.update_user_balance(uid, amt, "BALANCE_RESET", "ADMIN_RESET")
    return {"message": "Wallet balance reset", "user_id": uid, "wallet_balance": amt}

# ==============================================================================
# CHARGING NODES ROUTER
# ==============================================================================

@app.get("/api/nodes", response_model=List[NodeOut], tags=["Charging Nodes"])
def list_charging_nodes():
    return DatabaseManager.get_nodes()

@app.get("/api/nodes/{node_id}", response_model=NodeOut, tags=["Charging Nodes"])
def get_node_details(node_id: str):
    node = DatabaseManager.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found.")
    return node

@app.post("/api/nodes/register", response_model=NodeOut, tags=["Charging Nodes"])
def register_node(request: NodeRegisterRequest):
    existing = DatabaseManager.get_node(request.id)
    if existing and existing["id"] == request.id:
        raise HTTPException(status_code=400, detail=f"Node ID {request.id} is already registered.")

    new_node = DatabaseManager.register_node(
        node_id=request.id,
        name=request.name,
        host_name=request.host_name,
        location=request.location,
        rate_per_kwh=request.rate_per_kwh,
        max_power_kw=request.max_power_kw,
        latitude=request.latitude or 28.6140,
        longitude=request.longitude or 77.2090,
        hardware_secret=request.hardware_secret or settings.NODE_SIGNATURE_KEY,
        host_user_id=request.host_user_id
    )
    return new_node


# ==============================================================================
# DYNAMIC GRID-AWARE TARIFF PRICING ENGINE
# ==============================================================================

@app.get("/api/nodes/{node_id}/tariff", response_model=DynamicTariffResponse, tags=["Dynamic Grid Tariffs"])
def get_node_dynamic_tariff(node_id: str):
    """
    Returns the real-time grid-aware dynamic tariff calculation for a station based on
    local power availability (Surplus Solar, Standard Grid, Peak Congestion, or Inverter Backup).
    """
    node = DatabaseManager.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found.")
    return DynamicTariffResponse(
        node_id=node["id"],
        node_name=node["name"],
        base_rate_per_kwh=node.get("base_rate_per_kwh", node["rate_per_kwh"]),
        effective_rate_per_kwh=node["rate_per_kwh"],
        grid_availability=node.get("grid_availability", "NORMAL"),
        power_source=node.get("power_source", "HYBRID"),
        tariff_multiplier=node.get("tariff_multiplier", 1.0),
        tariff_reason=node.get("tariff_reason", "Standard Grid Availability"),
        badge_color=node.get("badge_color", "blue")
    )

@app.post("/api/nodes/{node_id}/grid-status", response_model=NodeOut, tags=["Dynamic Grid Tariffs"])
def update_node_grid_status(node_id: str, request: GridStatusUpdateRequest):
    """
    Updates the live power availability status for a charging location.
    Simulates automated telemetry from ESP32 grid sensors or local utility signals:
    - SURPLUS: 20% discount on base tariff (green solar excess)
    - NORMAL: 1.00x baseline
    - STRAINED: 35% peak demand surge
    - BATTERY: 20% inverter backup surcharge
    """
    updated_node = DatabaseManager.update_node_grid_status(
        node_id=node_id,
        grid_availability=request.grid_availability,
        power_source=request.power_source,
        base_rate_per_kwh=request.base_rate_per_kwh
    )
    if not updated_node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found.")
    return updated_node

@app.post("/api/nodes/{node_id}/payout", response_model=NodePayoutResponse, tags=["Charging Nodes"])
def host_node_payout(node_id: str, request: NodePayoutRequest):
    success, rem_bal, msg = DatabaseManager.payout_host_wallet(node_id, request.amount)
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    ref_id = f"PAYOUT-{uuid.uuid4().hex[:8].upper()}"
    return NodePayoutResponse(
        node_id=node_id,
        payout_amount=request.amount,
        remaining_balance=rem_bal,
        payout_vpa=request.payout_vpa,
        reference_id=ref_id,
        message=f"Payout of ₹{request.amount:.2f} dispatched to {request.payout_vpa}."
    )

# ==============================================================================
# CRYPTOGRAPHIC ESCROW ENGINE
# ==============================================================================

@app.post("/api/charge/start", response_model=ChargeStartResponse, tags=["Escrow Engine"])
def start_charging_session(request: ChargeStartRequest):
    """
    Step 1: Financial Escrow Engine
    1. Checks user wallet balance.
    2. Locks escrow_amount atomically in wallet.
    3. Issues cryptographically signed JWT session_token for WebBLE transmission to offline ESP32.
    """
    user = DatabaseManager.get_user(request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {request.user_id} not found.")

    if user["wallet_balance"] < request.escrow_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient wallet balance (₹{user['wallet_balance']:.2f}). Please top up to lock ₹{request.escrow_amount:.2f}."
        )

    node = DatabaseManager.get_node(request.node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Charging node {request.node_id} not found.")

    rate_per_kwh = node["rate_per_kwh"]
    max_energy_kwh = round(request.escrow_amount / rate_per_kwh, 3)

    # 1. Deduct escrow from driver balance
    new_balance = round(user["wallet_balance"] - request.escrow_amount, 2)
    session_id = f"REV-{uuid.uuid4().hex[:10].upper()}"
    DatabaseManager.update_user_balance(
        user_id=request.user_id,
        new_balance=new_balance,
        change_type="ESCROW_LOCK",
        reference_id=session_id
    )

    # 2. Issue Signed JWT Escrow Token
    nonce = uuid.uuid4().hex[:8]
    jwt_token, issued_at, expires_at = create_escrow_jwt(
        user_id=request.user_id,
        node_id=node["id"],
        session_id=session_id,
        escrow_amount=request.escrow_amount,
        rate_per_kwh=rate_per_kwh,
        max_energy_kwh=max_energy_kwh,
        nonce=nonce
    )

    # 3. Store Transaction in database
    DatabaseManager.create_transaction(
        session_id=session_id,
        user_id=request.user_id,
        node_id=node["id"],
        escrow_amount=request.escrow_amount,
        rate_per_kwh=rate_per_kwh,
        max_energy_kwh=max_energy_kwh,
        escrow_token=jwt_token,
        expires_at_epoch=expires_at
    )

    base_rate = node.get("base_rate_per_kwh", rate_per_kwh)
    grid_avail = node.get("grid_availability", "NORMAL")
    multiplier = node.get("tariff_multiplier", 1.0)
    reason = node.get("tariff_reason", "Standard Grid Tariff")

    return ChargeStartResponse(
        session_id=session_id,
        user_id=request.user_id,
        node_id=node["id"],
        node_name=node["name"],
        escrow_amount=request.escrow_amount,
        rate_per_kwh=rate_per_kwh,
        base_rate_per_kwh=base_rate,
        effective_rate_per_kwh=rate_per_kwh,
        grid_availability=grid_avail,
        tariff_multiplier=multiplier,
        tariff_reason=reason,
        max_energy_kwh=max_energy_kwh,
        session_token=jwt_token,
        escrow_jwt_token=jwt_token,
        user_remaining_balance=new_balance,
        issued_at=issued_at,
        expires_at=expires_at,
        tx_id=session_id,
        max_kwh=max_energy_kwh
    )

@app.post("/api/charge/stop", response_model=ChargeStopResponse, tags=["Escrow Engine"])
@app.post("/api/charge/settle", response_model=ChargeStopResponse, tags=["Escrow Engine"])
def stop_charging_session(request: ChargeStopRequest):
    """
    Step 2: Settlement Engine
    1. Replay Attack Prevention: Validates and consumes the nonce atomically.
    2. Verifies HMAC-SHA256 signature produced by ESP32 PZEM-004T.
    3. Computes actual cost = energy_kwh * rate (capped at escrow_amount).
    4. Calculates refund = escrow_amount - actual_cost.
    5. Credits refund back to driver wallet, and actual_cost to host node.
    """
    tx = DatabaseManager.get_transaction(request.session_id)
    if not tx:
        # Fallback: create ad-hoc transaction record if session was initialized completely offline
        escrow_est = max(request.actual_cost + 15.80, request.actual_cost)
        node = DatabaseManager.get_node(request.node_id)
        rate = node["rate_per_kwh"] if node else 10.0
        DatabaseManager.create_transaction(
            session_id=request.session_id,
            user_id=request.user_id,
            node_id=request.node_id,
            escrow_amount=escrow_est,
            rate_per_kwh=rate,
            max_energy_kwh=round(escrow_est / rate, 3),
            escrow_token="offline_created",
            expires_at_epoch=int(time.time()) + 7200
        )
        tx = DatabaseManager.get_transaction(request.session_id)

    # Idempotent return if already settled
    if tx and tx["status"] in ["SETTLED", "MULE_SYNCED"]:
        user = DatabaseManager.get_user(request.user_id)
        return ChargeStopResponse(
            session_id=request.session_id,
            status=tx["status"],
            escrow_amount=tx["escrow_amount"],
            actual_cost=tx["actual_cost"],
            refund_amount=tx["refund_amount"],
            energy_consumed_kwh=tx["energy_consumed_kwh"],
            user_new_balance=user["wallet_balance"] if user else 500.0,
            host_earnings=tx["actual_cost"],
            signature_verified=True,
            synced_via="DIRECT_PHONE" if not tx.get("mule_user_id") else "DRIVE_BY_DATA_MULE",
            message="Session was already settled."
        )

    # 1. Nonce Anti-Replay Check
    if request.nonce:
        is_fresh_nonce = DatabaseManager.consume_nonce(request.nonce, request.session_id)
        if not is_fresh_nonce:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Replay attack detected: Nonce {request.nonce} has already been processed."
            )

    # 2. Cryptographic Signature Verification
    node = DatabaseManager.get_node(request.node_id)
    secret_key = node["hardware_secret"] if node else settings.NODE_SIGNATURE_KEY
    is_valid, is_authentic = verify_node_receipt_signature(
        session_id=request.session_id,
        energy_kwh=request.energy_consumed_kwh,
        cost=request.actual_cost,
        signature=request.node_signature,
        secret_key=secret_key
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cryptographic receipt signature verification failed. Possible payload tampering."
        )

    # 3. Financial Calculation
    escrow_amount = tx["escrow_amount"] if tx else request.actual_cost
    actual_cost = round(min(request.actual_cost, escrow_amount), 2)
    refund_amount = round(max(0.0, escrow_amount - actual_cost), 2)

    # 4. Credit refund to driver wallet
    user = DatabaseManager.get_user(request.user_id)
    current_balance = user["wallet_balance"] if user else 500.0
    new_user_balance = round(current_balance + refund_amount, 2)
    DatabaseManager.update_user_balance(
        user_id=request.user_id,
        new_balance=new_user_balance,
        change_type="ESCROW_REFUND",
        reference_id=request.session_id
    )

    # 5. Credit actual cost to host node
    DatabaseManager.credit_host_wallet(request.node_id, actual_cost, request.session_id)

    # 6. Settle transaction record
    receipt_json = json.dumps(request.model_dump())
    synced_via = "DRIVE_BY_DATA_MULE" if request.is_mule_sync else "DIRECT_PHONE"
    DatabaseManager.settle_transaction(
        session_id=request.session_id,
        energy_kwh=request.energy_consumed_kwh,
        actual_cost=actual_cost,
        refund_amount=refund_amount,
        signed_receipt_json=receipt_json,
        node_signature=request.node_signature,
        nonce=request.nonce,
        mule_user_id=request.mule_user_id if request.is_mule_sync else None
    )

    return ChargeStopResponse(
        session_id=request.session_id,
        status="SETTLED",
        escrow_amount=escrow_amount,
        actual_cost=actual_cost,
        refund_amount=refund_amount,
        energy_consumed_kwh=request.energy_consumed_kwh,
        user_new_balance=new_user_balance,
        host_earnings=actual_cost,
        signature_verified=is_valid,
        synced_via=synced_via,
        message=f"Session settled successfully via {synced_via}. Refund of ₹{refund_amount:.2f} credited to wallet."
    )

@app.post("/api/charge/cancel", response_model=ChargeCancelResponse, tags=["Escrow Engine"])
def cancel_charging_session(request: ChargeCancelRequest):
    """
    Aborts an unredeemed session (e.g. driver was unable to pair with BLE node or canceled before connecting).
    Releases 100% of escrow back to driver wallet.
    """
    tx = DatabaseManager.get_transaction(request.session_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Session not found.")

    if tx["status"] != "ESCROW_LOCKED":
        raise HTTPException(status_code=400, detail=f"Cannot cancel session with status {tx['status']}.")

    # Full refund
    refund_amt = tx["escrow_amount"]
    user = DatabaseManager.get_user(request.user_id)
    new_balance = round(user["wallet_balance"] + refund_amt, 2)
    DatabaseManager.update_user_balance(
        user_id=request.user_id,
        new_balance=new_balance,
        change_type="ESCROW_CANCEL",
        reference_id=request.session_id
    )

    DatabaseManager.cancel_transaction(request.session_id)

    return ChargeCancelResponse(
        session_id=request.session_id,
        status="CANCELLED",
        refunded_escrow=refund_amt,
        user_new_balance=new_balance,
        message=f"Session canceled. Full escrow of ₹{refund_amt:.2f} restored to driver wallet."
    )

@app.get("/api/charge/session/{session_id}", response_model=TransactionOut, tags=["Escrow Engine"])
def get_session_status(session_id: str):
    tx = DatabaseManager.get_transaction(session_id)
    if not tx:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return tx

# ==============================================================================
# DRIVE-BY DATA MULE MESH SYNC
# ==============================================================================

@app.post("/api/sync/mule", response_model=MuleSyncResponse, tags=["Drive-By Data Mule"])
def sync_data_mule_receipts(request: MuleSyncRequest):
    """
    Drive-By Data Mule Mesh Sync
    The passing smartphone delivers offline receipts stranded on ESP32 flash memory.
    Rewards the data mule with micro-incentives (e.g. ₹2.00 per synced receipt).
    """
    mule_user = DatabaseManager.get_user(request.mule_user_id)
    if not mule_user:
        # Register mule user if not found
        mule_user = DatabaseManager.create_user(
            user_id=request.mule_user_id,
            name="Community Data Mule",
            phone="+91-9800000000",
            role="mule",
            initial_balance=0.0
        )

    details: List[MuleSyncDetail] = []
    synced_count = 0
    duplicate_count = 0

    for receipt in request.receipts:
        # Check if already settled
        existing_tx = DatabaseManager.get_transaction(receipt.session_id)
        if existing_tx and existing_tx["status"] in ["SETTLED", "MULE_SYNCED"]:
            duplicate_count += 1
            details.append(MuleSyncDetail(
                session_id=receipt.session_id,
                node_id=receipt.node_id,
                status=existing_tx["status"],
                energy_consumed_kwh=existing_tx["energy_consumed_kwh"],
                actual_cost=existing_tx["actual_cost"],
                refund_amount=existing_tx["refund_amount"],
                signature_verified=True,
                duplicate=True,
                error=None
            ))
            continue

        try:
            stop_req = ChargeStopRequest(
                session_id=receipt.session_id,
                node_id=receipt.node_id,
                user_id=receipt.user_id,
                energy_consumed_kwh=receipt.energy_consumed_kwh,
                actual_cost=receipt.actual_cost,
                node_signature=receipt.node_signature,
                timestamp=receipt.timestamp,
                nonce=receipt.nonce,
                is_mule_sync=True,
                mule_user_id=request.mule_user_id
            )
            res = stop_charging_session(stop_req)
            synced_count += 1
            details.append(MuleSyncDetail(
                session_id=receipt.session_id,
                node_id=receipt.node_id,
                status=res.status,
                energy_consumed_kwh=res.energy_consumed_kwh,
                actual_cost=res.actual_cost,
                refund_amount=res.refund_amount,
                signature_verified=res.signature_verified,
                duplicate=False,
                error=None
            ))
        except Exception as e:
            details.append(MuleSyncDetail(
                session_id=receipt.session_id,
                node_id=receipt.node_id,
                status="FAILED",
                energy_consumed_kwh=receipt.energy_consumed_kwh,
                actual_cost=receipt.actual_cost,
                refund_amount=0.0,
                signature_verified=False,
                duplicate=False,
                error=str(e)
            ))

    # Reward the data mule
    total_reward = round(synced_count * settings.MULE_REWARD_PER_RECEIPT, 2)
    mule_user_fresh = DatabaseManager.get_user(request.mule_user_id)
    current_mule_bal = mule_user_fresh["wallet_balance"] if mule_user_fresh else 0.0
    new_mule_bal = round(current_mule_bal + total_reward, 2)

    if total_reward > 0:
        ref_id = f"MULE-{uuid.uuid4().hex[:8].upper()}"
        DatabaseManager.update_user_balance(
            user_id=request.mule_user_id,
            new_balance=new_mule_bal,
            change_type="MULE_REWARD",
            reference_id=ref_id
        )

    return MuleSyncResponse(
        mule_user_id=request.mule_user_id,
        synced_count=synced_count,
        duplicate_count=duplicate_count,
        mule_reward_inr=total_reward,
        mule_new_balance=new_mule_bal,
        details=details,
        message=f"Synced {synced_count} offline receipts ({duplicate_count} duplicates skipped). Data Mule rewarded ₹{total_reward:.2f}!"
    )

# ==============================================================================
# AUDIT & ADMIN
# ==============================================================================

@app.get("/api/transactions", response_model=List[TransactionOut], tags=["Audit & Admin"])
def list_all_transactions(limit: int = Query(default=100, le=500)):
    return DatabaseManager.get_all_transactions(limit)

# ==============================================================================
# PERSON 2: BACKEND & SUPABASE CLOUD LEAD ENDPOINTS
# ==============================================================================

@app.get("/api/cloud/supabase/status", response_model=SupabaseHealthResponse, tags=["Supabase Cloud Lead"])
def get_supabase_cloud_status():
    """
    Returns the live status of the Supabase Cloud REST and PostgREST connection,
    indicating active features, dual-mode syncing status, and fallback state.
    """
    status_info = supabase_client.get_status()
    return SupabaseHealthResponse(
        is_configured=status_info["is_configured"],
        supabase_url=status_info.get("supabase_url"),
        connection_status=status_info["connection_status"],
        features=status_info["features"],
        message=status_info["message"]
    )

@app.post("/api/charge/expire-sweeper", response_model=EscrowSweeperResponse, tags=["Supabase Cloud Lead"])
def sweep_expired_charging_escrows():
    """
    Automated Escrow Expiry Sweeper
    Scans for expired sessions in 'ESCROW_LOCKED' state that were never redeemed or settled.
    Marks them as 'EXPIRED', releases 100% of escrow back to driver wallets, and records
    immutable double-entry audit ledger entries.
    """
    swept_count, total_refunded, swept_sessions = DatabaseManager.sweep_expired_escrows()
    msg = f"Swept {swept_count} expired escrow sessions. Released ₹{total_refunded:.2f} back to driver wallets."
    return EscrowSweeperResponse(
        swept_count=swept_count,
        total_refunded_inr=total_refunded,
        swept_sessions=swept_sessions,
        message=msg
    )

@app.post("/api/charge/verify-receipt", response_model=ReceiptAuditResponse, tags=["Supabase Cloud Lead"])
@app.get("/api/charge/audit/{session_id}", response_model=ReceiptAuditResponse, tags=["Supabase Cloud Lead"])
def audit_charge_receipt(
    session_id: Optional[str] = None,
    audit_req: Optional[ReceiptAuditRequest] = None
):
    """
    Cryptographic Receipt Verification & Dispute Resolution Engine
    Performs comprehensive cryptographic audit of PZEM-004T energy receipts:
    1. Bit-for-bit HMAC-SHA256 signature verification against node hardware secret.
    2. Energy consumption vs tariff mathematical consistency check.
    3. Replay attack and nonce reuse verification.
    4. Clock skew evaluation within acceptable drift tolerance.
    """
    sid = audit_req.session_id if audit_req else session_id
    if not sid:
        raise HTTPException(status_code=400, detail="session_id must be provided.")

    tx = DatabaseManager.get_transaction(sid)
    
    # Resolve node, energy, cost, signature, and nonce from request or database
    node_id = (audit_req.node_id if audit_req and audit_req.node_id else None) or (tx["node_id"] if tx else "RelayEV-Node-01")
    energy_kwh = (audit_req.energy_consumed_kwh if audit_req and audit_req.energy_consumed_kwh is not None else None) or (tx["energy_consumed_kwh"] if tx else 0.0)
    cost = (audit_req.actual_cost if audit_req and audit_req.actual_cost is not None else None) or (tx["actual_cost"] if tx else 0.0)
    signature = (audit_req.node_signature if audit_req and audit_req.node_signature else None) or (tx["node_signature"] if tx and tx.get("node_signature") else "")
    nonce = (audit_req.nonce if audit_req and audit_req.nonce else None) or (tx["nonce"] if tx and tx.get("nonce") else None)
    ts = (audit_req.timestamp if audit_req and audit_req.timestamp else None)

    node = DatabaseManager.get_node(node_id)
    secret_key = node["hardware_secret"] if node else settings.NODE_SIGNATURE_KEY
    rate_per_kwh = node["rate_per_kwh"] if node else 10.0

    # 1. Signature check
    is_valid_sig, is_auth = verify_node_receipt_signature(
        session_id=sid,
        energy_kwh=energy_kwh,
        cost=cost,
        signature=signature,
        secret_key=secret_key
    )

    # 2. Metering integrity check
    is_valid_metering = verify_metering_integrity(energy_kwh, rate_per_kwh, cost)

    # 3. Nonce check
    conn = DatabaseManager.get_connection()
    nonce_row = conn.execute("SELECT * FROM nonces WHERE nonce = ?", (nonce,)).fetchone() if nonce else None
    conn.close()
    is_replay_safe = (nonce_row is None) or (nonce_row["session_id"] == sid)

    # 4. Clock skew check
    clock_skew = None
    is_clock_ok = True
    if ts:
        clock_skew = int(abs(time.time() - ts))
        if clock_skew > settings.MAX_CLOCK_SKEW_SECONDS:
            is_clock_ok = False

    # Determine Verdict
    if not is_valid_sig:
        verdict = "INVALID_HARDWARE_SIGNATURE"
    elif not is_valid_metering:
        verdict = "TAMPERED_ENERGY_CALCULATION"
    elif not is_replay_safe:
        verdict = "REPLAY_ATTACK_DETECTED"
    elif not is_clock_ok:
        verdict = "EXCESSIVE_CLOCK_SKEW"
    else:
        verdict = "VERIFIED_AUTHENTIC"

    return ReceiptAuditResponse(
        session_id=sid,
        node_id=node_id,
        is_authentic=is_valid_sig,
        is_valid_metering=is_valid_metering,
        is_replay_safe=is_replay_safe,
        clock_skew_seconds=clock_skew,
        audit_verdict=verdict,
        details={
            "rate_per_kwh": rate_per_kwh,
            "calculated_expected_cost": round(energy_kwh * rate_per_kwh, 2),
            "reported_actual_cost": cost,
            "signature_provided": signature[:16] + "..." if signature else "NONE",
            "transaction_status": tx["status"] if tx else "UNKNOWN_OR_UNRECORDED"
        }
    )

@app.get("/api/analytics/overview", response_model=MeshAnalyticsOverview, tags=["Supabase Cloud Lead"])
def get_mesh_analytics_overview():
    """
    Cloud Telemetry & Business Analytics
    Aggregates mesh-wide Gross Merchandise Value (GMV), total kWh delivered,
    active nodes ratio, host earnings, and mule micro-incentive bounties.
    """
    stats = DatabaseManager.get_mesh_analytics()
    return MeshAnalyticsOverview(**stats)

@app.get("/api/analytics/node/{node_id}", response_model=NodeAnalyticsResponse, tags=["Supabase Cloud Lead"])
def get_single_node_analytics(node_id: str):
    """
    Per-Node Telemetry & Revenue Breakdown
    Provides historical session count, total kWh dispensed, and host balance for a specific station.
    """
    node_stats = DatabaseManager.get_node_analytics(node_id)
    if not node_stats:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found.")
    return NodeAnalyticsResponse(**node_stats)

@app.post("/api/webhooks/supabase", response_model=SupabaseWebhookResponse, tags=["Supabase Cloud Lead"])
def handle_supabase_database_webhook(payload: SupabaseWebhookPayload):
    """
    Supabase Database Webhook Receiver
    Processes asynchronous event notifications from Supabase PostgreSQL (e.g. external top-ups,
    admin node additions, or payment gateway webhooks) and maintains local state integrity.
    """
    event_type = payload.type.upper()
    table = payload.table.lower()
    rec = payload.record

    action_msg = f"Processed {event_type} on {table}"
    record_id = rec.get("id") or rec.get("session_id") or rec.get("user_id")

    if table == "users" and event_type in ["INSERT", "UPDATE"]:
        if "wallet_balance" in rec and "id" in rec:
            user = DatabaseManager.get_user(rec["id"])
            if user:
                DatabaseManager.update_user_balance(
                    user_id=rec["id"],
                    new_balance=float(rec["wallet_balance"]),
                    change_type="SUPABASE_WEBHOOK_SYNC",
                    reference_id="WEBHOOK"
                )
                action_msg = f"Synchronized user {rec['id']} wallet balance to ₹{float(rec['wallet_balance']):.2f}"
            else:
                DatabaseManager.create_user(
                    user_id=rec["id"],
                    name=rec.get("name", "Supabase Synced User"),
                    phone=rec.get("phone", "+91-9000000000"),
                    role=rec.get("role", "driver"),
                    initial_balance=float(rec.get("wallet_balance", 500.0))
                )
                action_msg = f"Created new user {rec['id']} from Supabase webhook"

    elif table == "nodes" and event_type == "INSERT":
        if "id" in rec and "name" in rec:
            existing = DatabaseManager.get_node(rec["id"])
            if not existing or existing["id"] != rec["id"]:
                DatabaseManager.register_node(
                    node_id=rec["id"],
                    name=rec.get("name", "New Node"),
                    host_name=rec.get("host_name", "Host"),
                    location=rec.get("location", "Rural Hub"),
                    rate_per_kwh=float(rec.get("rate_per_kwh") or rec.get("tariff_per_kwh") or 10.0),
                    max_power_kw=float(rec.get("max_power_kw", 3.3)),
                    latitude=float(rec.get("latitude", 28.6140)),
                    longitude=float(rec.get("longitude", 77.2090)),
                    hardware_secret=rec.get("hardware_secret", settings.NODE_SIGNATURE_KEY),
                    host_user_id=rec.get("host_user_id")
                )
                action_msg = f"Registered new node {rec['id']} from Supabase webhook"

    return SupabaseWebhookResponse(
        status="SUCCESS",
        action_taken=action_msg,
        record_id=str(record_id) if record_id else None,
        message="Supabase webhook event consumed and state synchronized."
    )

