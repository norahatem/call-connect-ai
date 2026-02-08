import { useState, useCallback, useRef, useEffect } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';

interface UseVoiceModeOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceMode({ onTranscript, onError }: UseVoiceModeOptions) {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [partialText, setPartialText] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      console.log('Partial transcript:', data.text);
      setPartialText(data.text);
    },
    onCommittedTranscript: (data) => {
      console.log('Committed transcript:', data.text);
      setPartialText('');
      if (data.text.trim()) {
        onTranscript(data.text.trim());
      }
    },
  });

  // Start listening
  const startListening = useCallback(async () => {
    if (scribe.isConnected) return;
    
    try {
      console.log('Getting scribe token...');
      const { data, error } = await supabase.functions.invoke('elevenlabs-scribe-token');
      
      if (error || !data?.token) {
        throw new Error(error?.message || 'Failed to get scribe token');
      }

      console.log('Connecting to scribe...');
      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      setIsListening(true);
      console.log('Scribe connected, listening...');
    } catch (err) {
      console.error('Failed to start listening:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to start voice input');
    }
  }, [scribe, onError]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (scribe.isConnected) {
      scribe.disconnect();
    }
    setIsListening(false);
    setPartialText('');
  }, [scribe]);

  // Play next audio in queue
  const playNextInQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    
    const audioUrl = audioQueueRef.current.shift()!;
    
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        playNextInQueue();
      };
      
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        URL.revokeObjectURL(audioUrl);
        playNextInQueue();
      };
      
      await audio.play();
    } catch (err) {
      console.error('Error playing audio:', err);
      playNextInQueue();
    }
  }, []);

  // Speak text using TTS
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    try {
      console.log('Generating TTS for:', text.substring(0, 50) + '...');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            text, 
            speaker: 'ai_assistant' 
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Add to queue
      audioQueueRef.current.push(audioUrl);
      
      // Start playing if not already
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    } catch (err) {
      console.error('TTS error:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to generate speech');
    }
  }, [onError, playNextInQueue]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Toggle voice mode
  const toggleVoiceMode = useCallback((enabled: boolean) => {
    setIsVoiceEnabled(enabled);
    if (!enabled) {
      stopListening();
      stopSpeaking();
    }
  }, [stopListening, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [stopListening, stopSpeaking]);

  return {
    isVoiceEnabled,
    isListening,
    isSpeaking,
    partialText,
    toggleVoiceMode,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
