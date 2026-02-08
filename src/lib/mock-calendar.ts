// Mock calendar service - simulates Google Calendar availability
// Will be replaced with real Google Calendar API integration later

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

// Simulated existing calendar events
const mockEvents: CalendarEvent[] = [
  {
    id: '1',
    title: 'Team Meeting',
    start: new Date(Date.now() + 1000 * 60 * 60 * 10), // 10 hours from now
    end: new Date(Date.now() + 1000 * 60 * 60 * 11),
  },
  {
    id: '2',
    title: 'Lunch',
    start: new Date(Date.now() + 1000 * 60 * 60 * 24 + 1000 * 60 * 60 * 12), // Tomorrow noon
    end: new Date(Date.now() + 1000 * 60 * 60 * 24 + 1000 * 60 * 60 * 13),
  },
];

/**
 * Check if a specific time slot is available
 */
export function checkAvailability(proposedStart: Date, proposedEnd: Date): {
  available: boolean;
  conflictingEvent?: CalendarEvent;
} {
  for (const event of mockEvents) {
    // Check for overlap
    if (proposedStart < event.end && proposedEnd > event.start) {
      return { available: false, conflictingEvent: event };
    }
  }
  return { available: true };
}

/**
 * Get available slots for a given day
 */
export function getAvailableSlots(date: Date, durationMinutes: number = 60): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayStart = new Date(date);
  dayStart.setHours(9, 0, 0, 0); // Business hours start at 9 AM
  
  const dayEnd = new Date(date);
  dayEnd.setHours(17, 0, 0, 0); // Business hours end at 5 PM

  let current = new Date(dayStart);
  
  while (current < dayEnd) {
    const slotEnd = new Date(current.getTime() + durationMinutes * 60 * 1000);
    if (slotEnd > dayEnd) break;

    const { available } = checkAvailability(current, slotEnd);
    slots.push({
      start: new Date(current),
      end: new Date(slotEnd),
      available,
    });

    current = new Date(current.getTime() + 30 * 60 * 1000); // 30 min intervals
  }

  return slots;
}

/**
 * Book an appointment - adds to mock calendar
 */
export function bookAppointment(
  title: string,
  start: Date,
  end: Date,
  provider: string,
  confirmationCode: string
): { success: boolean; event?: CalendarEvent; error?: string } {
  const { available, conflictingEvent } = checkAvailability(start, end);
  
  if (!available) {
    return {
      success: false,
      error: `Time conflicts with existing event: ${conflictingEvent?.title}`,
    };
  }

  const newEvent: CalendarEvent = {
    id: crypto.randomUUID(),
    title,
    start,
    end,
    provider,
    confirmationCode,
  };

  mockEvents.push(newEvent);
  
  return { success: true, event: newEvent };
}

/**
 * Parse a natural language date/time into a Date object
 */
export function parseTimeSlot(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase();

  // Handle relative days
  let targetDate = new Date(now);
  
  if (lowerText.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lowerText.includes('day after tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (lowerText.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  }

  // Handle time of day
  const timePatterns = [
    { pattern: /(\d{1,2}):(\d{2})\s*(am|pm)/i, handler: (m: RegExpMatchArray) => {
      let hours = parseInt(m[1]);
      const minutes = parseInt(m[2]);
      if (m[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
      if (m[3].toLowerCase() === 'am' && hours === 12) hours = 0;
      return { hours, minutes };
    }},
    { pattern: /(\d{1,2})\s*(am|pm)/i, handler: (m: RegExpMatchArray) => {
      let hours = parseInt(m[1]);
      if (m[2].toLowerCase() === 'pm' && hours !== 12) hours += 12;
      if (m[2].toLowerCase() === 'am' && hours === 12) hours = 0;
      return { hours, minutes: 0 };
    }},
    { pattern: /(\d{1,2})(:(\d{2}))?/i, handler: (m: RegExpMatchArray) => {
      let hours = parseInt(m[1]);
      const minutes = m[3] ? parseInt(m[3]) : 0;
      // Assume PM for business hours
      if (hours < 9 && hours !== 0) hours += 12;
      return { hours, minutes };
    }},
  ];

  for (const { pattern, handler } of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const { hours, minutes } = handler(match);
      targetDate.setHours(hours, minutes, 0, 0);
      return targetDate;
    }
  }

  // Default to morning/afternoon/evening
  if (lowerText.includes('morning')) {
    targetDate.setHours(10, 0, 0, 0);
  } else if (lowerText.includes('afternoon')) {
    targetDate.setHours(14, 0, 0, 0);
  } else if (lowerText.includes('evening')) {
    targetDate.setHours(17, 0, 0, 0);
  } else {
    // Default to 10 AM tomorrow if no time specified
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(10, 0, 0, 0);
  }

  return targetDate;
}

/**
 * Format a date for display
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
