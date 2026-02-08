import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowLeft, Zap, CheckCircle2, Volume2, VolumeX, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { EnhancedProviderCard } from '@/components/providers/EnhancedProviderCard';
import { ConflictPreventionBadge } from '@/components/calling/ConflictPreventionBadge';
import { useAuth } from '@/hooks/useAuth';
import { useAICall } from '@/hooks/useAICall';
import { supabase } from '@/integrations/supabase/client';
import { Provider, Call, Search, CallContextData, CallPhase, IVREvent } from '@/types';

export default function WarRoomPage() {
  const navigate = useNavigate();
  const { searchId } = useParams<{ searchId: string }>();
  const { user } = useAuth();
  
  const [search, setSearch] = useState<Search | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [winnerProviderId, setWinnerProviderId] = useState<string | null>(null);
  const [callingActive, setCallingActive] = useState(true);
  const [callQueue, setCallQueue] = useState<string[]>([]);
  const [currentCallIndex, setCurrentCallIndex] = useState(0);
  const [calls, setCalls] = useState<Map<string, Call>>(new Map());
  const [shuttingDownProviders, setShuttingDownProviders] = useState<Set<string>>(new Set());
  
  // WINNER LOCK: Use ref for immediate, synchronous lock to prevent race conditions
  const confirmedBookingRef = useRef<{ providerId: string; call: Call } | null>(null);
  const isWinnerLockedRef = useRef(false);
  
  // IVR simulation state
  const ivrTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const { 
    callStates, 
    initiateCall, 
    cancelAllCalls, 
    isAudioEnabled, 
    setIsAudioEnabled 
  } = useAICall({
    onCallComplete: useCallback((providerId: string, result) => {
      if (!result) return;
      
      // RACE CONDITION FIX: Skip updates for terminated calls if winner is locked
      if (isWinnerLockedRef.current && confirmedBookingRef.current?.providerId !== providerId) {
        // Only allow 'cancelled' status for non-winner calls after lock
        if (result.status !== 'cancelled') return;
      }
      
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          // Don't overwrite winner's status
          if (confirmedBookingRef.current?.providerId === providerId && call.status === 'success') {
            return prev; // Keep winner immutable
          }
          
          newCalls.set(providerId, {
            ...call,
            status: result.status,
            transcript: result.transcript || [],
            duration: result.duration || 0,
            available_slot: result.availableSlot?.toISOString(),
            failure_reason: result.failureReason,
            updated_at: new Date().toISOString(),
          });
        }
        return newCalls;
      });
    }, []),
    onTranscriptUpdate: useCallback((providerId: string, transcript) => {
      // Skip transcript updates for non-winner calls after lock
      if (isWinnerLockedRef.current && confirmedBookingRef.current?.providerId !== providerId) {
        return;
      }
      
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          newCalls.set(providerId, {
            ...call,
            transcript,
            updated_at: new Date().toISOString(),
          });
        }
        return newCalls;
      });
    }, []),
    enableTTS: true,
  });

  // Simulate IVR events for a provider
  const simulateIVRForProvider = useCallback((providerId: string) => {
    const ivrSequence: Array<{ delay: number; phase: CallPhase; event?: Omit<IVREvent, 'id' | 'timestamp'> }> = [
      { delay: 1500, phase: 'connecting' },
      { 
        delay: 3000, 
        phase: 'ivr_detected',
        event: { type: 'menu_detected', message: 'Detected automated menu system', menuLevel: 1 }
      },
      { 
        delay: 4500, 
        phase: 'navigating_menu',
        event: { type: 'dtmf_sent', message: 'Sending DTMF digit: 1', digit: '1', menuLevel: 1 }
      },
      { 
        delay: 6000, 
        phase: 'navigating_menu',
        event: { type: 'option_selected', message: 'Selected: Schedule New Appointment', menuLevel: 1 }
      },
      { 
        delay: 8000, 
        phase: 'navigating_menu',
        event: { type: 'dtmf_sent', message: 'Sending DTMF digit: 2', digit: '2', menuLevel: 2 }
      },
      { 
        delay: 10000, 
        phase: 'navigating_menu',
        event: { type: 'routing', message: 'Routing to receptionist queue...', menuLevel: 2 }
      },
      { 
        delay: 13000, 
        phase: 'talking_to_human',
        event: { type: 'human_reached', message: 'Human receptionist connected' }
      },
      { delay: 18000, phase: 'negotiating' },
      { delay: 25000, phase: 'finalizing' },
    ];

    // 40% chance of direct human answer (skip IVR)
    const skipIVR = Math.random() < 0.4;
    const sequence = skipIVR 
      ? [
          { delay: 2000, phase: 'talking_to_human' as CallPhase, event: { type: 'human_reached' as const, message: 'Call answered by human' } },
          { delay: 8000, phase: 'negotiating' as CallPhase },
          { delay: 15000, phase: 'finalizing' as CallPhase },
        ]
      : ivrSequence;

    sequence.forEach(({ delay, phase, event }) => {
      const timer = setTimeout(() => {
        // Skip IVR updates if winner is already locked and this isn't the winner
        if (isWinnerLockedRef.current && confirmedBookingRef.current?.providerId !== providerId) {
          return;
        }
        
        setCalls(prev => {
          const newCalls = new Map(prev);
          const call = newCalls.get(providerId);
          if (call && ['dialing', 'connected', 'in_progress'].includes(call.status)) {
            const ivrEvents = call.ivr_events || [];
            const newEvent = event ? {
              ...event,
              id: `${providerId}-${Date.now()}`,
              timestamp: Date.now(),
            } as IVREvent : null;
            
            newCalls.set(providerId, {
              ...call,
              phase,
              answer_type: event?.type === 'human_reached' ? 'human' : (event?.type === 'menu_detected' ? 'machine' : call.answer_type),
              ivr_events: newEvent ? [...ivrEvents, newEvent] : ivrEvents,
            });
          }
          return newCalls;
        });
      }, delay);
      
      const timers = ivrTimersRef.current.get(providerId) ? [ivrTimersRef.current.get(providerId)!, timer] : [timer];
      ivrTimersRef.current.set(providerId, timer);
    });
  }, []);

  // Handle emergency takeover
  const handleEmergencyTakeover = useCallback((providerId: string) => {
    setCalls(prev => {
      const newCalls = new Map(prev);
      const call = newCalls.get(providerId);
      if (call) {
        newCalls.set(providerId, {
          ...call,
          is_emergency_takeover: true,
        });
      }
      return newCalls;
    });
  }, []);

  // Sync callStates to calls with winner lock protection
  useEffect(() => {
    callStates.forEach((state, providerId) => {
      if (!state) return;
      
      // RACE CONDITION FIX: Skip updates for non-winner calls after lock
      if (isWinnerLockedRef.current && confirmedBookingRef.current?.providerId !== providerId) {
        return;
      }
      
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          // Don't overwrite winner's status once locked
          if (confirmedBookingRef.current?.providerId === providerId && call.status === 'success') {
            return prev;
          }
          
          // Start IVR simulation when call becomes active
          if (state.status === 'in_progress' && call.status !== 'in_progress') {
            simulateIVRForProvider(providerId);
          }
          
          newCalls.set(providerId, {
            ...call,
            status: state.status,
            transcript: state.transcript || [],
            duration: state.duration || 0,
            available_slot: state.availableSlot?.toISOString(),
            failure_reason: state.failureReason,
            updated_at: new Date().toISOString(),
          });
        }
        return newCalls;
      });
    });
  }, [callStates, simulateIVRForProvider]);

  // Load search and providers
  useEffect(() => {
    if (!searchId || !user) return;

    const loadData = async () => {
      const { data: searchData } = await supabase
        .from('searches')
        .select('*')
        .eq('id', searchId)
        .single();

      if (searchData) {
        setSearch(searchData as unknown as Search);
      }

      const { data: providersData } = await supabase
        .from('providers')
        .select('*')
        .eq('search_id', searchId)
        .order('rating', { ascending: false });

      if (providersData) {
        const typedProviders = providersData as unknown as Provider[];
        setProviders(typedProviders);
        // Support up to 15 providers for race-to-success
        setCallQueue(typedProviders.slice(0, 15).map(p => p.id));
        
        const initialCalls = new Map<string, Call>();
        typedProviders.forEach(provider => {
          initialCalls.set(provider.id, {
            id: crypto.randomUUID(),
            search_id: searchId,
            provider_id: provider.id,
            status: 'queued',
            transcript: [],
            duration: 0,
            phase: 'connecting',
            answer_type: 'unknown',
            ivr_events: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        });
        setCalls(initialCalls);
      }
    };

    loadData();
  }, [searchId, user]);

  // Check for winner - Race to Success with WINNER LOCK
  useEffect(() => {
    // CRITICAL: Check ref first (synchronous) to prevent race condition
    if (isWinnerLockedRef.current || winnerProviderId) return;

    const successfulCall = Array.from(calls.entries()).find(([_, call]) => call.status === 'success');
    if (successfulCall) {
      const [providerId, call] = successfulCall;
      
      // IMMEDIATE LOCK: Set ref synchronously before any async operations
      if (!isWinnerLockedRef.current) {
        isWinnerLockedRef.current = true;
        confirmedBookingRef.current = { providerId, call };
      } else {
        // Another winner was already locked - ignore this success
        return;
      }
      
      // Now safe to update state
      setWinnerProviderId(providerId);
      setCallingActive(false);
      cancelAllCalls();

      // Trigger shutdown animation for other calls
      const otherProviderIds = Array.from(calls.keys()).filter(id => id !== providerId);
      setShuttingDownProviders(new Set(otherProviderIds));

      // Terminate other calls with animation delay - use 'cancelled' to differentiate from 'failed'
      setTimeout(() => {
        setCalls(prev => {
          const newCalls = new Map(prev);
          newCalls.forEach((c, id) => {
            // NEVER touch the winner's card
            if (id === confirmedBookingRef.current?.providerId) return;
            
            if (['queued', 'dialing', 'connected', 'in_progress'].includes(c.status)) {
              newCalls.set(id, { 
                ...c, 
                status: 'cancelled', 
                failure_reason: 'Slot secured elsewhere',
                updated_at: new Date().toISOString() 
              });
            }
          });
          return newCalls;
        });
      }, 800); // Delay for animation

      // Clear IVR timers
      ivrTimersRef.current.forEach(timer => clearTimeout(timer));
      ivrTimersRef.current.clear();

      // Create booking in database
      const state = callStates.get(providerId);
      
      const createBooking = async () => {
        if (!state?.confirmationCode || !state?.availableSlot || !user?.id || !searchId) {
          console.error('Missing data for booking:', { state, userId: user?.id, searchId });
          return;
        }

        try {
          const { data: callData, error: callError } = await supabase
            .from('calls')
            .insert([{
              search_id: searchId,
              provider_id: providerId,
              status: 'success',
              transcript: call.transcript as unknown as null,
              duration: state.duration || call.duration,
              available_slot: state.availableSlot.toISOString(),
            }])
            .select()
            .single();

          if (callError) {
            console.error('Error creating call:', callError);
            return;
          }

          const { error: bookingError } = await supabase
            .from('bookings')
            .insert({
              user_id: user.id,
              call_id: callData.id,
              provider_id: providerId,
              appointment_time: state.availableSlot.toISOString(),
              confirmation_code: state.confirmationCode,
            });

          if (bookingError) {
            console.error('Error creating booking:', bookingError);
          } else {
            console.log('Booking created successfully');
          }
        } catch (err) {
          console.error('Error in booking creation:', err);
        }
      };

      createBooking();

      // Celebration!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#ffffff']
      });

      setTimeout(() => {
        navigate(`/booking/${searchId}`);
      }, 3000);
    }
  }, [calls, winnerProviderId, cancelAllCalls, callStates, providers, user, navigate, searchId]);

  // Start calling sequence - Race up to 15 calls
  useEffect(() => {
    if (callQueue.length === 0 || !callingActive || !search || providers.length === 0) return;

    const preferences = search.preferences as CallContextData | undefined;
    const context: CallContextData = {
      purpose: preferences?.purpose || 'new_appointment',
      details: preferences?.details || '',
      time_preference: preferences?.time_preference || 'flexible',
    };

    // Start up to 5 calls in parallel initially (more aggressive)
    const startInitialCalls = async () => {
      const initialBatch = callQueue.slice(0, 5);
      initialBatch.forEach((providerId, index) => {
        const provider = providers.find(p => p.id === providerId);
        if (provider) {
          setTimeout(() => {
            initiateCall(provider, search.service, 'Customer', context);
          }, index * 1000);
        }
      });
      setCurrentCallIndex(5);
    };

    const timeoutId = setTimeout(startInitialCalls, 500);
    return () => clearTimeout(timeoutId);
  }, [callQueue, providers, search, callingActive, initiateCall]);

  // Continue with more calls as previous ones complete
  useEffect(() => {
    if (!callingActive || winnerProviderId || !search || providers.length === 0) return;
    
    const activeCount = Array.from(calls.values()).filter(
      c => ['dialing', 'connected', 'in_progress'].includes(c.status)
    ).length;

    // Start next call if we have capacity (max 5 concurrent for race)
    if (activeCount < 5 && currentCallIndex < callQueue.length) {
      const preferences = search.preferences as CallContextData | undefined;
      const context: CallContextData = {
        purpose: preferences?.purpose || 'new_appointment',
        details: preferences?.details || '',
        time_preference: preferences?.time_preference || 'flexible',
      };

      const nextProviderId = callQueue[currentCallIndex];
      const provider = providers.find(p => p.id === nextProviderId);
      if (provider) {
        setCurrentCallIndex(prev => prev + 1);
        initiateCall(provider, search.service, 'Customer', context);
      }
    }
  }, [calls, currentCallIndex, callQueue, callingActive, winnerProviderId, search, providers, initiateCall]);

  const activeCallCount = Array.from(calls.values()).filter(
    c => ['dialing', 'connected', 'in_progress'].includes(c.status)
  ).length;

  const successCount = Array.from(calls.values()).filter(c => c.status === 'success').length;
  const totalCallsInitiated = Array.from(calls.values()).filter(c => c.status !== 'queued').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                cancelAllCalls();
                ivrTimersRef.current.forEach(timer => clearTimeout(timer));
                navigate('/dashboard');
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          
          <div className="flex items-center gap-4">
            {/* Conflict Prevention Badge */}
            {activeCallCount > 1 && (
              <ConflictPreventionBadge 
                activeCallCount={activeCallCount}
                isSecured={successCount > 0}
              />
            )}
            
            {/* Audio toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsAudioEnabled(!isAudioEnabled)}
              className="text-muted-foreground hover:text-foreground"
              title={isAudioEnabled ? "Mute audio" : "Enable audio"}
            >
              {isAudioEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </Button>

            {/* Status indicator */}
            <div className="flex items-center gap-2">
              {callingActive ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-medium">
                    {activeCallCount} active / {totalCallsInitiated} initiated
                  </span>
                </>
              ) : successCount > 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Booking secured!</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Calls completed</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container px-4 py-6">
        {/* Title */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <Zap className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">
              {winnerProviderId ? 'Appointment Booked!' : 'AI Calling Providers...'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {search && (
              <p className="text-muted-foreground">
                Finding you the best {search.service} in {search.location}
              </p>
            )}
            {callingActive && activeCallCount > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-primary">
                <Shield className="h-3.5 w-3.5" />
                <span>Race to Success: First booking wins</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Provider grid - Winner moves to top */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {/* VISUAL HIERARCHY: Winner card first, then active, then terminated */}
            {[...providers]
              .sort((a, b) => {
                // Winner always first
                if (a.id === winnerProviderId) return -1;
                if (b.id === winnerProviderId) return 1;
                
                const callA = calls.get(a.id);
                const callB = calls.get(b.id);
                
                // Active calls before terminated
                const isActiveA = callA && ['dialing', 'connected', 'in_progress'].includes(callA.status);
                const isActiveB = callB && ['dialing', 'connected', 'in_progress'].includes(callB.status);
                if (isActiveA && !isActiveB) return -1;
                if (!isActiveA && isActiveB) return 1;
                
                // Failed/no_answer before cancelled (cancelled = terminated by us)
                const isCancelledA = callA?.status === 'cancelled';
                const isCancelledB = callB?.status === 'cancelled';
                if (!isCancelledA && isCancelledB) return -1;
                if (isCancelledA && !isCancelledB) return 1;
                
                return 0;
              })
              .map(provider => {
                const call = calls.get(provider.id);
                const isWinner = provider.id === winnerProviderId;
                const isShuttingDown = shuttingDownProviders.has(provider.id);
                const isTerminated = call?.status === 'cancelled' && !isWinner;
                
                return (
                  <EnhancedProviderCard
                    key={provider.id}
                    provider={provider}
                    call={call}
                    isWinner={isWinner}
                    isShuttingDown={isShuttingDown}
                    onEmergencyTakeover={handleEmergencyTakeover}
                    className={isTerminated ? 'opacity-40' : ''}
                  />
                );
              })}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
