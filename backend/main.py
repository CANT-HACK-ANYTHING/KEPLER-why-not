import os
import json
import time
import uuid
import hmac
import hashlib
from typing import Dict, Any, List, Optional
import jwt

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "relayev_super_secret_offline_mesh_key_2026")

app = FastAPI(
    title="RelayEV Financial Escrow Engine",
    description="Offline-first rural EV charging mesh cloud settlement engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Local In-Memory Fallback Store (When Supabase is not configured)
# Allows zero-config offline testing of the complete cryptographic loop
# ============================================================
MOCK_USERS: Dict[str, Dict[str, Any]] = {
    "user_88": {
        "id": "user_88",
        "full_name": "Rural EV Driver (Test)",
        "wallet_balance": 1000.00,
        "locked_escrow_balance": 0.00
    }
}

MOCK_NODES: Dict[str, Dict[str, Any]] = {
    "node_esp32_01": {
        "id": "node_esp32_01",
        "name": "Dharwad Agri-Solar Hub",
        "latitude": 15.4589,
        "longitude": 75.0078,
        "tariff_per_kwh": 12.50,
        "max_power_kw": 3.30,
        "status": "available",
        "last_synced_at": "2026-10-26T10:00:00Z"
    },
    "node_esp32_02": {
        "id": "node_esp32_02",
        "name": "Alnavar Forest Station",
        "latitude": 15.4342,
        "longitude": 74.7351,
        "tariff_per_kwh": 14.00,
        "max_power_kw": 7.20,
        "status": "available",
        "last_synced_at": "2026-10-26T10:00:00Z"
    },
    "node_esp32_03": {
        "id": "node_esp32_03",
        "name": "Kalghatgi Village Cooperative",
        "latitude": 15.1783,
        "longitude": 74.9744,
        "tariff_per_kwh": 10.00,
        "max_power_kw": 3.30,
        "status": "available",
        "last_synced_at": "2026-10-26T10:00:00Z"
    }
}

MOCK_TRANSACTIONS: Dict[str, Dict[str, Any]] = {}


# ============================================================
# Pydantic Request & Response Models
# ============================================================
class ChargeStartRequest(BaseModel):
    user_id: str = "user_88"
    node_id: str
    escrow_amount: float = Field(..., gt=0.0, description="Amount in local currency to lock in escrow")


class ChargeStartResponse(BaseModel):
    success: bool
    tx_id: str
    node_id: str
    escrow_amount: float
    max_kwh: float
    session_token: str
    message: str


class OfflineReceipt(BaseModel):
    tx_id: str
    node_id: str
    kwh_delivered: float = Field(..., ge=0.0)
    timestamp_end: int


class ChargeStopRequest(BaseModel):
    tx_id: str
    offline_receipt: OfflineReceipt
    signature: str


# ============================================================
# Cryptographic Helpers
# ============================================================
def mint_offline_session_token(tx_id: str, user_id: str, node_id: str, max_kwh: float) -> str:
    """
    Mints a signed JWT authorization token for the offline ESP32 hardware.
    The ESP32 verifies this token to start the relay and enforce max_kwh cutoff.
    """
    now = int(time.time())
    payload = {
        "tx_id": tx_id,
        "user_id": user_id,
        "node_id": node_id,
        "max_kwh": max_kwh,
        "iat": now,
        "exp": now + 86400  # Valid for 24 hours
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_esp32_signature(receipt: OfflineReceipt, signature: str, secret: str) -> bool:
    """
    Verifies the HMAC-SHA256 signature produced by the offline ESP32.
    Ensures deterministic JSON serialization (sorted keys, compact delimiters)
    to match embedded C/C++ JSON emitters.
    """
    canonical_receipt_json = json.dumps(
        receipt.model_dump(),
        sort_keys=True,
        separators=(",", ":")
    )
    
    expected_hmac = hmac.new(
        secret.encode("utf-8"),
        canonical_receipt_json.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_hmac, signature)


# ============================================================
# API Endpoints
# ============================================================
@app.get("/health")
def health():
    engine_type = "Supabase PostgreSQL" if supabase else "Local In-Memory Engine (Dev Fallback)"
    return {"status": "ok", "service": "RelayEV Escrow Engine", "engine": engine_type}


@app.get("/api/nodes")
def list_nodes():
    """
    Returns list of rural charging nodes for the map display.
    """
    if supabase:
        res = supabase.table("nodes").select("*").execute()
        return {"nodes": res.data}
    return {"nodes": list(MOCK_NODES.values())}


@app.post("/api/charge/start", response_model=ChargeStartResponse)
def charge_start(payload: ChargeStartRequest):
    """
    Step 2B: Initiates a charging session.
    1. Verifies user balance & node availability.
    2. Atomically locks escrow_amount in DB.
    3. Mints a tamper-proof offline JWT session token.
    """
    # ----------------------------------------------------
    # Case A: Real Supabase Client Connected
    # ----------------------------------------------------
    if supabase:
        node_res = supabase.table("nodes").select("*").eq("id", payload.node_id).execute()
        if not node_res.data:
            raise HTTPException(status_code=404, detail=f"Node {payload.node_id} not found.")

        node = node_res.data[0]
        if node.get("status") != "available":
            raise HTTPException(
                status_code=400, 
                detail=f"Node {payload.node_id} is currently {node.get('status')} and not available."
            )

        tariff_per_kwh = float(node["tariff_per_kwh"])
        max_kwh = round(payload.escrow_amount / tariff_per_kwh, 2)

        try:
            rpc_res = supabase.rpc("lock_escrow_for_charge", {
                "p_user_id": payload.user_id,
                "p_node_id": payload.node_id,
                "p_escrow_amount": payload.escrow_amount,
                "p_tariff_snapshot": tariff_per_kwh,
                "p_max_kwh": max_kwh
            }).execute()
            tx_id = str(rpc_res.data)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Escrow lock failed: {str(exc)}")

        session_token = mint_offline_session_token(
            tx_id=tx_id,
            user_id=payload.user_id,
            node_id=payload.node_id,
            max_kwh=max_kwh
        )
        supabase.table("transactions").update({"session_token": session_token}).eq("id", tx_id).execute()

        return ChargeStartResponse(
            success=True,
            tx_id=tx_id,
            node_id=payload.node_id,
            escrow_amount=payload.escrow_amount,
            max_kwh=max_kwh,
            session_token=session_token,
            message="Funds locked in escrow. Push session_token to ESP32 over BLE."
        )

    # ----------------------------------------------------
    # Case B: Local Mock Engine Fallback (Zero-config offline mode)
    # ----------------------------------------------------
    user = MOCK_USERS.get(payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {payload.user_id} not found.")

    node = MOCK_NODES.get(payload.node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {payload.node_id} not found.")

    if node["status"] != "available":
        raise HTTPException(status_code=400, detail=f"Node {payload.node_id} is {node['status']}.")

    if user["wallet_balance"] < payload.escrow_amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance for escrow hold.")

    # Atomic Hold
    user["wallet_balance"] -= payload.escrow_amount
    user["locked_escrow_balance"] += payload.escrow_amount
    node["status"] = "busy"

    tariff_per_kwh = float(node["tariff_per_kwh"])
    max_kwh = round(payload.escrow_amount / tariff_per_kwh, 2)
    tx_id = str(uuid.uuid4())

    session_token = mint_offline_session_token(
        tx_id=tx_id,
        user_id=payload.user_id,
        node_id=payload.node_id,
        max_kwh=max_kwh
    )

    MOCK_TRANSACTIONS[tx_id] = {
        "id": tx_id,
        "user_id": payload.user_id,
        "node_id": payload.node_id,
        "escrow_amount": payload.escrow_amount,
        "tariff_per_kwh": tariff_per_kwh,
        "max_kwh": max_kwh,
        "status": "escrow_locked",
        "session_token": session_token
    }

    return ChargeStartResponse(
        success=True,
        tx_id=tx_id,
        node_id=payload.node_id,
        escrow_amount=payload.escrow_amount,
        max_kwh=max_kwh,
        session_token=session_token,
        message="Funds locked in escrow. Push session_token to ESP32 over BLE."
    )


@app.post("/api/charge/stop")
def charge_stop(payload: ChargeStopRequest):
    """
    Transitions a transaction from locked escrow to settled stage
    using a verified offline ESP32 hardware receipt.
    """
    # ----------------------------------------------------
    # Case A: Real Supabase Client Connected
    # ----------------------------------------------------
    if supabase:
        tx_res = supabase.table("transactions").select("*").eq("id", payload.tx_id).execute()
        if not tx_res.data:
            raise HTTPException(status_code=404, detail=f"Transaction {payload.tx_id} not found.")

        tx_record = tx_res.data[0]
        if tx_record.get("status") == "settled":
            raise HTTPException(status_code=400, detail=f"Transaction {payload.tx_id} is already settled.")

        user_id = tx_record["user_id"]
        node_id = tx_record["node_id"]
        escrow_amount = float(tx_record["escrow_amount"])

        node_res = supabase.table("nodes").select("tariff_per_kwh").eq("id", node_id).execute()
        if not node_res.data:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found.")
        tariff_per_kwh = float(node_res.data[0]["tariff_per_kwh"])

        # Cryptographic Verification
        if not verify_esp32_signature(payload.offline_receipt, payload.signature, JWT_SECRET):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cryptographic verification failed: Invalid ESP32 offline signature."
            )

        kwh_delivered = round(payload.offline_receipt.kwh_delivered, 3)
        calculated_cost = round(kwh_delivered * tariff_per_kwh, 2)
        final_cost = min(calculated_cost, escrow_amount)
        refund_amount = round(escrow_amount - final_cost, 2)

        try:
            rpc_res = supabase.rpc("settle_charge_transaction", {
                "p_tx_id": payload.tx_id,
                "p_user_id": user_id,
                "p_node_id": node_id,
                "p_escrow_amount": escrow_amount,
                "p_final_cost": final_cost,
                "p_refund_amount": refund_amount,
                "p_kwh_delivered": kwh_delivered,
                "p_offline_receipt": payload.offline_receipt.model_dump(),
                "p_signature": payload.signature
            }).execute()

            return {
                "success": True,
                "message": "Transaction settled and funds reconciled atomically.",
                "data": rpc_res.data
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Database atomic settlement failed: {str(exc)}")

    # ----------------------------------------------------
    # Case B: Local Mock Engine Fallback (Zero-config offline mode)
    # ----------------------------------------------------
    tx_record = MOCK_TRANSACTIONS.get(payload.tx_id)
    if not tx_record:
        raise HTTPException(status_code=404, detail=f"Transaction {payload.tx_id} not found.")

    if tx_record.get("status") == "settled":
        raise HTTPException(status_code=400, detail=f"Transaction {payload.tx_id} is already settled.")

    # Cryptographic Verification
    if not verify_esp32_signature(payload.offline_receipt, payload.signature, JWT_SECRET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cryptographic verification failed: Invalid ESP32 offline signature."
        )

    user_id = tx_record["user_id"]
    node_id = tx_record["node_id"]
    escrow_amount = tx_record["escrow_amount"]
    tariff_per_kwh = tx_record["tariff_per_kwh"]

    kwh_delivered = round(payload.offline_receipt.kwh_delivered, 3)
    calculated_cost = round(kwh_delivered * tariff_per_kwh, 2)
    final_cost = min(calculated_cost, escrow_amount)
    refund_amount = round(escrow_amount - final_cost, 2)

    # Atomic Reconciliation on Mock State
    user = MOCK_USERS[user_id]
    user["locked_escrow_balance"] -= escrow_amount
    user["wallet_balance"] += refund_amount

    node = MOCK_NODES[node_id]
    node["status"] = "available"
    node["last_synced_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    tx_record["status"] = "settled"
    tx_record["energy_kwh_delivered"] = kwh_delivered
    tx_record["final_cost"] = final_cost
    tx_record["refund_amount"] = refund_amount
    tx_record["offline_receipt"] = payload.offline_receipt.model_dump()
    tx_record["signature"] = payload.signature

    return {
        "success": True,
        "message": "Transaction settled and funds reconciled atomically.",
        "data": {
            "status": "settled",
            "tx_id": payload.tx_id,
            "final_cost": final_cost,
            "refund_amount": refund_amount,
            "kwh_delivered": kwh_delivered,
            "wallet_balance": user["wallet_balance"]
        }
    }
