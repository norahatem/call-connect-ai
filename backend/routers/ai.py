"""AI/LLM endpoints -- ports of 6 Supabase Edge Functions."""

import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from models.schemas import (
    OrchestrateRequest,
    SimulateResponseRequest,
    TextChatRequest,
    AnalyzeIntakeRequest,
    GenerateIntakeExampleRequest,
    GenerateCallScriptRequest,
)
import services.llm as llm

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# Service-field definitions for analyze-intake
# ---------------------------------------------------------------------------
SERVICE_REQUIREMENTS: dict = {
    "medical": {
        "fields": [
            {"key": "patient_name", "label": "Full Name", "type": "text", "required": True},
            {"key": "date_of_birth", "label": "Date of Birth (dd/mm/yyyy)", "type": "text", "required": True},
            {"key": "reason_for_visit", "label": "Reason for Visit", "type": "textarea", "required": True},
            {"key": "insurance_provider", "label": "Insurance Provider", "type": "text", "required": False},
        ]
    },
    "dental": {
        "fields": [
            {"key": "patient_name", "label": "Full Name", "type": "text", "required": True},
            {"key": "date_of_birth", "label": "Date of Birth (dd/mm/yyyy)", "type": "text", "required": True},
            {"key": "reason_for_visit", "label": "Reason for Visit", "type": "textarea", "required": True},
            {"key": "insurance_provider", "label": "Dental Insurance", "type": "text", "required": False},
        ]
    },
    "automotive": {
        "fields": [
            {"key": "contact_name", "label": "Your Name", "type": "text", "required": True},
            {"key": "vehicle_make", "label": "Vehicle Make", "type": "text", "required": True},
            {"key": "vehicle_model", "label": "Vehicle Model", "type": "text", "required": True},
            {"key": "vehicle_year", "label": "Vehicle Year", "type": "text", "required": True},
            {"key": "issue_description", "label": "Describe the issue", "type": "textarea", "required": True},
        ]
    },
    "salon": {
        "fields": [
            {"key": "client_name", "label": "Your Name", "type": "text", "required": True},
            {"key": "service_type", "label": "Service Type", "type": "select", "options": ["Haircut", "Color", "Styling", "Manicure", "Pedicure", "Facial", "Other"], "required": True},
            {"key": "stylist_preference", "label": "Preferred Stylist (if any)", "type": "text", "required": False},
            {"key": "special_requests", "label": "Special Requests", "type": "textarea", "required": False},
        ]
    },
    "restaurant": {
        "fields": [
            {"key": "party_name", "label": "Name for Reservation", "type": "text", "required": True},
            {"key": "party_size", "label": "Party Size", "type": "select", "options": ["1", "2", "3", "4", "5", "6", "7", "8+"], "required": True},
            {"key": "special_occasion", "label": "Special Occasion?", "type": "select", "options": ["None", "Birthday", "Anniversary", "Business", "Other"], "required": False},
            {"key": "dietary_restrictions", "label": "Dietary Restrictions", "type": "textarea", "required": False},
        ]
    },
    "general": {
        "fields": [
            {"key": "contact_name", "label": "Your Name", "type": "text", "required": True},
            {"key": "service_details", "label": "What do you need?", "type": "textarea", "required": True},
        ]
    },
}


# ---------------------------------------------------------------------------
# 1. POST /api/ai/orchestrate  (was ai-call-orchestrator)
# ---------------------------------------------------------------------------
@router.post("/orchestrate")
async def orchestrate(req: OrchestrateRequest):
    is_first = not req.conversationHistory or len(req.conversationHistory) == 0

    if is_first:
        system_prompt = (
            f"You are an AI phone assistant making a call to book an appointment.\n"
            f"Generate the opening message for a call to {req.providerName}.\n"
            f"Be polite, professional, and clearly state you're an AI calling on behalf of {req.userName}.\n"
            f"Keep it concise (2-3 sentences max)."
        )
        purpose_text = {"new_appointment": "Book new appointment", "reschedule": "Reschedule"}.get(req.purpose or "", req.purpose or "General inquiry")
        user_prompt = (
            f"Generate opening for:\nService: {req.service}\nPurpose: {purpose_text}\n"
            f"Details: {req.details or 'None'}\nTime preference: {req.timePreference or 'Flexible'}"
        )
    else:
        system_prompt = (
            "You are an AI phone assistant in a conversation to book an appointment.\n"
            "Based on the provider's last response, generate an appropriate reply.\n"
            "If they offered a time slot, confirm it.\n"
            "If they asked a question, answer it.\n"
            "If they can't help, thank them politely and end the call.\n"
            "Keep responses concise (1-2 sentences)."
        )
        last_provider = next(
            (m["text"] for m in reversed(req.conversationHistory or []) if m.get("speaker") == "provider"),
            "Hello?",
        )
        user_prompt = (
            f'Provider\'s last response: "{last_provider}"\n'
            f"Service requested: {req.service}\nTime preference: {req.timePreference or 'Flexible'}\n"
            f"Additional context: {req.details or 'None'}\n\nWhat should the AI say next?"
        )

    result = await llm.chat_with_tool(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        tool_name="ai_response",
        tool_description="Generate the AI assistant's spoken response",
        tool_parameters={
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "What the AI should say"},
                "intent": {
                    "type": "string",
                    "enum": ["greeting", "request", "confirm", "clarify", "thank", "end"],
                    "description": "The intent of this message",
                },
            },
            "required": ["message", "intent"],
            "additionalProperties": False,
        },
    )
    return result


# ---------------------------------------------------------------------------
# 2. POST /api/ai/simulate-response  (was simulate-call-response)
# ---------------------------------------------------------------------------
@router.post("/simulate-response")
async def simulate_response(req: SimulateResponseRequest):
    system_prompt = (
        f'You are simulating a service provider receptionist at "{req.providerName}" responding to an AI assistant booking call.\n\n'
        f"Your role:\n- Respond naturally as a human receptionist would\n"
        f"- Consider the service type: {req.service}\n"
        f"- Time preference requested: {req.timePreference or 'flexible'}\n\n"
        "Behavior guidelines:\n- 70% chance: Be helpful and offer available slots\n"
        "- 20% chance: Be busy/fully booked this week\n- 10% chance: Be closed or unavailable\n\n"
        "If offering availability, suggest realistic time slots within the next few days.\n"
        "Keep responses concise (1-3 sentences) like real phone conversations."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        *(req.conversationHistory or []),
        {"role": "user", "content": f'AI Assistant says: "{req.aiMessage}"'},
    ]

    result = await llm.chat_with_tool(
        model="gpt-4o-mini",
        messages=messages,
        tool_name="provider_response",
        tool_description="Generate the provider's response",
        tool_parameters={
            "type": "object",
            "properties": {
                "response": {"type": "string", "description": "The provider's spoken response"},
                "status": {
                    "type": "string",
                    "enum": ["continue", "success", "unavailable", "closed"],
                    "description": "Call status after this response",
                },
                "availableSlot": {
                    "type": "string",
                    "description": "If booking successful, the offered time slot (ISO 8601 format or natural language)",
                },
                "confirmationCode": {
                    "type": "string",
                    "description": "If booking confirmed, a confirmation code",
                },
            },
            "required": ["response", "status"],
            "additionalProperties": False,
        },
    )
    return result


# ---------------------------------------------------------------------------
# 3. POST /api/ai/text-chat  (was text-agent-chat)
# ---------------------------------------------------------------------------
@router.post("/text-chat")
async def text_chat(req: TextChatRequest):
    user_name = req.user.get("name", "the client")
    provider_name = req.provider.get("name", "the provider")

    system_prompt = (
        f'You are an AI booking assistant making a PHONE CALL on behalf of your client "{user_name}".\n\n'
        f'YOUR ROLE:\n- You are CALLING "{provider_name}" to book an appointment for your client\n'
        "- You speak TO the receptionist (the human you're chatting with)\n"
        "- You are polite, professional, and efficient - like a real secretary making a call\n\n"
        f"THE CONVERSATION:\n- The receptionist works at {provider_name}\n"
        "- They will offer available times, ask questions, and confirm bookings\n"
        f"- You need to find a time that works for YOUR CLIENT ({user_name})\n\n"
        "TOOL RESULTS:\nWhen you receive tool results, USE THEM to respond appropriately:\n"
        '- If client is AVAILABLE at a time -> Confirm with receptionist: "That time works for my client!"\n'
        '- If client has a CONFLICT -> Ask for alternatives: "Unfortunately my client has a conflict then. Do you have any other times?"\n'
        "- After getting a confirmation code -> Thank them and confirm the booking is complete\n\n"
        'RESPOND WITH JSON:\n{\n  "agentResponse": "What you say to the receptionist",\n'
        '  "toolCalls": [\n    { "name": "check_client_availability", "params": { "time": "the time offered" } }\n  ] or []\n}\n\n'
        f"AVAILABLE TOOLS:\n- check_client_availability: Check if {user_name} is free. Params: {{ \"time\": \"tomorrow at 2pm\" }}\n"
        '- book_appointment: Finalize booking. Params: { "time": "the confirmed time", "confirmationCode": "ABC123" }\n\n'
        "IMPORTANT RULES:\n1. When receptionist offers a time -> Call check_client_availability with that time\n"
        "2. When you ALREADY HAVE tool results showing availability -> DON'T call the tool again, just respond based on the result\n"
        "3. When receptionist confirms booking with a code -> Call book_appointment\n"
        "4. Be conversational and natural\n\n"
        f"Current date: {datetime.now().strftime('%m/%d/%Y')}"
    )

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        *req.conversationHistory[-10:],
    ]

    if req.receptionistMessage:
        messages.append({"role": "user", "content": req.receptionistMessage})

    if req.toolResults:
        tool_text = "\n".join(
            f"TOOL RESULT for {t['name']}: {json.dumps(t['result'])}" for t in req.toolResults
        )
        messages.append({
            "role": "user",
            "content": f"[SYSTEM: Tool execution completed]\n{tool_text}\n\nNow respond to the receptionist based on these results. DO NOT call the same tool again.",
        })

    parsed = await llm.chat_json(model="gpt-4o-mini", messages=messages)

    # Prevent tool-call loops when tool results already provided
    if req.toolResults:
        parsed["toolCalls"] = []

    return {
        "agentResponse": parsed.get("agentResponse", "I see, let me confirm with my client's schedule..."),
        "toolCalls": parsed.get("toolCalls", []),
    }


# ---------------------------------------------------------------------------
# 4. POST /api/ai/analyze-intake  (was analyze-intake)
# ---------------------------------------------------------------------------
@router.post("/analyze-intake")
async def analyze_intake(req: AnalyzeIntakeRequest):
    system_prompt = (
        "You are an intake assistant that categorizes services and extracts information from user input.\n\n"
        "Given a service type and user's description, you must:\n"
        "1. Categorize the service into one of: medical, dental, automotive, salon, restaurant, general\n"
        "2. Extract any information the user has already provided\n"
        '3. IMPORTANT: Always extract the reason/purpose from the user\'s description into "reason_for_visit" or "issue_description" or "service_details" depending on category\n\n'
        'Respond with JSON:\n{\n  "category": "medical|dental|automotive|salon|restaurant|general",\n'
        '  "extracted_info": { "field_key": "value they provided" },\n  "confidence": 0.0-1.0\n}\n\n'
        "Examples of categorization:\n"
        '- "doctor", "clinic", "physician", "checkup", "medical" -> medical\n'
        '- "dentist", "teeth", "dental" -> dental\n'
        '- "mechanic", "car repair", "auto shop", "garage", "oil change" -> automotive\n'
        '- "haircut", "salon", "spa", "nails", "barber" -> salon\n'
        '- "restaurant", "dinner", "reservation", "table" -> restaurant\n'
        "- anything else -> general\n\n"
        "IMPORTANT: The user's initial description almost always contains the reason for visit - extract it!"
    )

    try:
        parsed = await llm.chat_json(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f'Service: "{req.service}"\nUser input: "{req.userInput or "No additional details provided"}"'},
            ],
        )
    except Exception:
        parsed = {"category": "general", "extracted_info": {}, "confidence": 0.5}

    category = parsed.get("category", "general")
    extracted_info = parsed.get("extracted_info", {})

    requirements = SERVICE_REQUIREMENTS.get(category, SERVICE_REQUIREMENTS["general"])

    missing_fields = [
        f for f in requirements["fields"]
        if f["required"] and not (extracted_info.get(f["key"]) or "").strip()
    ]
    optional_fields = [
        f for f in requirements["fields"]
        if not f["required"] and not (extracted_info.get(f["key"]) or "").strip()
    ]

    return {
        "category": category,
        "extractedInfo": extracted_info,
        "missingFields": missing_fields,
        "optionalFields": optional_fields,
        "allFields": requirements["fields"],
    }


# ---------------------------------------------------------------------------
# 5. POST /api/ai/generate-intake-example  (was generate-intake-example)
# ---------------------------------------------------------------------------
@router.post("/generate-intake-example")
async def generate_intake_example(req: GenerateIntakeExampleRequest):
    try:
        data = await llm.chat_completion(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate short, helpful placeholder examples for appointment booking forms.\n"
                        "Given a service type, generate 1-2 brief example phrases a user might type when booking.\n"
                        "Keep it under 80 characters total. Use casual, natural language.\n"
                        'Format: \'e.g., "example 1" or "example 2"\'\n'
                        "Do NOT include personal info like names or dates - just the service need."
                    ),
                },
                {"role": "user", "content": f'Service: "{req.service}"'},
            ],
            max_tokens=60,
            temperature=0.7,
        )
        example = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
        return {"example": example}
    except Exception:
        return {"example": ""}


# ---------------------------------------------------------------------------
# 6. POST /api/ai/generate-call-script  (was generate-call-script)
# ---------------------------------------------------------------------------
@router.post("/generate-call-script")
async def generate_call_script(req: GenerateCallScriptRequest):
    system_prompt = (
        "You are an AI phone assistant making calls on behalf of users to book appointments.\n"
        "Generate a natural, professional phone script for the AI to use when calling a service provider.\n"
        "The script should:\n- Introduce the AI as calling on behalf of the user\n"
        "- Clearly state the purpose of the call\n- Be polite and professional\n"
        "- Handle common scenarios (availability check, booking confirmation, providing details)\n"
        "- Be concise but thorough\n\n"
        'Return a JSON object with:\n- "greeting": The opening line\n- "purpose": How to explain why we\'re calling\n'
        '- "details": How to communicate any special requirements\n'
        '- "timeRequest": How to ask about availability\n- "confirmation": How to confirm a booking\n'
        '- "closing": How to end the call professionally'
    )
    purpose_text = {"new_appointment": "Book a new appointment", "reschedule": "Reschedule an existing appointment"}.get(req.purpose or "", req.purpose or "General inquiry")
    user_prompt = (
        f"Generate a call script for:\n- Service: {req.service}\n- Provider: {req.providerName}\n"
        f"- Calling for: {req.userName}\n- Purpose: {purpose_text}\n"
        f"- Additional details: {req.details or 'None provided'}\n- Time preference: {req.timePreference or 'Flexible'}"
    )

    result = await llm.chat_with_tool(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        tool_name="generate_script",
        tool_description="Generate a structured call script",
        tool_parameters={
            "type": "object",
            "properties": {
                "greeting": {"type": "string", "description": "Opening line for the call"},
                "purpose": {"type": "string", "description": "How to explain the call purpose"},
                "details": {"type": "string", "description": "How to communicate special requirements"},
                "timeRequest": {"type": "string", "description": "How to ask about availability"},
                "confirmation": {"type": "string", "description": "How to confirm a booking"},
                "closing": {"type": "string", "description": "Professional closing statement"},
            },
            "required": ["greeting", "purpose", "details", "timeRequest", "confirmation", "closing"],
            "additionalProperties": False,
        },
    )
    return {"script": result}
