import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "RelayEV Offline Mesh Backend"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    
    # Cryptographic Escrow Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "relay_ev_super_secret_cryptographic_escrow_key_2026")
    ALGORITHM: str = "HS256"
    ESCROW_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ESCROW_TOKEN_EXPIRE_MINUTES", "120"))  # 2 hours valid offline
    
    # Hardware Master Key for ESP32 Nodes (Used when node has not set a custom secret)
    NODE_SIGNATURE_KEY: str = os.getenv("NODE_SIGNATURE_KEY", "relay_ev_hardware_master_secret_2026")
    
    # Drive-By Data Mule Incentive (INR credited to passing phone per synced receipt)
    MULE_REWARD_PER_RECEIPT: float = float(os.getenv("MULE_REWARD_PER_RECEIPT", "2.00"))
    
    # Maximum clock skew allowed for offline ESP32 receipts (in seconds: 24 hours)
    MAX_CLOCK_SKEW_SECONDS: int = int(os.getenv("MAX_CLOCK_SKEW_SECONDS", "86400"))
    
    # Supabase Credentials (optional - falls back to built-in SQLite database if omitted)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

settings = Settings()
