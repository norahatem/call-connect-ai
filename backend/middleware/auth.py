"""JWT verification middleware for Supabase auth tokens."""

import os
import json
import base64
from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError

# Supabase may use HS256, HS384, or HS512 depending on project config
_ALLOWED_ALGORITHMS = ["HS256", "HS384", "HS512"]


def _jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_JWT_SECRET is not configured in backend/.env -- add it and restart the server",
        )
    return secret


def _peek_jwt_header(token: str) -> dict:
    """Decode just the JWT header (no verification) to inspect the algorithm."""
    try:
        header_b64 = token.split(".")[0]
        # Add padding
        header_b64 += "=" * (4 - len(header_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(header_b64))
    except Exception:
        return {}


def _decode_token(token: str, secret: str) -> dict:
    """Attempt to decode/verify a Supabase JWT, trying allowed algorithms."""
    # First try with the standard allowed list
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=_ALLOWED_ALGORITHMS,
            audience="authenticated",
        )
    except JWTError:
        pass

    # If that fails, peek at the header to see what alg is actually used
    header = _peek_jwt_header(token)
    alg = header.get("alg", "unknown")

    # Try again with the token's own algorithm (if it's an HMAC variant)
    if alg.startswith("HS"):
        try:
            return jwt.decode(
                token,
                secret,
                algorithms=[alg],
                audience="authenticated",
            )
        except JWTError:
            pass

    # Final attempt: skip audience check (some Supabase versions omit it)
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=_ALLOWED_ALGORITHMS + ([alg] if alg.startswith("HS") else []),
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise exc


def get_current_user(request: Request) -> dict:
    """FastAPI dependency that extracts and verifies the Supabase JWT.
    
    Returns the decoded payload (contains sub, email, etc.).
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        print(f"[AUTH] 401 – No Authorization header on {request.method} {request.url.path}")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split(" ", 1)[1]
    secret = _jwt_secret()

    try:
        payload = _decode_token(token, secret)
        return payload
    except JWTError as exc:
        header = _peek_jwt_header(token)
        print(f"[AUTH] 401 – JWT decode failed on {request.method} {request.url.path}: {exc}")
        print(f"[AUTH]   Token alg: {header.get('alg', '?')}, Token (first 40 chars): {token[:40]}...")
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


def get_optional_user(request: Request) -> dict | None:
    """Like get_current_user but returns None silently when token is missing/invalid."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None  # silently skip – caller doesn't require auth

    token = auth_header.split(" ", 1)[1]
    try:
        secret = _jwt_secret()
    except HTTPException:
        return None

    try:
        return _decode_token(token, secret)
    except JWTError as exc:
        header = _peek_jwt_header(token)
        print(f"[AUTH] Optional auth – JWT decode failed (alg={header.get('alg', '?')}): {exc}")
        return None
