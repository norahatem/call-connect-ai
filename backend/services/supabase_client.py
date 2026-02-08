"""Supabase client for database access and JWT verification."""

import os
from functools import lru_cache
from supabase import create_client, Client


@lru_cache()
def get_supabase() -> Client:
    """Return a server-side Supabase client using the service-role key."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)
