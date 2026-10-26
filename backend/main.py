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
    HealthCheckResponse
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

    return ChargeStartResponse(
        session_id=session_id,
        user_id=request.user_id,
        node_id=node["id"],
        node_name=node["name"],
        escrow_amount=request.escrow_amount,
        rate_per_kwh=rate_per_kwh,
        max_energy_kwh=max_energy_kwh,
        session_token=jwt_token,
        escrow_jwt_token=jwt_token,
        user_remaining_balance=new_balance,
        issued_at=issued_at,
        expires_at=expires_at
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
