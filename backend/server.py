from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def get_calendar_service():
    creds = Credentials(
        token=None,
        refresh_token=os.getenv("GOOGLE_REFRESH_TOKEN"),
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        token_uri="https://oauth2.googleapis.com/token"
    )
    return build("calendar", "v3", credentials=creds)

class AvailabilityRequest(BaseModel):
    date: str | None = None
    time_min: str | None = None
    time_max: str | None = None

class BookingRequest(BaseModel):
    title: str | None = None
    start_time: str  # AI sends "2024-02-09T11:00:00"
    end_time: str | None = None # We make this OPTIONAL now
    description: str | None = None
    provider_name: str | None = None
    appointment_type: str | None = None

@app.post("/check_calendar_availability")
async def check_availability(req: AvailabilityRequest):
    try:
        service = get_calendar_service()
        if req.date:
            try:
                target_date = datetime.fromisoformat(req.date.replace("Z", "").strip())
                target_date = _ensure_future_date(target_date)
            except ValueError:
                target_date = datetime.now()
        else:
            target_date = datetime.now()
        time_min = req.time_min or target_date.replace(hour=0, minute=0).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        time_max = req.time_max or target_date.replace(hour=23, minute=59).strftime("%Y-%m-%dT%H:%M:%S") + "Z"

        events = service.events().list(
            calendarId=os.getenv("CALENDAR_ID", "primary"),
            timeMin=time_min, timeMax=time_max,
            singleEvents=True, orderBy="startTime"
        ).execute()

        busy_slots = [{"summary": e.get("summary", "Busy"),
                       "start": e["start"].get("dateTime", e["start"].get("date")),
                       "end": e["end"].get("dateTime", e["end"].get("date"))}
                      for e in events.get("items", [])]

        msg = f"On {target_date.date().isoformat()}: {len(busy_slots)} existing event(s)." if busy_slots else f"On {target_date.date().isoformat()}: no events; day is free."
        return {"success": True, "date": target_date.date().isoformat(), "busy_slots": busy_slots, "message": msg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _ensure_future_date(dt: datetime) -> datetime:
    """If the parsed date is in the past, move to the same date in current year (or next year)."""
    now = datetime.now()
    if dt >= now:
        return dt
    # Same month/day in current year
    try:
        this_year = dt.replace(year=now.year)
        if this_year >= now:
            return this_year
    except ValueError:
        pass  # e.g. Feb 29 in non-leap year
    try:
        next_year = dt.replace(year=now.year + 1)
        return next_year
    except ValueError:
        return dt


@app.post("/book_calendar_slot")
async def book_slot(req: BookingRequest):
    try:
        service = get_calendar_service()
        
        # 1. Parse start time (AI often sends wrong year, e.g. 2024 instead of 2026)
        try:
            start_dt = datetime.fromisoformat(req.start_time.replace("Z", "").strip())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid start_time format: {req.start_time}")

        # 2. Ensure we don't book in the past: use current/next year if the date is old
        start_dt = _ensure_future_date(start_dt)

        # 3. End time
        if req.end_time:
            try:
                end_dt = datetime.fromisoformat(req.end_time.replace("Z", "").strip())
            except ValueError:
                end_dt = start_dt + timedelta(hours=1)
            end_dt = _ensure_future_date(end_dt)
        else:
            end_dt = start_dt + timedelta(hours=1)

        # 4. ISO for Google (use UTC explicitly so conflict check is consistent)
        final_start = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
        final_end = end_dt.strftime("%Y-%m-%dT%H:%M:%S")

        # 5. Check conflicts: only events that *overlap* this slot
        conflicts = service.events().list(
            calendarId=os.getenv("CALENDAR_ID", "primary"),
            timeMin=final_start + "Z",
            timeMax=final_end + "Z",
            singleEvents=True
        ).execute()

        items = conflicts.get("items") or []
        if items:
            summaries = [e.get("summary", "Busy") for e in items]
            return {
                "success": False,
                "error": "Time slot conflicts with an existing calendar event.",
                "message": f"Cannot book: calendar already has event(s) in this window: {', '.join(summaries)}."
            }

        # 6. Book it
        event = service.events().insert(
            calendarId=os.getenv("CALENDAR_ID", "primary"),
            body={
                "summary": req.title or "Dental Appointment",
                "description": req.description or "Booked via AI assistant",
                "start": {"dateTime": final_start + "Z", "timeZone": "UTC"},
                "end": {"dateTime": final_end + "Z", "timeZone": "UTC"}
            }
        ).execute()

        return {
            "success": True,
            "event_id": event["id"],
            "message": f"Booked for {final_start} to {final_end}.",
            "start": final_start,
            "end": final_end
        }
    except Exception as e:
        print(f"SERVER ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok"}
