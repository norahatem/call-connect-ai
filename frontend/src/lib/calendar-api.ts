// Real calendar API client - calls the FastAPI backend for Google Calendar operations

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// ---------------------------------------------------------------------------
// Types (kept from mock-calendar.ts for compatibility)
// ---------------------------------------------------------------------------

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  provider?: string;
  confirmationCode?: string;
}

interface BusySlot {
  summary: string;
  start: string;
  end: string;
}

interface AvailabilityResponse {
  success: boolean;
  date: string;
  busy_slots: BusySlot[];
  message: string;
}

interface BookingResponse {
  success: boolean;
  event_id?: string;
  message: string;
  start?: string;
  end?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

async function backendFetch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Backend ${path} failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a specific time slot is available by querying the FastAPI backend.
 * Returns the same shape the old mock returned so callers don't break.
 */
export async function checkAvailability(
  proposedStart: Date,
  proposedEnd: Date,
): Promise<{ available: boolean; conflictingEvent?: CalendarEvent }> {
  const dateStr = proposedStart.toISOString().split('T')[0]; // YYYY-MM-DD

  const data = await backendFetch<AvailabilityResponse>(
    '/api/calendar/check-availability',
    {
      date: dateStr,
      time_min: proposedStart.toISOString(),
      time_max: proposedEnd.toISOString(),
    },
  );

  // Check if any busy slot overlaps the proposed window
  for (const slot of data.busy_slots) {
    const busyStart = new Date(slot.start);
    const busyEnd = new Date(slot.end);
    if (proposedStart < busyEnd && proposedEnd > busyStart) {
      return {
        available: false,
        conflictingEvent: {
          id: '',
          title: slot.summary,
          start: busyStart,
          end: busyEnd,
        },
      };
    }
  }

  return { available: true };
}

/**
 * Get available slots for a given day (business hours 9-17, 30-min intervals).
 * Fetches busy slots from the backend then computes gaps client-side.
 */
export async function getAvailableSlots(
  date: Date,
  durationMinutes: number = 60,
): Promise<TimeSlot[]> {
  const dateStr = date.toISOString().split('T')[0];

  const dayStart = new Date(date);
  dayStart.setHours(9, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(17, 0, 0, 0);

  const data = await backendFetch<AvailabilityResponse>(
    '/api/calendar/check-availability',
    {
      date: dateStr,
      time_min: dayStart.toISOString(),
      time_max: dayEnd.toISOString(),
    },
  );

  // Build busy intervals
  const busyIntervals = data.busy_slots.map((s) => ({
    start: new Date(s.start),
    end: new Date(s.end),
  }));

  const slots: TimeSlot[] = [];
  let current = new Date(dayStart);

  while (current < dayEnd) {
    const slotEnd = new Date(current.getTime() + durationMinutes * 60 * 1000);
    if (slotEnd > dayEnd) break;

    const overlaps = busyIntervals.some(
      (b) => current < b.end && slotEnd > b.start,
    );

    slots.push({
      start: new Date(current),
      end: new Date(slotEnd),
      available: !overlaps,
    });

    current = new Date(current.getTime() + 30 * 60 * 1000); // 30 min step
  }

  return slots;
}

/**
 * Book an appointment via the FastAPI backend (Google Calendar).
 */
export async function bookAppointment(
  title: string,
  start: Date,
  end: Date,
  provider: string,
  confirmationCode: string,
): Promise<{ success: boolean; event?: CalendarEvent; error?: string }> {
  const data = await backendFetch<BookingResponse>('/api/calendar/book-slot', {
    title,
    start_time: start.toISOString().replace('Z', ''), // backend expects no trailing Z
    end_time: end.toISOString().replace('Z', ''),
    description: `Provider: ${provider} | Confirmation: ${confirmationCode}`,
  });

  if (data.success) {
    return {
      success: true,
      event: {
        id: data.event_id ?? crypto.randomUUID(),
        title,
        start,
        end,
        provider,
        confirmationCode,
      },
    };
  }

  return { success: false, error: data.error || data.message };
}

/**
 * Fetch all calendar events for today (convenience wrapper).
 */
export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const data = await backendFetch<AvailabilityResponse>(
    '/api/calendar/check-availability',
    { date: dateStr },
  );

  return data.busy_slots.map((s, i) => ({
    id: String(i),
    title: s.summary,
    start: new Date(s.start),
    end: new Date(s.end),
  }));
}

/**
 * Quick health-check against the backend.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const data = await backendFetch<{ status: string }>('/health');
    return data.status === 'ok';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pure client-side utilities (kept here so the import path stays the same)
// ---------------------------------------------------------------------------

/**
 * Parse a natural language date/time into a Date object.
 */
export function parseTimeSlot(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase();

  let targetDate = new Date(now);

  if (lowerText.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lowerText.includes('day after tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (lowerText.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  }

  const timePatterns = [
    {
      pattern: /(\d{1,2}):(\d{2})\s*(am|pm)/i,
      handler: (m: RegExpMatchArray) => {
        let hours = parseInt(m[1]);
        const minutes = parseInt(m[2]);
        if (m[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
        if (m[3].toLowerCase() === 'am' && hours === 12) hours = 0;
        return { hours, minutes };
      },
    },
    {
      pattern: /(\d{1,2})\s*(am|pm)/i,
      handler: (m: RegExpMatchArray) => {
        let hours = parseInt(m[1]);
        if (m[2].toLowerCase() === 'pm' && hours !== 12) hours += 12;
        if (m[2].toLowerCase() === 'am' && hours === 12) hours = 0;
        return { hours, minutes: 0 };
      },
    },
    {
      pattern: /(\d{1,2})(:(\d{2}))?/i,
      handler: (m: RegExpMatchArray) => {
        let hours = parseInt(m[1]);
        const minutes = m[3] ? parseInt(m[3]) : 0;
        if (hours < 9 && hours !== 0) hours += 12;
        return { hours, minutes };
      },
    },
  ];

  for (const { pattern, handler } of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const { hours, minutes } = handler(match);
      targetDate.setHours(hours, minutes, 0, 0);
      return targetDate;
    }
  }

  if (lowerText.includes('morning')) {
    targetDate.setHours(10, 0, 0, 0);
  } else if (lowerText.includes('afternoon')) {
    targetDate.setHours(14, 0, 0, 0);
  } else if (lowerText.includes('evening')) {
    targetDate.setHours(17, 0, 0, 0);
  } else {
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(10, 0, 0, 0);
  }

  return targetDate;
}

/**
 * Format a date for display.
 */
export function formatSlot(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
