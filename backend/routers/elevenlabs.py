"""ElevenLabs endpoints -- TTS, conversation token, scribe token."""

import os
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from models.schemas import TTSRequest, ConversationTokenRequest

router = APIRouter(prefix="/api/elevenlabs", tags=["elevenlabs"])

VOICES = {
    "ai_assistant": "EXAVITQu4vr4xnSDxMaL",  # Sarah
    "provider": "JBFqnCBsd6RMkjVDRZzb",  # George
}


def _api_key() -> str:
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY must be set")
    return key


# ---------------------------------------------------------------------------
# 1. POST /api/elevenlabs/tts  -- returns audio/mpeg binary
# ---------------------------------------------------------------------------
@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    voice_id = VOICES.get(req.speaker, VOICES["ai_assistant"])

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
            headers={
                "xi-api-key": _api_key(),
                "Content-Type": "application/json",
            },
            json={
                "text": req.text,
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.3,
                    "use_speaker_boost": True,
                },
            },
        )

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs TTS error: {resp.text}")

    return Response(content=resp.content, media_type="audio/mpeg")


# ---------------------------------------------------------------------------
# 2. POST /api/elevenlabs/conversation-token
# ---------------------------------------------------------------------------
@router.post("/conversation-token")
async def conversation_token(req: ConversationTokenRequest):
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id={req.agentId}",
            headers={"xi-api-key": _api_key()},
        )

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid ElevenLabs API key")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Agent not found. Please check the agent ID.")
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs error: {resp.text}")

    data = resp.json()
    return {"signed_url": data.get("signed_url")}


# ---------------------------------------------------------------------------
# 3. POST /api/elevenlabs/scribe-token
# ---------------------------------------------------------------------------
@router.post("/scribe-token")
async def scribe_token():
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
            headers={"xi-api-key": _api_key()},
        )

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs scribe error: {resp.text}")

    data = resp.json()
    return {"token": data.get("token")}
