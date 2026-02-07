import { useState, useCallback, useRef } from 'react';
import { TranscriptLine, CallStatus, Provider, CallContextData } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

  const playAudio = useCallback(async (text: string, speaker: 'ai' | 'provider', providerId: string) => {
    if (!isAudioEnabled) return;

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ text, speaker }),
      });

      if (!response.ok) {
        console.warn('TTS failed, continuing without audio');
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Queue audio for this call
      if (!audioQueue.current.has(providerId)) {
        audioQueue.current.set(providerId, []);
      }
      audioQueue.current.get(providerId)!.push(audio);

      await audio.play();
      
      // Clean up after playing
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
    } catch (error) {
      console.warn('Audio playback failed:', error);
    }
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

      let conversationHistory: TranscriptLine[] = [];
      let callStatus: 'continue' | 'success' | 'unavailable' | 'closed' = 'continue';
      let maxTurns = 6;
      let turn = 0;
      let availableSlot: string | undefined;
      let confirmationCode: string | undefined;

      while (callStatus === 'continue' && turn < maxTurns && !controller.signal.aborted) {
        // Get AI's message
        const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-call-orchestrator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            service,
            providerName: provider.name,
            userName,
            purpose: context.purpose,
            details: context.details,
            timePreference: context.time_preference,
            conversationHistory,
          }),
          signal: controller.signal,
        });

        if (!aiResponse.ok) {
          throw new Error('AI orchestrator failed');
        }

        const aiData = await aiResponse.json();
        
        // Add AI message to transcript
        addTranscriptLine(providerId, 'ai', aiData.message);
        conversationHistory.push({ speaker: 'ai', text: aiData.message, timestamp: Date.now() });
        
        // Play AI audio
        await playAudio(aiData.message, 'ai', providerId);
        
        if (controller.signal.aborted) return;

        // Small pause before provider responds
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 800));

        // Get provider's response
        const providerResponse = await fetch(`${SUPABASE_URL}/functions/v1/simulate-call-response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            service,
            providerName: provider.name,
            aiMessage: aiData.message,
            conversationHistory: conversationHistory.map(c => ({ role: c.speaker === 'ai' ? 'assistant' : 'user', content: c.text })),
            timePreference: context.time_preference,
          }),
          signal: controller.signal,
        });

        if (!providerResponse.ok) {
          throw new Error('Provider simulation failed');
        }

        const providerData = await providerResponse.json();
        
        // Add provider response to transcript
        addTranscriptLine(providerId, 'provider', providerData.response);
        conversationHistory.push({ speaker: 'provider', text: providerData.response, timestamp: Date.now() });
        
        // Play provider audio
        await playAudio(providerData.response, 'provider', providerId);
        
        callStatus = providerData.status;
        if (providerData.availableSlot) {
          availableSlot = providerData.availableSlot;
        }
        if (providerData.confirmationCode) {
          confirmationCode = providerData.confirmationCode;
        }

        turn++;
        
        // Update duration
        updateCallState(providerId, { 
          duration: turn * 8, // Approximate seconds per turn
        });
      }

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
        if (!confirmationCode) {
          const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
          const numbers = '23456789';
          confirmationCode = '';
          for (let i = 0; i < 2; i++) confirmationCode += letters[Math.floor(Math.random() * letters.length)];
          for (let i = 0; i < 4; i++) confirmationCode += numbers[Math.floor(Math.random() * numbers.length)];
        }

        updateCallState(providerId, { 
          status: 'success',
          availableSlot: slotDate,
          confirmationCode,
          duration: turn * 8,
        });
      } else if (callStatus === 'closed') {
        updateCallState(providerId, { 
          status: 'failed',
          failureReason: 'Business closed',
          duration: turn * 8,
        });
      } else if (callStatus === 'unavailable') {
        updateCallState(providerId, { 
          status: 'failed',
          failureReason: 'Fully booked',
          duration: turn * 8,
        });
      } else {
        updateCallState(providerId, { 
          status: 'failed',
          failureReason: 'Could not complete booking',
          duration: turn * 8,
        });
      }

      options.onCallComplete?.(providerId, callStates.get(providerId)!);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        updateCallState(providerId, { status: 'cancelled' });
      } else {
        console.error('Call failed:', error);
        updateCallState(providerId, { 
          status: 'failed', 
          failureReason: 'Technical error',
        });
      }
      options.onCallComplete?.(providerId, callStates.get(providerId)!);
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
