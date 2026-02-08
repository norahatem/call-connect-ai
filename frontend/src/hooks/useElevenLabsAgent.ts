import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  checkAvailability, 
  bookAppointment, 
  parseTimeSlot, 
  formatSlot,
  getAvailableSlots 
} from '@/lib/mock-calendar';
import { Provider, CallContextData, TranscriptLine } from '@/types';

interface AgentCallState {
  status: 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'ended';
  transcript: TranscriptLine[];
  duration: number;
  availableSlot?: Date;
  confirmationCode?: string;
  error?: string;
}

interface UseElevenLabsAgentOptions {
  agentId: string;
  onBookingConfirmed?: (slot: Date, confirmationCode: string) => void;
  onCallEnded?: (state: AgentCallState) => void;
}

export function useElevenLabsAgent(options: UseElevenLabsAgentOptions) {
  const { agentId, onBookingConfirmed, onCallEnded } = options;
  
  const [callState, setCallState] = useState<AgentCallState>({
    status: 'idle',
    transcript: [],
    duration: 0,
  });
  
  const startTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentProviderRef = useRef<Provider | null>(null);
  const contextRef = useRef<CallContextData | null>(null);

  // Client tools that the ElevenLabs agent can call
  const clientTools = {
    check_availability: async (params: { proposed_time: string }) => {
      const proposedDate = parseTimeSlot(params.proposed_time);
      if (!proposedDate) {
        return JSON.stringify({ 
          available: false, 
          error: 'Could not parse the proposed time' 
        });
      }

      const endDate = new Date(proposedDate.getTime() + 60 * 60 * 1000); // 1 hour appointment
      const result = checkAvailability(proposedDate, endDate);
      
      if (result.available) {
        return JSON.stringify({ 
          available: true, 
          slot: formatSlot(proposedDate),
          message: `The user is available at ${formatSlot(proposedDate)}`
        });
      } else {
        // Get alternative slots
        const alternatives = getAvailableSlots(proposedDate, 60)
          .filter(s => s.available)
          .slice(0, 3)
          .map(s => formatSlot(s.start));
        
        return JSON.stringify({ 
          available: false, 
          conflict: result.conflictingEvent?.title,
          alternatives,
          message: `The user has a conflict. Available alternatives: ${alternatives.join(', ')}`
        });
      }
    },

    confirm_booking: async (params: { 
      appointment_time: string; 
      confirmation_code?: string;
    }) => {
      const provider = currentProviderRef.current;
      if (!provider) {
        return JSON.stringify({ success: false, error: 'No provider context' });
      }

      const appointmentDate = parseTimeSlot(params.appointment_time);
      if (!appointmentDate) {
        return JSON.stringify({ success: false, error: 'Invalid time format' });
      }

      const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000);
      const confirmationCode = params.confirmation_code || generateConfirmationCode();
      
      const result = bookAppointment(
        `Appointment at ${provider.name}`,
        appointmentDate,
        endDate,
        provider.name,
        confirmationCode
      );

      if (result.success) {
        setCallState(prev => ({
          ...prev,
          availableSlot: appointmentDate,
          confirmationCode,
        }));
        
        onBookingConfirmed?.(appointmentDate, confirmationCode);
        
        return JSON.stringify({ 
          success: true, 
          confirmation_code: confirmationCode,
          appointment_time: formatSlot(appointmentDate),
          message: `Booking confirmed! Confirmation code: ${confirmationCode}`
        });
      } else {
        return JSON.stringify({ 
          success: false, 
          error: result.error 
        });
      }
    },

    get_available_slots: async (params: { date?: string; preference?: string }) => {
      const targetDate = params.date 
        ? parseTimeSlot(params.date) 
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      
      if (!targetDate) {
        return JSON.stringify({ error: 'Could not parse date' });
      }

      const slots = getAvailableSlots(targetDate, 60)
        .filter(s => s.available)
        .slice(0, 5);

      // Filter by preference if provided
      let filteredSlots = slots;
      if (params.preference) {
        const pref = params.preference.toLowerCase();
        if (pref.includes('morning')) {
          filteredSlots = slots.filter(s => s.start.getHours() < 12);
        } else if (pref.includes('afternoon')) {
          filteredSlots = slots.filter(s => s.start.getHours() >= 12 && s.start.getHours() < 17);
        } else if (pref.includes('evening')) {
          filteredSlots = slots.filter(s => s.start.getHours() >= 17);
        }
      }

      return JSON.stringify({
        available_slots: filteredSlots.map(s => ({
          time: formatSlot(s.start),
          date: s.start.toISOString(),
        })),
        message: `Found ${filteredSlots.length} available slots`
      });
    },
  };

  const conversation = useConversation({
    clientTools,
    onConnect: () => {
      console.log('ElevenLabs agent connected');
      startTimeRef.current = Date.now();
      
      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setCallState(prev => ({
            ...prev,
            duration: Math.floor((Date.now() - startTimeRef.current!) / 1000),
          }));
        }
      }, 1000);

      setCallState(prev => ({ ...prev, status: 'connected' }));
    },
    onDisconnect: () => {
      console.log('ElevenLabs agent disconnected');
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      setCallState(prev => {
        const finalState = { ...prev, status: 'ended' as const };
        onCallEnded?.(finalState);
        return finalState;
      });
    },
    onMessage: (message) => {
      console.log('Agent message:', message);
      
      // Cast to any to access message properties
      const msg = message as any;
      
      if (msg.type === 'user_transcript' || msg.user_transcription_event) {
        const text = msg.user_transcription_event?.user_transcript;
        if (text) {
          setCallState(prev => ({
            ...prev,
            transcript: [...prev.transcript, { 
              speaker: 'provider' as const, 
              text, 
              timestamp: Date.now() 
            }],
          }));
        }
      } else if (msg.type === 'agent_response' || msg.agent_response_event) {
        const text = msg.agent_response_event?.agent_response;
        if (text) {
          setCallState(prev => ({
            ...prev,
            transcript: [...prev.transcript, { 
              speaker: 'ai' as const, 
              text, 
              timestamp: Date.now() 
            }],
          }));
        }
      }
    },
    onError: (error) => {
      console.error('ElevenLabs agent error:', error);
      setCallState(prev => ({ 
        ...prev, 
        status: 'ended', 
        error: error.message || 'Connection error' 
      }));
    },
  });

  const startCall = useCallback(async (
    provider: Provider,
    service: string,
    context: CallContextData
  ) => {
    currentProviderRef.current = provider;
    contextRef.current = context;

    setCallState({
      status: 'connecting',
      transcript: [],
      duration: 0,
    });

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from edge function
      const { data, error } = await supabase.functions.invoke('elevenlabs-conversation-token', {
        body: { 
          agentId,
          context: {
            provider_name: provider.name,
            provider_phone: provider.phone,
            service,
            purpose: context.purpose,
            details: context.details,
            time_preference: context.time_preference,
          }
        },
      });

      if (error || !data?.signed_url) {
        throw new Error(error?.message || 'Failed to get conversation token');
      }

      // Start conversation with WebSocket
      await conversation.startSession({
        signedUrl: data.signed_url,
      });

    } catch (error) {
      console.error('Failed to start call:', error);
      setCallState(prev => ({
        ...prev,
        status: 'ended',
        error: error instanceof Error ? error.message : 'Failed to start call',
      }));
    }
  }, [agentId, conversation]);

  const endCall = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const sendMessage = useCallback((text: string) => {
    conversation.sendUserMessage(text);
  }, [conversation]);

  return {
    callState,
    isSpeaking: conversation.isSpeaking,
    startCall,
    endCall,
    sendMessage,
  };
}

function generateConfirmationCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  let code = '';
  for (let i = 0; i < 2; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += numbers[Math.floor(Math.random() * numbers.length)];
  return code;
}
