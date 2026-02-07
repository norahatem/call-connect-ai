import { TranscriptLine, CallStatus } from '@/types';

const aiGreetings = [
  "Hello, this is an AI assistant calling on behalf of {user}.",
  "Hi there, I'm an AI calling for {user}.",
  "Good day, this is an automated assistant calling on behalf of {user}."
];

const aiRequests = [
  "I'm inquiring about scheduling a {service} appointment.",
  "I'd like to check your availability for a {service} service.",
  "We're looking to book a {service} appointment."
];

const aiTimePreferences = {
  morning: "Preferably in the morning hours.",
  afternoon: "We'd prefer an afternoon slot if available.",
  evening: "An evening appointment would be ideal.",
  flexible: "We're flexible with timing."
};

const providerResponses = [
  { 
    type: 'success',
    lines: [
      "Yes, we can help with that.",
      "Let me check our schedule... We have an opening {slot}.",
      "Would that work for you?"
    ],
    confirmation: "Great, I'll book that appointment. The confirmation number is {code}."
  },
  {
    type: 'busy',
    lines: [
      "Thanks for calling. Unfortunately, we're fully booked this week.",
      "We don't have any openings until next month."
    ]
  },
  {
    type: 'closed',
    lines: [
      "We're currently closed. Our business hours are Monday through Friday, 9 AM to 5 PM.",
      "Please call back during regular hours."
    ]
  },
  {
    type: 'no_service',
    lines: [
      "I'm sorry, but we don't offer that particular service.",
      "You might want to try another provider in the area."
    ]
  }
];

const availableSlots = [
  "tomorrow at 10:00 AM",
  "tomorrow at 2:00 PM",
  "tomorrow at 4:30 PM",
  "the day after tomorrow at 9:00 AM",
  "this Friday at 11:00 AM",
  "next Monday at 3:00 PM"
];

function generateConfirmationCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  let code = '';
  for (let i = 0; i < 2; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += numbers[Math.floor(Math.random() * numbers.length)];
  return code;
}

function getSlotAsDate(slotText: string): Date {
  const now = new Date();
  if (slotText.includes('tomorrow')) {
    now.setDate(now.getDate() + 1);
  } else if (slotText.includes('day after tomorrow')) {
    now.setDate(now.getDate() + 2);
  } else if (slotText.includes('Friday')) {
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    now.setDate(now.getDate() + daysUntilFriday);
  } else if (slotText.includes('Monday')) {
    const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
    now.setDate(now.getDate() + daysUntilMonday);
  }
  
  // Parse time
  const timeMatch = slotText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const isPM = timeMatch[3].toUpperCase() === 'PM';
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    now.setHours(hours, minutes, 0, 0);
  }
  
  return now;
}

export interface CallSimulationResult {
  status: CallStatus;
  transcript: TranscriptLine[];
  availableSlot?: Date;
  confirmationCode?: string;
  failureReason?: string;
  duration: number;
}

export function simulateCall(
  service: string,
  userName: string,
  timePreference: string,
  details: string
): CallSimulationResult {
  // Determine outcome (60% success, 40% failure)
  const roll = Math.random();
  const isSuccess = roll < 0.6;
  const failureType = roll < 0.75 ? 'busy' : roll < 0.9 ? 'no_answer' : 'closed';
  
  const transcript: TranscriptLine[] = [];
  let currentTime = 0;
  
  // AI greeting
  const greeting = aiGreetings[Math.floor(Math.random() * aiGreetings.length)]
    .replace('{user}', userName);
  transcript.push({ speaker: 'ai', text: greeting, timestamp: currentTime });
  currentTime += 3000;
  
  // AI request
  const request = aiRequests[Math.floor(Math.random() * aiRequests.length)]
    .replace('{service}', service);
  transcript.push({ speaker: 'ai', text: request, timestamp: currentTime });
  currentTime += 3500;
  
  // Time preference
  const timePref = aiTimePreferences[timePreference as keyof typeof aiTimePreferences] || aiTimePreferences.flexible;
  transcript.push({ speaker: 'ai', text: timePref, timestamp: currentTime });
  currentTime += 2000;
  
  // Additional details if provided
  if (details) {
    transcript.push({ speaker: 'ai', text: `Additional context: ${details}`, timestamp: currentTime });
    currentTime += 3000;
  }
  
  if (isSuccess) {
    const successResponse = providerResponses[0];
    const slot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
    const confirmCode = generateConfirmationCode();
    
    for (const line of successResponse.lines) {
      transcript.push({ 
        speaker: 'provider', 
        text: line.replace('{slot}', slot), 
        timestamp: currentTime 
      });
      currentTime += 4000;
    }
    
    transcript.push({ speaker: 'ai', text: "Yes, that works perfectly. Thank you!", timestamp: currentTime });
    currentTime += 2500;
    
    transcript.push({ 
      speaker: 'provider', 
      text: successResponse.confirmation!.replace('{code}', confirmCode),
      timestamp: currentTime 
    });
    currentTime += 3500;
    
    transcript.push({ speaker: 'ai', text: "Thank you for your help. Have a great day!", timestamp: currentTime });
    currentTime += 2000;
    
    return {
      status: 'success',
      transcript,
      availableSlot: getSlotAsDate(slot),
      confirmationCode: confirmCode,
      duration: Math.floor(currentTime / 1000)
    };
  } else if (failureType === 'no_answer') {
    return {
      status: 'no_answer',
      transcript: [],
      failureReason: 'No answer after 30 seconds',
      duration: 30
    };
  } else {
    const response = failureType === 'busy' ? providerResponses[1] : providerResponses[2];
    
    for (const line of response.lines) {
      transcript.push({ speaker: 'provider', text: line, timestamp: currentTime });
      currentTime += 4000;
    }
    
    transcript.push({ 
      speaker: 'ai', 
      text: "I understand. Thank you for your time.", 
      timestamp: currentTime 
    });
    currentTime += 2000;
    
    return {
      status: 'failed',
      transcript,
      failureReason: failureType === 'busy' ? 'Fully booked' : 'Business closed',
      duration: Math.floor(currentTime / 1000)
    };
  }
}
