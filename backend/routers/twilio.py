"""Twilio endpoints -- phone verification, calls, webhook handler, media-stream WebSocket."""

import os
import json
import struct
import asyncio
from base64 import b64encode, b64decode
from urllib.parse import quote as url_quote

import httpx
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import Response as FastAPIResponse
from models.schemas import VerifyPhoneRequest, TestCallRequest, MakeCallRequest
import services.llm as llm
from services.supabase_client import get_supabase
from utils.audio import mulaw_to_pcm, pcm_to_mulaw, resample, create_wav

router = APIRouter(prefix="/api/twilio", tags=["twilio"])


def _twilio_auth(sid: str | None = None, secret: str | None = None) -> str:
    """Return base64-encoded Basic auth for Twilio."""
    sid = sid or os.getenv("TWILIO_SID") or os.getenv("TWILIO_ACCOUNT_SID")
    secret = secret or os.getenv("TWILIO_API_KEY") or os.getenv("TWILIO_AUTH_TOKEN")
    if not sid or not secret:
        raise RuntimeError("Twilio credentials not configured")
    import base64
    return base64.b64encode(f"{sid}:{secret}".encode()).decode()


def _twilio_base(sid: str | None = None) -> str:
    sid = sid or os.getenv("TWILIO_SID") or os.getenv("TWILIO_ACCOUNT_SID")
    return f"https://api.twilio.com/2010-04-01/Accounts/{sid}"


# ---------------------------------------------------------------------------
# 1. POST /api/twilio/verify-phone
# ---------------------------------------------------------------------------
@router.post("/verify-phone")
async def verify_phone(req: VerifyPhoneRequest):
    auth = _twilio_auth()
    base = _twilio_base()

    async with httpx.AsyncClient(timeout=15) as client:
        if req.action == "start_verification":
            resp = await client.post(
                f"{base}/OutgoingCallerIds.json",
                headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
                data={"PhoneNumber": req.phoneNumber, "FriendlyName": f"User Verified: {req.phoneNumber}"},
            )
            data = resp.json()
            if not resp.is_success:
                if data.get("code") == 21450:
                    return {"success": True, "alreadyVerified": True, "message": "This number is already verified as a caller ID"}
                raise HTTPException(status_code=resp.status_code, detail=data.get("message", "Failed to start verification"))
            return {
                "success": True,
                "validationCode": data.get("validation_code"),
                "callSid": data.get("call_sid"),
                "message": "Twilio is calling your phone. Enter the code shown when prompted.",
            }

        elif req.action == "check_verification":
            resp = await client.get(
                f"{base}/OutgoingCallerIds.json?PhoneNumber={url_quote(req.phoneNumber or '')}",
                headers={"Authorization": f"Basic {auth}"},
            )
            data = resp.json()
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail="Failed to check verification status")
            is_verified = bool(data.get("outgoing_caller_ids"))
            return {
                "success": True,
                "verified": is_verified,
                "callerIdSid": data["outgoing_caller_ids"][0]["sid"] if is_verified else None,
            }

        elif req.action == "list_verified":
            resp = await client.get(
                f"{base}/OutgoingCallerIds.json",
                headers={"Authorization": f"Basic {auth}"},
            )
            data = resp.json()
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail="Failed to list verified numbers")
            return {"success": True, "callerIds": data.get("outgoing_caller_ids", [])}

        else:
            raise HTTPException(status_code=400, detail="Invalid action")


# ---------------------------------------------------------------------------
# 2. POST /api/twilio/test-call
# ---------------------------------------------------------------------------
@router.post("/test-call")
async def test_call(req: TestCallRequest):
    sid = os.getenv("TWILIO_SID") or os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        raise HTTPException(status_code=500, detail="Twilio credentials not configured (need TWILIO_SID and TWILIO_AUTH_TOKEN)")
    if not sid.startswith("AC"):
        raise HTTPException(status_code=500, detail=f"Invalid TWILIO_SID format -- should start with 'AC'")

    import base64
    auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
    base = f"https://api.twilio.com/2010-04-01/Accounts/{sid}"

    # Build WebSocket URL for media stream -- points back to our own backend
    backend_url = os.getenv("PUBLIC_URL") or os.getenv("NGROK_PUBLIC_URL") or ""
    ws_url = backend_url.replace("https://", "wss://").replace("http://", "ws://") + "/api/twilio/media-stream"

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Connect>\n'
        f'    <Stream url="{ws_url}">\n'
        f'      <Parameter name="providerName" value="{url_quote(req.providerName)}"/>\n'
        f'      <Parameter name="service" value="{url_quote(req.service)}"/>\n'
        f'      <Parameter name="userName" value="{url_quote(req.userName)}"/>\n'
        f'      <Parameter name="purpose" value="{url_quote(req.purpose)}"/>\n'
        f'      <Parameter name="details" value="{url_quote(req.details)}"/>\n'
        f'      <Parameter name="timePreference" value="{url_quote(req.timePreference)}"/>\n'
        "    </Stream>\n  </Connect>\n</Response>"
    )

    async with httpx.AsyncClient(timeout=15) as client:
        # Get a Twilio phone number to call from
        nums_resp = await client.get(
            f"{base}/IncomingPhoneNumbers.json?PageSize=1",
            headers={"Authorization": f"Basic {auth}"},
        )
        nums = nums_resp.json()
        if not nums_resp.is_success or not nums.get("incoming_phone_numbers"):
            raise HTTPException(status_code=500, detail="No Twilio phone number found in your account")
        from_number = nums["incoming_phone_numbers"][0]["phone_number"]

        call_resp = await client.post(
            f"{base}/Calls.json",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"To": req.toNumber, "From": from_number, "Twiml": twiml},
        )
        call_data = call_resp.json()
        if not call_resp.is_success:
            raise HTTPException(status_code=call_resp.status_code, detail=call_data.get("message", "Failed to initiate call"))

    return {
        "success": True,
        "callSid": call_data.get("sid"),
        "status": call_data.get("status"),
        "from": from_number,
        "to": req.toNumber,
        "message": f"Test call initiated! You should receive a call at {req.toNumber}",
    }


# ---------------------------------------------------------------------------
# 3. POST /api/twilio/make-call
# ---------------------------------------------------------------------------
@router.post("/make-call")
async def make_call(req: MakeCallRequest):
    auth = _twilio_auth()
    base = _twilio_base()

    backend_url = os.getenv("PUBLIC_URL") or os.getenv("NGROK_PUBLIC_URL") or ""
    callback_url = backend_url.rstrip("/") + "/api/twilio/call-handler"

    async with httpx.AsyncClient(timeout=15) as client:
        # Verify caller ID first
        verify_resp = await client.get(
            f"{base}/OutgoingCallerIds.json?PhoneNumber={url_quote(req.fromNumber)}",
            headers={"Authorization": f"Basic {auth}"},
        )
        verify_data = verify_resp.json()
        if not verify_data.get("outgoing_caller_ids"):
            raise HTTPException(status_code=400, detail="Caller ID not verified. Verify your phone number first.")

        purpose_text = {"new_appointment": "We would like to book an appointment."}.get(req.purpose, "")
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n'
            f'  <Say voice="Polly.Joanna">Hello, this is an AI assistant calling on behalf of {req.userName}. '
            f"I'm calling to inquire about {req.service}. {purpose_text} "
            f'{("Our preferred time is " + req.timePreference + ".") if req.timePreference else ""} '
            f"{req.details}</Say>\n"
            '  <Pause length="2"/>\n'
            '  <Say voice="Polly.Joanna">Could you please let me know your available times?</Say>\n'
            f'  <Record maxLength="60" transcribe="true" transcribeCallback="{callback_url}"/>\n'
            "</Response>"
        )

        call_resp = await client.post(
            f"{base}/Calls.json",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
            data={
                "To": req.toNumber,
                "From": req.fromNumber,
                "Twiml": twiml,
                "StatusCallback": callback_url,
                "StatusCallbackEvent": "initiated ringing answered completed",
                "StatusCallbackMethod": "POST",
            },
        )
        call_data = call_resp.json()
        if not call_resp.is_success:
            raise HTTPException(status_code=call_resp.status_code, detail=call_data.get("message", "Failed to initiate call"))

    return {
        "success": True,
        "callSid": call_data.get("sid"),
        "status": call_data.get("status"),
        "message": f"Call initiated to {req.providerName}",
    }


# ---------------------------------------------------------------------------
# 4. POST /api/twilio/call-handler  (Twilio webhook -- returns TwiML XML)
# ---------------------------------------------------------------------------
@router.post("/call-handler")
async def call_handler(request: Request):
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}

    call_sid = params.get("CallSid", "")
    call_status = params.get("CallStatus", "")
    transcription = params.get("TranscriptionText", "")

    if call_status:
        print(f"Call {call_sid} status: {call_status}")
    if transcription:
        print(f"Transcription for {call_sid}: {transcription}")

    return FastAPIResponse(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml",
    )


# ---------------------------------------------------------------------------
# 5. WS /api/twilio/media-stream  (bidirectional audio WebSocket)
# ---------------------------------------------------------------------------
@router.websocket("/media-stream")
async def media_stream(ws: WebSocket):
    await ws.accept()

    context = {
        "stream_sid": "",
        "call_sid": "",
        "provider_name": "",
        "service": "",
        "user_name": "",
        "purpose": "",
        "details": "",
        "time_preference": "",
        "conversation_history": [],
        "audio_buffer": bytearray(),
        "is_processing": False,
    }

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            event = msg.get("event")

            if event == "connected":
                print("Twilio media stream connected")

            elif event == "start":
                context["stream_sid"] = msg.get("streamSid", "")
                start_info = msg.get("start", {})
                context["call_sid"] = start_info.get("callSid", "")
                cp = start_info.get("customParameters", {})
                context["provider_name"] = cp.get("providerName", "the business")
                context["service"] = cp.get("service", "appointment")
                context["user_name"] = cp.get("userName", "a customer")
                context["purpose"] = cp.get("purpose", "new_appointment")
                context["details"] = cp.get("details", "")
                context["time_preference"] = cp.get("timePreference", "flexible")
                # Send initial greeting after a short delay
                asyncio.get_event_loop().call_later(
                    1.0, lambda: asyncio.ensure_future(_generate_and_send(ws, context, is_initial=True))
                )

            elif event == "media":
                audio_bytes = b64decode(msg["media"]["payload"])
                context["audio_buffer"].extend(audio_bytes)
                # Process when ~2 seconds accumulated (8kHz mu-law = 16000 samples)
                if len(context["audio_buffer"]) >= 16000 and not context["is_processing"]:
                    asyncio.ensure_future(_process_audio_and_respond(ws, context))

            elif event == "stop":
                print("Twilio media stream stopped")

            elif event == "mark":
                pass  # acknowledgement

    except WebSocketDisconnect:
        print("Twilio media stream WebSocket closed")
    except Exception as exc:
        print(f"Media-stream error: {exc}")


# -- helpers for the WebSocket pipeline ------------------------------------

async def _process_audio_and_respond(ws: WebSocket, ctx: dict):
    if ctx["is_processing"] or not ctx["audio_buffer"]:
        return
    ctx["is_processing"] = True
    try:
        raw = bytes(ctx["audio_buffer"])
        ctx["audio_buffer"] = bytearray()

        pcm_8k = mulaw_to_pcm(raw)
        pcm_16k = resample(pcm_8k, 8000, 16000)
        transcription = await _transcribe(pcm_16k)
        if not transcription or len(transcription.strip()) < 2:
            ctx["is_processing"] = False
            return

        print(f"Provider said: {transcription}")
        await _broadcast(ctx["call_sid"], "user", transcription)
        ctx["conversation_history"].append({"role": "user", "content": transcription})
        await _generate_and_send(ws, ctx, is_initial=False)
    except Exception as exc:
        print(f"Audio processing error: {exc}")
    finally:
        ctx["is_processing"] = False


async def _generate_and_send(ws: WebSocket, ctx: dict, *, is_initial: bool):
    try:
        ai_text = await _generate_ai_response(ctx, is_initial)
        print(f"AI says: {ai_text}")
        await _broadcast(ctx["call_sid"], "ai", ai_text)
        ctx["conversation_history"].append({"role": "assistant", "content": ai_text})

        audio_pcm_22k = await _tts(ai_text)
        pcm_8k = resample(audio_pcm_22k, 22050, 8000)
        mulaw_data = pcm_to_mulaw(pcm_8k)

        chunk_size = 640  # 80ms at 8kHz
        for i in range(0, len(mulaw_data), chunk_size):
            chunk = mulaw_data[i : i + chunk_size]
            payload = b64encode(chunk).decode()
            await ws.send_text(json.dumps({
                "event": "media",
                "streamSid": ctx["stream_sid"],
                "media": {"payload": payload},
            }))
            await asyncio.sleep(0.01)

        await ws.send_text(json.dumps({
            "event": "mark",
            "streamSid": ctx["stream_sid"],
            "mark": {"name": "audio_complete"},
        }))
    except Exception as exc:
        print(f"Generate/send error: {exc}")


async def _transcribe(pcm_16k: bytes) -> str:
    wav = create_wav(pcm_16k, 16000)
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": api_key},
            files={"file": ("audio.wav", wav, "audio/wav")},
            data={"model_id": "scribe_v2", "language_code": "eng"},
        )
    if not resp.is_success:
        print(f"STT error: {resp.text}")
        return ""
    return resp.json().get("text", "")


async def _generate_ai_response(ctx: dict, is_initial: bool) -> str:
    if is_initial:
        sys_prompt = (
            f"You are an AI phone assistant making a call to book an appointment.\n"
            f"Generate the opening message for a call to {ctx['provider_name']}.\n"
            f"Be polite, professional, and clearly state you're an AI calling on behalf of {ctx['user_name']}.\n"
            "Keep it concise (2-3 sentences max). Speak naturally as if on a phone call."
        )
        purpose_text = {"new_appointment": "Book new appointment", "reschedule": "Reschedule"}.get(ctx["purpose"], ctx["purpose"])
        user_prompt = (
            f"Generate opening for:\nService: {ctx['service']}\nPurpose: {purpose_text}\n"
            f"Details: {ctx['details'] or 'None'}\nTime preference: {ctx['time_preference'] or 'Flexible'}"
        )
    else:
        sys_prompt = (
            f"You are an AI phone assistant in a live phone conversation to book an appointment at {ctx['provider_name']}.\n"
            "Based on what the receptionist/staff said, generate an appropriate reply.\n"
            "If they offered a time slot, confirm it and ask for confirmation details.\n"
            "If they asked a question, answer it based on the context.\n"
            "If they can't help, thank them politely.\n"
            "Keep responses concise (1-2 sentences). Be natural and conversational."
        )
        last_msg = ctx["conversation_history"][-1]["content"] if ctx["conversation_history"] else "Hello?"
        user_prompt = (
            f'The receptionist said: "{last_msg}"\n\nService requested: {ctx["service"]}\n'
            f"Time preference: {ctx['time_preference'] or 'Flexible'}\n"
            f"Additional context: {ctx['details'] or 'None'}\n\nWhat should you say next?"
        )

    data = await llm.chat_completion(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": sys_prompt},
            *ctx["conversation_history"][-6:],
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=150,
        temperature=0.7,
    )
    return (data.get("choices") or [{}])[0].get("message", {}).get("content", "Could you please repeat that?")


async def _tts(text: str) -> bytes:
    """Call ElevenLabs TTS and return raw PCM bytes at 22050 Hz."""
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    voice_id = "EXAVITQu4vr4xnSDxMaL"  # Sarah
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=pcm_22050",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True},
            },
        )
    if not resp.is_success:
        raise RuntimeError(f"TTS failed: {resp.text}")
    return resp.content  # raw PCM 16-bit LE at 22050 Hz


async def _broadcast(call_sid: str, speaker: str, text: str):
    """Broadcast transcript to frontend via Supabase Realtime."""
    if not call_sid:
        return
    try:
        import time
        sb = get_supabase()
        channel = sb.channel(f"call:{call_sid}")
        channel.send_broadcast("transcript", {"speaker": speaker, "text": text, "timestamp": int(time.time() * 1000)})
    except Exception as exc:
        print(f"Broadcast error: {exc}")
