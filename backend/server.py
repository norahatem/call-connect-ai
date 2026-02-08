"""FastAPI application entry point.

Mounts all routers and configures CORS.
Run with: uvicorn server:app --host 0.0.0.0 --port 3001 --reload
"""

import sys
from pathlib import Path

# Ensure the backend directory is on sys.path so local packages resolve correctly
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import ai, elevenlabs, twilio, calendar, profiles

app = FastAPI(title="CallConnect AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(ai.router)
app.include_router(elevenlabs.router)
app.include_router(twilio.router)
app.include_router(calendar.router)
app.include_router(profiles.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
