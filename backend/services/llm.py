"""Async client for OpenAI chat completions API with retry-on-429."""

import os
import json
import asyncio
import httpx
from fastapi import HTTPException

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

# Model mapping: callers still pass the old Lovable/Google model names,
# but we transparently route to OpenAI equivalents.
_MODEL_MAP = {
    "google/gemini-2.5-flash": "gpt-4o-mini",
    "google/gemini-3-flash-preview": "gpt-4o-mini",
}

MAX_RETRIES = 4
INITIAL_BACKOFF = 2  # seconds


def _api_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured in backend/.env -- add it and restart the server",
        )
    return key


def _resolve_model(model: str) -> str:
    return _MODEL_MAP.get(model, model)


async def chat_completion(
    *,
    model: str = "gpt-4o-mini",
    messages: list[dict],
    tools: list[dict] | None = None,
    tool_choice: dict | None = None,
    response_format: dict | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> dict:
    """Call OpenAI and return the raw response dict. Retries on 429 with exponential backoff."""
    resolved = _resolve_model(model)
    body: dict = {"model": resolved, "messages": messages}
    if tools:
        body["tools"] = tools
    if tool_choice:
        body["tool_choice"] = tool_choice
    if response_format:
        body["response_format"] = response_format
    if max_tokens is not None:
        body["max_tokens"] = max_tokens
    if temperature is not None:
        body["temperature"] = temperature

    last_resp = None
    for attempt in range(MAX_RETRIES + 1):
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {_api_key()}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        last_resp = resp

        if resp.status_code != 429:
            break

        # 429 -- wait and retry
        if attempt < MAX_RETRIES:
            retry_after = resp.headers.get("retry-after")
            if retry_after:
                wait = float(retry_after)
            else:
                wait = INITIAL_BACKOFF * (2 ** attempt)
            print(f"[LLM] Rate-limited by OpenAI, retrying in {wait:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
            await asyncio.sleep(wait)

    if last_resp is None:
        raise HTTPException(status_code=502, detail="No response from OpenAI")

    if last_resp.status_code == 429:
        raise HTTPException(status_code=429, detail="OpenAI rate limit exceeded after retries. Wait a moment and try again.")
    if last_resp.status_code == 402:
        raise HTTPException(status_code=402, detail="AI credits exhausted")
    if not last_resp.is_success:
        detail = last_resp.text[:500] if last_resp.text else str(last_resp.status_code)
        raise HTTPException(status_code=502, detail=f"OpenAI API error ({last_resp.status_code}): {detail}")

    return last_resp.json()


async def chat_with_tool(
    *,
    model: str = "gpt-4o-mini",
    messages: list[dict],
    tool_name: str,
    tool_description: str,
    tool_parameters: dict,
) -> dict:
    """Convenience: call LLM with a single forced tool and return the parsed arguments."""
    data = await chat_completion(
        model=model,
        messages=messages,
        tools=[
            {
                "type": "function",
                "function": {
                    "name": tool_name,
                    "description": tool_description,
                    "parameters": tool_parameters,
                },
            }
        ],
        tool_choice={"type": "function", "function": {"name": tool_name}},
    )

    tool_call = (data.get("choices") or [{}])[0].get("message", {}).get("tool_calls", [None])[0]
    if not tool_call:
        raise HTTPException(status_code=502, detail="No tool call in AI response")

    return json.loads(tool_call["function"]["arguments"])


async def chat_json(
    *,
    model: str = "gpt-4o-mini",
    messages: list[dict],
) -> dict:
    """Convenience: call LLM with response_format=json_object and return parsed JSON."""
    data = await chat_completion(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
    )

    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    # Clean potential markdown fencing
    cleaned = content.replace("```json", "").replace("```", "").strip()
    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}")
    if json_start != -1 and json_end != -1:
        cleaned = cleaned[json_start : json_end + 1]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"raw": content}
