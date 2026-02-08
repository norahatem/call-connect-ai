export type CallStatus = 'queued' | 'dialing' | 'connected' | 'in_progress' | 'success' | 'failed' | 'no_answer' | 'cancelled';
export type SearchStatus = 'pending' | 'discovering' | 'calling' | 'completed' | 'cancelled';
export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  phone?: string;
  phone_verified: boolean;
  calendar_connected: boolean;
  full_name?: string | null;
  date_of_birth?: string | null; // dd/mm/yyyy
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  search_id: string;
  name: string;
  phone: string;
  rating: number;
  review_count: number;
  distance: number;
  address: string;
  created_at: string;
}

export interface Search {
  id: string;
  user_id: string;
  service: string;
  location: string;
  preferences: {
    purpose?: string;
    details?: string;
    time_preference?: string;
  };
  status: SearchStatus;
  created_at: string;
}

export interface TranscriptLine {
  speaker: 'ai' | 'provider';
  text: string;
  timestamp: number;
}

export interface Call {
  id: string;
  search_id: string;
  provider_id: string;
  status: CallStatus;
  transcript: TranscriptLine[];
  result?: {
    outcome: string;
    notes?: string;
  };
  available_slot?: string;
  duration: number;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
  provider?: Provider;
}

export interface Booking {
  id: string;
  user_id: string;
  call_id: string;
  provider_id: string;
  appointment_time: string;
  confirmation_code: string;
  calendar_added: boolean;
  status: BookingStatus;
  created_at: string;
  provider?: Provider;
  call?: Call;
}

export interface CallContextData {
  purpose: 'new_appointment' | 'reschedule' | 'general_inquiry';
  details: string;
  time_preference: 'morning' | 'afternoon' | 'evening' | 'flexible';
}
