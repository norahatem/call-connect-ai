export type CallStatus = 'queued' | 'dialing' | 'connected' | 'in_progress' | 'success' | 'failed' | 'no_answer' | 'cancelled';
export type SearchStatus = 'pending' | 'discovering' | 'calling' | 'completed' | 'cancelled';
export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';
export type BookingMode = 'single' | 'multi';
export type SearchStage = 'discovery' | 'ranking' | 'confirmation' | 'booking' | 'completed';

// IVR and Call Phase Types
export type CallPhase = 
  | 'connecting' 
  | 'ivr_detected' 
  | 'navigating_menu' 
  | 'talking_to_human' 
  | 'negotiating' 
  | 'finalizing'
  | 'completed';

export type AnswerType = 'human' | 'machine' | 'unknown';

export interface IVREvent {
  id: string;
  timestamp: number;
  type: 'menu_detected' | 'dtmf_sent' | 'option_selected' | 'routing' | 'human_reached' | 'timeout' | 'error';
  message: string;
  digit?: string;
  menuLevel?: number;
}

export interface CalendarSlot {
  start: Date;
  end: Date;
  isPreferred: boolean;
}

export interface EnhancedCallState {
  phase: CallPhase;
  answerType: AnswerType;
  ivrEvents: IVREvent[];
  dtmfEnabled: boolean;
  prioritySlots: CalendarSlot[];
  isEmergencyTakeover: boolean;
  menuDepth: number;
  matchedSlot?: string;
}

export interface VoicePreference {
  gender: 'male' | 'female' | 'neutral';
  accent: 'neutral' | 'british' | 'american' | 'australian' | 'indian';
}

export interface ScoringWeight {
  id: string;
  criterion: string;
  weight: number; // 1-10
}

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

export interface RankedResult {
  provider_id: string;
  provider_name: string;
  ai_score: number;
  available_slot?: string;
  notes?: string;
  user_selected?: boolean;
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
    category?: string;
    intake_data?: Record<string, string>;
  };
  status: SearchStatus;
  booking_mode: BookingMode;
  stage: SearchStage;
  additional_requirements?: string;
  voice_preference: VoicePreference;
  scoring_weights: ScoringWeight[];
  ranked_results: RankedResult[];
  created_at: string;
}

export interface TranscriptLine {
  speaker: 'ai' | 'provider';
  text: string;
  timestamp: number;
  isSlotMatch?: boolean; // Highlight when AI identifies matching calendar slot
  matchedSlotTime?: string;
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
  ai_score?: number;
  user_selected?: boolean;
  created_at: string;
  updated_at: string;
  provider?: Provider;
  // Enhanced IVR fields
  phase?: CallPhase;
  answer_type?: AnswerType;
  ivr_events?: IVREvent[];
  is_emergency_takeover?: boolean;
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
