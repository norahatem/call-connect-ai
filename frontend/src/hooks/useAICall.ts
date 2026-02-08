import { useState, useCallback, useRef } from 'react';
import { TranscriptLine, CallStatus, Provider, CallContextData } from '@/types';

interface CallState {
  status: CallStatus;
  transcript: TranscriptLine[];
  duration: number;
  availableSlot?: Date;
  confirmationCode?: string;
  failureReason?: string;
}

interface UseAICallOptions {
  onCallComplete?: (providerId: string, result: CallState) => void;
  onTranscriptUpdate?: (providerId: string, transcript: TranscriptLine[]) => void;
  enableTTS?: boolean;
}

export function useAICall(options: UseAICallOptions = {}) {
  const [callStates, setCallStates] = useState<Map<string, CallState>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(options.enableTTS ?? true);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const audioQueue = useRef<Map<string, HTMLAudioElement[]>>(new Map());

  const updateCallState = useCallback((providerId: string, updates: Partial<CallState>) => {
    setCallStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(providerId) || {
        status: 'queued' as CallStatus,
        transcript: [],
        duration: 0,
      };
      newStates.set(providerId, { ...current, ...updates });
      return newStates;
    });
  }, []);

  const playAudio = useCallback(async (_text: string, _speaker: 'ai' | 'provider', _providerId: string) => {
    // TTS disabled in mock mode -- just a short pause to simulate speech
    if (!isAudioEnabled) return;
    await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
  }, [isAudioEnabled]);

  const addTranscriptLine = useCallback((
    providerId: string, 
    speaker: 'ai' | 'provider', 
    text: string
  ) => {
    const timestamp = Date.now();
    setCallStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(providerId);
      if (!current) return prev;
      
      const newTranscript = [...current.transcript, { speaker, text, timestamp }];
      newStates.set(providerId, { ...current, transcript: newTranscript });
      options.onTranscriptUpdate?.(providerId, newTranscript);
      return newStates;
    });
  }, [options]);

  const initiateCall = useCallback(async (
    provider: Provider,
    service: string,
    userName: string,
    context: CallContextData
  ) => {
    const providerId = provider.id;
    const controller = new AbortController();
    abortControllers.current.set(providerId, controller);

    // Initialize call state
    updateCallState(providerId, { status: 'dialing', transcript: [], duration: 0 });

    try {
      // Simulate dialing delay
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));
      
      if (controller.signal.aborted) return;

      // Random no-answer chance (10%)
      if (Math.random() < 0.1) {
        updateCallState(providerId, { 
          status: 'no_answer', 
          failureReason: 'No answer after 30 seconds',
          duration: 30,
        });
        options.onCallComplete?.(providerId, callStates.get(providerId)!);
        return;
      }

      updateCallState(providerId, { status: 'connected' });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (controller.signal.aborted) return;

      updateCallState(providerId, { status: 'in_progress' });

      // ---- Mock conversation (no AI calls) ----
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const slotStr = tomorrow.toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      const mockCode = `BK${Math.floor(1000 + Math.random() * 9000)}`;

      const mockScript = [
        {
          ai: `Hi, this is an AI assistant calling on behalf of ${userName}. I'm looking to book a ${service} appointment at ${provider.name}. Do you have any availability ${context.time_preference || 'this week'}?`,
          provider: `Hello! Yes, we have a few openings. How about ${slotStr}?`,
        },
        {
          ai: `That sounds great! ${slotStr} works perfectly for my client. Could you please confirm the booking?`,
          provider: `Wonderful, you're all set. The confirmation code is ${mockCode}. Is there anything else I can help with?`,
        },
        {
          ai: `No, that's everything. Thank you so much for your help! Have a great day.`,
          provider: `You too, goodbye!`,
        },
      ];

      let conversationHistory: TranscriptLine[] = [];
      let turn = 0;
      const availableSlot = tomorrow.toISOString();
      const confirmationCode = mockCode;

      for (const step of mockScript) {
        if (controller.signal.aborted) return;

        addTranscriptLine(providerId, 'ai', step.ai);
        conversationHistory.push({ speaker: 'ai', text: step.ai, timestamp: Date.now() });
        await playAudio(step.ai, 'ai', providerId);

        if (controller.signal.aborted) return;
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 800));

        addTranscriptLine(providerId, 'provider', step.provider);
        conversationHistory.push({ speaker: 'provider', text: step.provider, timestamp: Date.now() });
        await playAudio(step.provider, 'provider', providerId);

        turn++;
        updateCallState(providerId, { duration: turn * 8 });
      }

      const callStatus = 'success' as const;
      // ---- End mock ----

      // Finalize call
      if (callStatus === 'success' && availableSlot) {
        // Parse the slot to a Date if it's a string
        let slotDate: Date;
        try {
          slotDate = new Date(availableSlot);
          if (isNaN(slotDate.getTime())) {
            // Try to parse natural language date
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            slotDate = tomorrow;
          }
        } catch {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          slotDate = tomorrow;
        }

        // Generate confirmation code if not provided
        let finalCode = confirmationCode;
        if (!finalCode) {
          const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
          const numbers = '23456789';
          finalCode = '';
          for (let i = 0; i < 2; i++) finalCode += letters[Math.floor(Math.random() * letters.length)];
          for (let i = 0; i < 4; i++) finalCode += numbers[Math.floor(Math.random() * numbers.length)];
        }

        const successResult: CallState = { 
          status: 'success',
          transcript: conversationHistory,
          availableSlot: slotDate,
          confirmationCode: finalCode,
          duration: turn * 8,
        };
        updateCallState(providerId, successResult);
        options.onCallComplete?.(providerId, successResult);
      } else if (callStatus === 'closed') {
        const closedResult: CallState = { 
          status: 'failed',
          transcript: conversationHistory,
          failureReason: 'Business closed',
          duration: turn * 8,
        };
        updateCallState(providerId, closedResult);
        options.onCallComplete?.(providerId, closedResult);
      } else if (callStatus === 'unavailable') {
        const unavailableResult: CallState = { 
          status: 'failed',
          transcript: conversationHistory,
          failureReason: 'Fully booked',
          duration: turn * 8,
        };
        updateCallState(providerId, unavailableResult);
        options.onCallComplete?.(providerId, unavailableResult);
      } else {
        const failedResult: CallState = { 
          status: 'failed',
          transcript: conversationHistory,
          failureReason: 'Could not complete booking',
          duration: turn * 8,
        };
        updateCallState(providerId, failedResult);
        options.onCallComplete?.(providerId, failedResult);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        const cancelledResult: CallState = { status: 'cancelled', transcript: [], duration: 0 };
        updateCallState(providerId, cancelledResult);
        options.onCallComplete?.(providerId, cancelledResult);
      } else {
        console.error('Call failed:', error);
        const errorResult: CallState = { 
          status: 'failed', 
          transcript: [],
          failureReason: 'Technical error',
          duration: 0,
        };
        updateCallState(providerId, errorResult);
        options.onCallComplete?.(providerId, errorResult);
      }
    }
  }, [updateCallState, addTranscriptLine, playAudio, options]);

  const cancelCall = useCallback((providerId: string) => {
    const controller = abortControllers.current.get(providerId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(providerId);
    }
    
    // Stop any playing audio
    const audios = audioQueue.current.get(providerId);
    if (audios) {
      audios.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioQueue.current.delete(providerId);
    }

    updateCallState(providerId, { status: 'cancelled' });
  }, [updateCallState]);

  const cancelAllCalls = useCallback(() => {
    abortControllers.current.forEach((controller, providerId) => {
      controller.abort();
      cancelCall(providerId);
    });
    abortControllers.current.clear();
  }, [cancelCall]);

  return {
    callStates,
    initiateCall,
    cancelCall,
    cancelAllCalls,
    isAudioEnabled,
    setIsAudioEnabled,
  };
}
