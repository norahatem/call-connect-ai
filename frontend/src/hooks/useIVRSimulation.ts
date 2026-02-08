import { useState, useCallback, useRef, useEffect } from 'react';
import { CallPhase, AnswerType, IVREvent, CalendarSlot } from '@/types';

interface IVRSimulationState {
  phase: CallPhase;
  answerType: AnswerType;
  ivrEvents: IVREvent[];
  currentDigit?: string;
  menuDepth: number;
}

interface UseIVRSimulationOptions {
  providerId: string;
  isActive: boolean;
  onPhaseChange?: (providerId: string, phase: CallPhase) => void;
  onAnswerTypeDetected?: (providerId: string, type: AnswerType) => void;
  onIVREvent?: (providerId: string, event: IVREvent) => void;
}

const IVR_MESSAGES = [
  { type: 'menu_detected' as const, message: 'Detected automated menu system' },
  { type: 'dtmf_sent' as const, message: 'Sending DTMF digit', digits: ['1', '2', '3', '0'] },
  { type: 'option_selected' as const, message: 'Selected: Schedule Appointment' },
  { type: 'routing' as const, message: 'Routing to receptionist queue...' },
  { type: 'human_reached' as const, message: 'Human agent connected' },
];

export function useIVRSimulation({ 
  providerId, 
  isActive,
  onPhaseChange,
  onAnswerTypeDetected,
  onIVREvent
}: UseIVRSimulationOptions) {
  const [state, setState] = useState<IVRSimulationState>({
    phase: 'connecting',
    answerType: 'unknown',
    ivrEvents: [],
    menuDepth: 0,
  });
  
  const simulationRef = useRef<NodeJS.Timeout | null>(null);
  const eventIndexRef = useRef(0);

  const addIVREvent = useCallback((event: Omit<IVREvent, 'id' | 'timestamp'>) => {
    const newEvent: IVREvent = {
      ...event,
      id: `${providerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    
    setState(prev => ({
      ...prev,
      ivrEvents: [...prev.ivrEvents, newEvent],
      currentDigit: event.type === 'dtmf_sent' ? event.digit : prev.currentDigit,
    }));
    
    if (onIVREvent) {
      onIVREvent(providerId, newEvent);
    }
    
    return newEvent;
  }, [providerId, onIVREvent]);

  const setPhase = useCallback((phase: CallPhase) => {
    setState(prev => ({ ...prev, phase }));
    if (onPhaseChange) {
      onPhaseChange(providerId, phase);
    }
  }, [providerId, onPhaseChange]);

  const setAnswerType = useCallback((type: AnswerType) => {
    setState(prev => ({ ...prev, answerType: type }));
    if (onAnswerTypeDetected) {
      onAnswerTypeDetected(providerId, type);
    }
  }, [providerId, onAnswerTypeDetected]);

  // Simulate IVR navigation
  const simulateIVRSequence = useCallback(() => {
    if (!isActive) return;
    
    const runSequence = () => {
      const eventIndex = eventIndexRef.current;
      
      if (eventIndex >= IVR_MESSAGES.length) {
        // Finished IVR sequence
        setPhase('talking_to_human');
        return;
      }
      
      const template = IVR_MESSAGES[eventIndex];
      
      // Determine phase based on event
      if (eventIndex === 0) {
        setPhase('ivr_detected');
        setAnswerType('machine');
      } else if (template.type === 'dtmf_sent') {
        setPhase('navigating_menu');
      } else if (template.type === 'routing') {
        setPhase('navigating_menu');
      } else if (template.type === 'human_reached') {
        setPhase('talking_to_human');
        setAnswerType('human');
      }
      
      // Create event
      const event: Omit<IVREvent, 'id' | 'timestamp'> = {
        type: template.type,
        message: template.message,
        menuLevel: Math.floor(eventIndex / 2) + 1,
      };
      
      if (template.type === 'dtmf_sent' && template.digits) {
        event.digit = template.digits[Math.floor(Math.random() * template.digits.length)];
        event.message = `Sending DTMF digit: ${event.digit}`;
      }
      
      addIVREvent(event);
      eventIndexRef.current += 1;
      
      // Schedule next event
      const delay = 1500 + Math.random() * 2000;
      simulationRef.current = setTimeout(runSequence, delay);
    };
    
    // Start sequence after initial delay
    simulationRef.current = setTimeout(runSequence, 2000);
  }, [isActive, setPhase, setAnswerType, addIVREvent]);

  // Start simulation when call becomes active
  useEffect(() => {
    if (isActive && state.phase === 'connecting') {
      // 50% chance of hitting an IVR system
      const willHitIVR = Math.random() > 0.5;
      
      if (willHitIVR) {
        simulateIVRSequence();
      } else {
        // Direct human answer
        setTimeout(() => {
          setAnswerType('human');
          setPhase('talking_to_human');
          addIVREvent({
            type: 'human_reached',
            message: 'Call answered by human',
          });
        }, 1500 + Math.random() * 1500);
      }
    }
    
    return () => {
      if (simulationRef.current) {
        clearTimeout(simulationRef.current);
      }
    };
  }, [isActive, state.phase, simulateIVRSequence, setAnswerType, setPhase, addIVREvent]);

  // Progress to negotiating/finalizing after talking to human
  useEffect(() => {
    if (state.phase === 'talking_to_human' && isActive) {
      const negotiateTimeout = setTimeout(() => {
        setPhase('negotiating');
      }, 5000 + Math.random() * 3000);
      
      return () => clearTimeout(negotiateTimeout);
    }
  }, [state.phase, isActive, setPhase]);

  const reset = useCallback(() => {
    setState({
      phase: 'connecting',
      answerType: 'unknown',
      ivrEvents: [],
      menuDepth: 0,
    });
    eventIndexRef.current = 0;
    if (simulationRef.current) {
      clearTimeout(simulationRef.current);
    }
  }, []);

  return {
    ...state,
    addIVREvent,
    setPhase,
    setAnswerType,
    reset,
  };
}

// Hook to manage IVR state for multiple providers
export function useMultiProviderIVR(providerIds: string[], activeProviderIds: Set<string>) {
  const [ivrStates, setIvrStates] = useState<Map<string, IVRSimulationState>>(new Map());

  const updateProviderState = useCallback((providerId: string, updates: Partial<IVRSimulationState>) => {
    setIvrStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(providerId) || {
        phase: 'connecting' as CallPhase,
        answerType: 'unknown' as AnswerType,
        ivrEvents: [],
        menuDepth: 0,
      };
      newStates.set(providerId, { ...current, ...updates });
      return newStates;
    });
  }, []);

  const addIVREventToProvider = useCallback((providerId: string, event: IVREvent) => {
    setIvrStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(providerId);
      if (current) {
        newStates.set(providerId, {
          ...current,
          ivrEvents: [...current.ivrEvents, event],
        });
      }
      return newStates;
    });
  }, []);

  return {
    ivrStates,
    updateProviderState,
    addIVREventToProvider,
  };
}
