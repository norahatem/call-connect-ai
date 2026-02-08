import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowLeft, ArrowRight, Zap, CheckCircle2, Volume2, VolumeX, Shield, Download, FileText, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { EnhancedProviderCard } from '@/components/providers/EnhancedProviderCard';
import { ConflictPreventionBadge } from '@/components/calling/ConflictPreventionBadge';
import { TranscriptReviewPanel } from '@/components/calling/TranscriptReviewPanel';
import { useAuth } from '@/hooks/useAuth';
import { useAICall } from '@/hooks/useAICall';
import { useCallTranscriptLog } from '@/hooks/useCallTranscriptLog';
import { supabase } from '@/integrations/supabase/client';
import { Provider, Call, Search, CallContextData, CallPhase, IVREvent } from '@/types';

// Demo providers for testing when no real search data exists
const DEMO_PROVIDERS: Provider[] = [
  { id: 'demo-1', search_id: 'demo', name: 'Metro Dental Associates', phone: '(555) 123-4567', rating: 4.8, review_count: 234, distance: 0.8, address: '123 Main St', created_at: new Date().toISOString() },
  { id: 'demo-2', search_id: 'demo', name: 'Bright Smile Dentistry', phone: '(555) 234-5678', rating: 4.6, review_count: 189, distance: 1.2, address: '456 Oak Ave', created_at: new Date().toISOString() },
  { id: 'demo-3', search_id: 'demo', name: 'Family Dental Care', phone: '(555) 345-6789', rating: 4.9, review_count: 312, distance: 1.5, address: '789 Pine Rd', created_at: new Date().toISOString() },
  { id: 'demo-4', search_id: 'demo', name: 'Downtown Dental Clinic', phone: '(555) 456-7890', rating: 4.4, review_count: 156, distance: 2.0, address: '321 Elm St', created_at: new Date().toISOString() },
  { id: 'demo-5', search_id: 'demo', name: 'Premier Dental Group', phone: '(555) 567-8901', rating: 4.7, review_count: 278, distance: 2.3, address: '654 Maple Dr', created_at: new Date().toISOString() },
];

const DEMO_SEARCH: Search = {
  id: 'demo',
  user_id: 'demo-user',
  service: 'Dental Cleaning',
  location: 'San Francisco, CA',
  preferences: { purpose: 'new_appointment', details: 'Regular checkup', time_preference: 'morning' },
  status: 'calling',
  booking_mode: 'single',
  stage: 'booking',
  voice_preference: { gender: 'female', accent: 'american' },
  scoring_weights: [],
  ranked_results: [],
  created_at: new Date().toISOString(),
};

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
  const [isDemo, setIsDemo] = useState(false);
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(false);
  
  // WINNER LOCK: Use ref for immediate, synchronous lock to prevent race conditions
  const confirmedBookingRef = useRef<{ providerId: string; call: Call } | null>(null);
  const isWinnerLockedRef = useRef(false);
  
  // IVR simulation state
  const ivrTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Transcript logging
  const { transcriptLog, logAllCalls, exportLog } = useCallTranscriptLog();

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

  // Load search and providers (with demo mode fallback)
  useEffect(() => {
    if (!searchId) return;

    const loadData = async () => {
      // First try to load real data
      const { data: searchData } = await supabase
        .from('searches')
        .select('*')
        .eq('id', searchId)
        .single();

      if (searchData) {
        setSearch(searchData as unknown as Search);
        
        const { data: providersData } = await supabase
          .from('providers')
          .select('*')
          .eq('search_id', searchId)
          .order('rating', { ascending: false });

        if (providersData && providersData.length > 0) {
          const typedProviders = providersData as unknown as Provider[];
          setProviders(typedProviders);
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
          return;
        }
      }
      
      // Fallback to demo mode if no real data
      console.log('🎭 No real data found - entering DEMO MODE');
      setIsDemo(true);
      setSearch(DEMO_SEARCH);
      setProviders(DEMO_PROVIDERS);
      setCallQueue(DEMO_PROVIDERS.map(p => p.id));
      
      const initialCalls = new Map<string, Call>();
      DEMO_PROVIDERS.forEach(provider => {
        initialCalls.set(provider.id, {
          id: crypto.randomUUID(),
          search_id: 'demo',
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
    };

    loadData();
  }, [searchId]);

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

      // Terminate other calls with animation delay - add polite apology before cancelling
      setTimeout(() => {
        setCalls(prev => {
          const newCalls = new Map(prev);
          newCalls.forEach((c, id) => {
            // NEVER touch the winner's card
            if (id === confirmedBookingRef.current?.providerId) return;
            
            if (['queued', 'dialing', 'connected', 'in_progress'].includes(c.status)) {
              // Add polite apology transcript before terminating
              const apologyTranscript = c.transcript ? [...c.transcript] : [];
              
              // Only add apology if the call was actually connected (talking to someone)
              if (['connected', 'in_progress'].includes(c.status)) {
                apologyTranscript.push({
                  speaker: 'ai',
                  text: "I sincerely apologize, but we've just secured an appointment with another provider. Thank you so much for your time and assistance. Have a wonderful day!",
                  timestamp: Date.now()
                });
              }
              
              newCalls.set(id, { 
                ...c, 
                status: 'cancelled', 
                transcript: apologyTranscript,
                failure_reason: 'Slot secured elsewhere',
                phase: 'completed',
                updated_at: new Date().toISOString() 
              });
            }
          });
          
          // Log all transcripts after state update
          logAllCalls(newCalls, providers, providerId);
          
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

      // Don't auto-redirect - let user view transcripts and click continue manually
    }
  }, [calls, winnerProviderId, cancelAllCalls, callStates, providers, user, navigate, searchId, logAllCalls, showTranscriptPanel]);

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
            
            {/* View Transcripts Button - shows after winner declared */}
            {(transcriptLog.length > 0 || winnerProviderId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTranscriptPanel(true)}
                className="gap-2 border-primary/30 hover:border-primary"
                title="View all call transcripts"
              >
                <MessageSquareText className="h-4 w-4" />
                <span className="hidden sm:inline">View Transcripts</span>
              </Button>
            )}
            
            {/* Demo Mode Indicator */}
            {isDemo && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-warning/20 text-warning text-xs font-medium">
                <FileText className="h-3 w-3" />
                <span>Demo Mode</span>
              </div>
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
                  <Button
                    size="sm"
                    onClick={() => navigate(`/booking/${searchId}`)}
                    className="ml-2 gap-2"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
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
      
      {/* Transcript Review Panel */}
      <TranscriptReviewPanel
        isOpen={showTranscriptPanel}
        onClose={() => setShowTranscriptPanel(false)}
        calls={calls}
        providers={providers}
        winnerId={winnerProviderId}
        onExport={exportLog}
      />
    </div>
  );
}
