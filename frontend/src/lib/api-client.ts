/**
 * Central REST client for the FastAPI backend.
 * 
 * Reads VITE_BACKEND_URL from env and attaches the Supabase JWT
 * as an Authorization header on every request.
 */

import { supabase } from '@/integrations/supabase/client';

const BACKEND = import.meta.env.VITE_BACKEND_URL;

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiCall<T = unknown>(
  path: string,
  options?: RequestInit & { rawResponse?: boolean },
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  if (options?.rawResponse) return res as unknown as T;
  return res.json() as Promise<T>;
}

function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiCall<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

// ---------------------------------------------------------------------------
// AI endpoints
// ---------------------------------------------------------------------------

export const ai = {
  orchestrate: (body: {
    service: string;
    providerName: string;
    userName: string;
    purpose?: string;
    details?: string;
    timePreference?: string;
    conversationHistory?: unknown[];
  }) => post<{ message: string; intent: string }>('/api/ai/orchestrate', body),

  simulateResponse: (body: {
    service: string;
    providerName: string;
    aiMessage: string;
    conversationHistory?: unknown[];
    timePreference?: string;
  }) =>
    post<{
      response: string;
      status: string;
      availableSlot?: string;
      confirmationCode?: string;
    }>('/api/ai/simulate-response', body),

  textChat: (body: {
    receptionistMessage?: string;
    provider: unknown;
    user: unknown;
    conversationHistory: unknown[];
    toolResults?: unknown[];
  }) => post<{ agentResponse: string; toolCalls: unknown[] }>('/api/ai/text-chat', body),

  analyzeIntake: (body: { service: string; userInput?: string }) =>
    post<{
      category: string;
      extractedInfo: Record<string, string>;
      missingFields: unknown[];
      optionalFields: unknown[];
      allFields: unknown[];
    }>('/api/ai/analyze-intake', body),

  generateIntakeExample: (body: { service: string }) =>
    post<{ example: string }>('/api/ai/generate-intake-example', body),

  generateCallScript: (body: {
    service: string;
    providerName: string;
    userName: string;
    purpose?: string;
    details?: string;
    timePreference?: string;
  }) => post<{ script: unknown }>('/api/ai/generate-call-script', body),
};

// ---------------------------------------------------------------------------
// ElevenLabs endpoints
// ---------------------------------------------------------------------------

export const elevenlabs = {
  /** Returns a raw Response with audio/mpeg content. */
  tts: async (body: { text: string; speaker?: string }): Promise<Response> => {
    const token = await getToken();
    const res = await fetch(`${BACKEND}/api/elevenlabs/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
    return res;
  },

  conversationToken: (body: { agentId: string; context?: unknown }) =>
    post<{ signed_url: string }>('/api/elevenlabs/conversation-token', body),

  scribeToken: () => post<{ token: string }>('/api/elevenlabs/scribe-token', {}),
};

// ---------------------------------------------------------------------------
// Twilio endpoints
// ---------------------------------------------------------------------------

export const twilio = {
  verifyPhone: (body: { action: string; phoneNumber?: string; code?: string }) =>
    post<{
      success: boolean;
      alreadyVerified?: boolean;
      validationCode?: string;
      callSid?: string;
      verified?: boolean;
      callerIdSid?: string;
      callerIds?: unknown[];
      message?: string;
    }>('/api/twilio/verify-phone', body),

  testCall: (body: {
    toNumber: string;
    providerName?: string;
    service?: string;
    userName?: string;
    purpose?: string;
    details?: string;
    timePreference?: string;
  }) =>
    post<{
      success: boolean;
      callSid?: string;
      status?: string;
      from?: string;
      to?: string;
      message?: string;
      error?: string;
    }>('/api/twilio/test-call', body),

  makeCall: (body: {
    toNumber: string;
    fromNumber: string;
    providerName: string;
    service: string;
    userName: string;
    purpose: string;
    details?: string;
    timePreference?: string;
  }) =>
    post<{ success: boolean; callSid?: string; status?: string; message?: string }>(
      '/api/twilio/make-call',
      body,
    ),
};

// ---------------------------------------------------------------------------
// Calendar endpoints
// ---------------------------------------------------------------------------

export const calendar = {
  checkAvailability: (body: { date?: string; time_min?: string; time_max?: string }) =>
    post<{
      success: boolean;
      date: string;
      busy_slots: Array<{ summary: string; start: string; end: string }>;
      message: string;
    }>('/api/calendar/check-availability', body),

  bookSlot: (body: {
    title?: string;
    start_time: string;
    end_time?: string;
    description?: string;
  }) =>
    post<{
      success: boolean;
      event_id?: string;
      message: string;
      start?: string;
      end?: string;
      error?: string;
    }>('/api/calendar/book-slot', body),
};

// ---------------------------------------------------------------------------
// Profile endpoints
// ---------------------------------------------------------------------------

export const profiles = {
  get: () => apiCall<Record<string, unknown>>('/api/profiles/me'),
  update: (body: { full_name?: string; date_of_birth?: string }) =>
    apiCall<{ success: boolean }>('/api/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const health = () => apiCall<{ status: string }>('/health');
