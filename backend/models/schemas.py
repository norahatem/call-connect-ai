"""Pydantic request/response models for all API endpoints."""

from pydantic import BaseModel
from typing import Optional


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------

class AvailabilityRequest(BaseModel):
    date: str | None = None
    time_min: str | None = None
    time_max: str | None = None


class BookingRequest(BaseModel):
    title: str | None = None
    start_time: str
    end_time: str | None = None
    description: str | None = None
    provider_name: str | None = None
    appointment_type: str | None = None


# ---------------------------------------------------------------------------
# AI / LLM
# ---------------------------------------------------------------------------

class OrchestrateRequest(BaseModel):
    service: str
    providerName: str
    userName: str
    purpose: str | None = None
    details: str | None = None
    timePreference: str | None = None
    conversationHistory: list[dict] | None = None


class SimulateResponseRequest(BaseModel):
    service: str
    providerName: str
    aiMessage: str
    conversationHistory: list[dict] | None = None
    timePreference: str | None = None


class TextChatRequest(BaseModel):
    receptionistMessage: str | None = None
    provider: dict
    user: dict
    conversationHistory: list[dict] = []
    toolResults: list[dict] | None = None


class AnalyzeIntakeRequest(BaseModel):
    service: str
    userInput: str | None = None


class GenerateIntakeExampleRequest(BaseModel):
    service: str


class GenerateCallScriptRequest(BaseModel):
    service: str
    providerName: str
    userName: str
    purpose: str | None = None
    details: str | None = None
    timePreference: str | None = None


# ---------------------------------------------------------------------------
# ElevenLabs
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str
    speaker: str = "ai_assistant"


class ConversationTokenRequest(BaseModel):
    agentId: str
    context: dict | None = None


# ---------------------------------------------------------------------------
# Twilio
# ---------------------------------------------------------------------------

class VerifyPhoneRequest(BaseModel):
    action: str
    phoneNumber: str | None = None
    code: str | None = None


class TestCallRequest(BaseModel):
    toNumber: str
    providerName: str = "Test Business"
    service: str = "appointment booking"
    userName: str = "Test User"
    purpose: str = "new_appointment"
    details: str = ""
    timePreference: str = "tomorrow afternoon"


class MakeCallRequest(BaseModel):
    toNumber: str
    fromNumber: str
    providerName: str
    service: str
    userName: str
    purpose: str
    details: str = ""
    timePreference: str = ""


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------

class ProfileUpdate(BaseModel):
    full_name: str | None = None
    date_of_birth: str | None = None
