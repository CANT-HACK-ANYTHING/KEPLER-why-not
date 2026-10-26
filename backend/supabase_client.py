import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

def get_supabase_client() -> Client:
    """
    Returns a configured Supabase client instance.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[WARNING] Supabase credentials not fully configured in environment.")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# Singleton client instance
supabase: Client = get_supabase_client() if SUPABASE_URL and SUPABASE_KEY else None
