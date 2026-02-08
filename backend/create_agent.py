from tkinter import N
from dotenv import load_dotenv
import json
import os
from elevenlabs.client import ElevenLabs


# from elevenlabs.types import AgentConfig, AgentTool
# import ngrok
from pyngrok import ngrok

load_dotenv()

AGENT_NAME="CallPilot"


def get_or_create_agent(client, system_prompt, all_tools):

    # 1. LIST EXISTING AGENTS (use agents.list(), not get_agents())
    response = client.conversational_ai.agents.list(search=AGENT_NAME)
    existing_agent = None
    if response.agents:
        for agent in response.agents:
            if agent.name == AGENT_NAME:
                existing_agent = agent
                break
    # 2. IF FOUND, UPDATE TOOLS AND RETURN
    if existing_agent:
        print(f"Found existing agent: {existing_agent.name} (ID: {existing_agent.agent_id})")
        client.conversational_ai.agents.update(
            existing_agent.agent_id,
            conversation_config={
                "agent": {
                    "prompt": {
                        "prompt": system_prompt,
                        "tools": all_tools
                    }
                },
                "first_message": "Hi there, "
            },
        )
        return existing_agent

    # 3. IF NOT FOUND, CREATE NEW AGENT (use agents.create(), and include a valid voice)
    voices_response = client.voices.get_all(show_legacy=True)
    voice_id = voices_response.voices[0].voice_id if voices_response.voices else None
    if not voice_id:
        raise RuntimeError("No voices found. Add a voice at https://elevenlabs.io/app/voice-library")
    conversation_config = {
        "tts": {
            "voice_id": voice_id,
            "model_id": "eleven_flash_v2_5"
        },
        "agent": {
            "prompt": {
                "prompt": system_prompt,
                "tools": all_tools
            },
            "first_message": "Hi there,"
        }
    }
    new_agent = client.conversational_ai.agents.create(
        name=AGENT_NAME,
        conversation_config=conversation_config
    )
    return new_agent
 


def import_phone_number(client, phone, sid, token):
    phone_number_id =client.conversational_ai.phone_numbers.create(
        request={
            "provider": "twilio",
            "label": "CallPilot Twilio",
            "phone_number": phone,
            "sid": sid,
            "token": token
        }
    )
    pid = getattr(phone_number_id, "phone_number_id", phone_number_id)
    print("phone_number_id:", pid)
    return pid

def make_call(client, agent_id, agent_phone_number_id, to_number):
    response = client.conversational_ai.twilio.outbound_call(
        agent_id=agent_id,
        agent_phone_number_id=agent_phone_number_id,
        to_number=to_number
    )
    return response


def get_public_url(port=3001):
    """Use PUBLIC_URL from env if set; else try ngrok local API (when ngrok is already running); else start a new tunnel."""
    url = os.getenv("PUBLIC_URL") or os.getenv("NGROK_PUBLIC_URL")
    if url:
        return url.rstrip("/")
    try:
        import urllib.request
        with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as resp:
            data = json.load(resp)
        for t in data.get("tunnels", []):
            addr = t.get("config", {}).get("addr", "")
            if f":{port}" in addr or addr == str(port):
                return t.get("public_url", "").rstrip("/")
        if data.get("tunnels"):
            return data["tunnels"][0].get("public_url", "").rstrip("/")
    except Exception:
        pass
    return ngrok.connect(port).public_url.rstrip("/")


def main(prompt, PORT=3001):
    public_url = get_public_url(PORT)
    print(f"Using public URL for tools: {public_url}")

    client = ElevenLabs(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
    )
    
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    phone = os.getenv("TWILIO_PHONE_NUMBER")
    to_number = os.getenv("TO_NUMBER")
    
    
    system_prompt = prompt + f"""

        Your process:
        1. Introduce yourself politely as calling on behalf of a client.
        2. Ask for available slots for the requested service.
        3. When the receptionist suggests a time, say "One moment, let me check the calendar" (or similar), before using the 'check_availability' tool. Do not say the slot is booked or confirmed yet.
        4. If the tool says the day is free: tell them Nora is free, then ASK the receptionist to confirm: e.g. "Could you please confirm the booking for [date] at [time]?" Then STOP and wait for their reply. Do NOT call 'book_slot' in this same turn.
        5. Only after the other person has said "yes", "confirmed", "that works", or similar: say "One moment while I secure that" (or similar), then call 'book_slot' ONCE. Only after the tool returns success may you say "Perfect, it's booked" or "Done, the appointment is confirmed."
        6. If the tool says there are existing events, politely say you need a different time and ask for the next available slot. Do NOT book a slot you said was unavailable.
        7. CRITICAL — Never say the appointment is booked or confirmed until you have (a) heard the other party confirm, and (b) successfully called 'book_slot' and got a success response. Do not say "it's booked" or "perfect" before both steps.
        8. CRITICAL — Dates and times: Always use the CURRENT YEAR in all tool calls (e.g. 2026-02-09). Never use a past year.
        9. CRITICAL — Only state calendar facts that appear in the tool response. Never invent conflicts or "Nora has an appointment that ends at X" unless the tool explicitly said so.

        Clarifying questions (when information is missing):
        - If the receptionist gives a time without a date (e.g. "11am"), ask once: "And which day would that be?"
        - If they say "next week" or "tomorrow" without a specific day, confirm: "Just to confirm, is that [date]?"
        - If you need business hours to validate a slot, use the 'provider_lookup' tool; if not in the directory, use what they said and do not invent hours.
        - If the client cares about distance, use the 'distance' tool with origin and destination when relevant; otherwise keep the call focused on booking.

        Negotiation (adapt dynamically):
        - If the first suggested time doesn't work (calendar busy), ask for the next available slot and run 'check_availability' again.
        - If they offer multiple slots, check the calendar for the first one; if busy, try the next without making the receptionist repeat.
        - Prefer morning slots if the client has a preference (from context); otherwise accept any confirmed slot that fits the calendar.
        - Do not book outside business hours: use provider_lookup or Knowledge Base for hours; if unknown, assume 9am–5pm.
        
        Guidelines:
        - Navigate receptionist interaction naturally.
        - Aim to reply quickly; use filling words or ask for a moment while you check if needed.
        - Do not book appointments outside of business working hours. Use provider_lookup or Knowledge Base for hours; if not provided, assume 9am to 5pm.
        - Be professional, concise, and friendly.
        - If user switches to a different language, use the 'language_detection' tool to switch to the language the other person is speaking.

    """

    #agent tools:
        
    # ElevenLabs requires tool type discriminator "type": "webhook" for server/webhook tools
    availability_tool = {
        "type": "webhook",
        "name": "check_availability",
        "description": "Checks the user's calendar for free and busy slots on a specific date. ALWAYS use this before proposing a time.",
        "api_schema": {
            "url": f"{public_url}/api/calendar/check-availability",
            "method": "POST",
            "request_body_schema": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Target date in YYYY-MM-DD. Use the CURRENT year (e.g. 2026-02-09 for Feb 9 in 2026). If not provided, assumes today."
                    }
                }
            }
        }
    }

    booking_tool = {
        "type": "webhook",
        "name": "book_slot",
        "description": "Books a confirmed appointment on the user's calendar. Call ONLY ONCE per agreed slot, and ONLY after the other party confirmed. Use CURRENT year in dates (e.g. 2026-02-09T14:00:00).",
        "api_schema": {
            "url": f"{public_url}/api/calendar/book-slot",
            "method": "POST",
            "request_body_schema": {
                "type": "object",
                "properties": {
                    "start_time": {
                        "type": "string",
                        "description": "Start in ISO format with CURRENT year (e.g. 2026-02-09T14:00:00)"
                    },
                    "end_time": {
                        "type": "string",
                        "description": "End in ISO format (e.g. 2026-02-09T15:00:00). Optional; default 1 hour."
                    },
                    "title": {"type": "string", "description": "Title of the appointment"},
                    "description": {"type": "string", "description": "Context notes"}
                },
                "required": ["start_time"]
            }
        }
    }

    # System tools: update internal state, no external API calls (https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools)
    end_call_tool = {
        "type": "system",
        "name": "end_call",
        "description": "End the call when the main task is done, the conversation has reached a natural conclusion, or the other party wants to hang up. Provide a brief farewell before ending.",
    }

    skip_turn_tool = {
        "type": "system",
        "name": "skip_turn",
        "description": "Stay silent and wait for the other person to speak. Use when they say 'give me a second', 'let me check', or 'need a moment to think.'",
    }
    language_detection_tool = {
        "type": "system",
        "name": "language_detection",
        "description": "Switch to the language the other person is speaking. Use when they speak a different language or ask to switch language.",
    }

    language_presets = {
        "ar": {
            "overrides": {
                "agent": {
                    "language": "ar" 
                }
            }
        },
        "fr": {
            "overrides": {
                "agent": {
                    "language": "fr"
                }
            }
        },
        "de": {
            "overrides": {
                "agent": {
                    "language": "fr"
                }
            }
        }
        # You can add more: 'de' (German), 'it' (Italian), 'pt' (Portuguese), etc.
    }

    voicemail_detection_tool = {
        "type": "system",
        "name": "voicemail_detection",
        "description": "Use when an automated voicemail greeting is detected (no human on the line). Optionally leave a short message with your name and callback request.",
    }

    all_tools = [
        availability_tool,
        booking_tool,
        end_call_tool,
        skip_turn_tool,
        language_detection_tool,
        voicemail_detection_tool,
    ]
    
    agent = get_or_create_agent(client, system_prompt, all_tools)
    agent_id = agent.agent_id if hasattr(agent, "agent_id") else agent

    agent_phone_number_id = import_phone_number(client, phone, sid, token)
    make_call(client, agent_id, agent_phone_number_id, to_number)



if __name__ == "__main__":
    # ngrok exposes your local server so ElevenLabs can call your tool URLs (server must be running on PORT)
    
    prompt = "You are a booking agent for a dental clinic. You are calling to book an appointment for a client (Client Name: Nora, age 30, request: dental check-up). You are speaking in English."
    main(prompt)
    # main()
    
    # print(f"Public URL for tools: {public_url}")
    # my_agent = get_or_create_agent(public_url)
    # print(f"Agent ID to use in your app: {my_agent.agent_id}")
