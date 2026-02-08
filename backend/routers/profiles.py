"""User profile endpoints (replaces direct Supabase DB calls from frontend)."""

from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import get_current_user, get_optional_user
from services.supabase_client import get_supabase
from models.schemas import ProfileUpdate

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.get("/me")
async def get_profile(user: dict | None = Depends(get_optional_user)):
    """Return the current user's profile, or null if not authenticated."""
    if user is None:
        return None

    user_id = user.get("sub")
    sb = get_supabase()
    result = sb.table("profiles").select("*").eq("user_id", user_id).maybe_single().execute()
    if not result.data:
        return None
    return result.data


@router.patch("/me")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    """Update the current user's profile."""
    user_id = user.get("sub")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sb = get_supabase()
    result = sb.table("profiles").update(updates).eq("user_id", user_id).execute()
    return {"success": True, "data": result.data}
