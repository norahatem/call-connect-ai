import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowLeft, Zap, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { ProviderCard } from '@/components/providers/ProviderCard';
import { useAuth } from '@/hooks/useAuth';
import { useAICall } from '@/hooks/useAICall';
import { supabase } from '@/integrations/supabase/client';
import { Provider, Call, Search, CallContextData } from '@/types';

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

  const { 
    callStates, 
    initiateCall, 
    cancelAllCalls, 
    isAudioEnabled, 
    setIsAudioEnabled 
  } = useAICall({
    onCallComplete: useCallback((providerId: string, result) => {
      if (!result) return;
      // Sync result to calls state
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
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

  // Sync callStates to calls
  useEffect(() => {
    callStates.forEach((state, providerId) => {
      if (!state) return;
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
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
  }, [callStates]);

  // Load search and providers
  useEffect(() => {
    if (!searchId || !user) return;

    const loadData = async () => {
      // Load search
      const { data: searchData } = await supabase
        .from('searches')
        .select('*')
        .eq('id', searchId)
        .single();

      if (searchData) {
        setSearch(searchData as unknown as Search);
      }

      // Load providers
      const { data: providersData } = await supabase
        .from('providers')
        .select('*')
        .eq('search_id', searchId)
        .order('rating', { ascending: false });

      if (providersData) {
        const typedProviders = providersData as unknown as Provider[];
        setProviders(typedProviders);
        setCallQueue(typedProviders.map(p => p.id));
        
        // Initialize calls with queued status
        const initialCalls = new Map<string, Call>();
        typedProviders.forEach(provider => {
          initialCalls.set(provider.id, {
            id: crypto.randomUUID(),
            search_id: searchId,
            provider_id: provider.id,
            status: 'queued',
            transcript: [],
            duration: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        });
        setCalls(initialCalls);
      }
    };

    loadData();
  }, [searchId, user]);

  // Check for winner
  useEffect(() => {
    if (winnerProviderId) return;

    const successfulCall = Array.from(calls.entries()).find(([_, call]) => call.status === 'success');
    if (successfulCall) {
      const [providerId, call] = successfulCall;
      setWinnerProviderId(providerId);
      setCallingActive(false);
      cancelAllCalls();

      // Cancel other calls
      setCalls(prev => {
        const newCalls = new Map(prev);
        newCalls.forEach((c, id) => {
          if (id !== providerId && ['queued', 'dialing', 'connected', 'in_progress'].includes(c.status)) {
            newCalls.set(id, { ...c, status: 'cancelled', updated_at: new Date().toISOString() });
          }
        });
        return newCalls;
      });

      // Create booking in database
      const provider = providers.find(p => p.id === providerId);
      const state = callStates.get(providerId);
      
      if (state?.confirmationCode && state?.availableSlot) {
        supabase.from('bookings').insert({
          user_id: user?.id,
          call_id: call.id,
          provider_id: providerId,
          appointment_time: state.availableSlot.toISOString(),
          confirmation_code: state.confirmationCode
        });
      }

      // Celebration!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#ffffff']
      });

      // Navigate to confirmation after a delay
      setTimeout(() => {
        navigate(`/booking/${searchId}`);
      }, 3000);
    }
  }, [calls, winnerProviderId, cancelAllCalls, callStates, providers, user, navigate, searchId]);

  // Start calling sequence
  useEffect(() => {
    if (callQueue.length === 0 || !callingActive || !search || providers.length === 0) return;

    const preferences = search.preferences as CallContextData | undefined;
    const context: CallContextData = {
      purpose: preferences?.purpose || 'new_appointment',
      details: preferences?.details || '',
      time_preference: preferences?.time_preference || 'flexible',
    };

    // Start 3 calls in parallel initially
    const startInitialCalls = async () => {
      const initialBatch = callQueue.slice(0, 3);
      initialBatch.forEach((providerId, index) => {
        const provider = providers.find(p => p.id === providerId);
        if (provider) {
          setTimeout(() => {
            initiateCall(provider, search.service, 'Customer', context);
          }, index * 1500);
        }
      });
      setCurrentCallIndex(3);
    };

    const timeoutId = setTimeout(startInitialCalls, 500);
    return () => clearTimeout(timeoutId);
  }, [callQueue, providers, search, callingActive]);

  // Continue with more calls as previous ones complete
  useEffect(() => {
    if (!callingActive || winnerProviderId || !search || providers.length === 0) return;
    
    const completedCount = Array.from(calls.values()).filter(
      c => ['success', 'failed', 'no_answer', 'cancelled'].includes(c.status)
    ).length;

    const activeCount = Array.from(calls.values()).filter(
      c => ['dialing', 'connected', 'in_progress'].includes(c.status)
    ).length;

    // Start next call if we have capacity (max 3 concurrent)
    if (activeCount < 3 && currentCallIndex < callQueue.length) {
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
                navigate('/dashboard');
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          
          <div className="flex items-center gap-6">
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
                    {activeCallCount} active call{activeCallCount !== 1 ? 's' : ''}
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
          {search && (
            <p className="text-muted-foreground">
              Finding you the best {search.service} in {search.location}
            </p>
          )}
        </motion.div>

        {/* Provider grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {providers.map(provider => {
              const call = calls.get(provider.id);
              return (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  call={call}
                  isWinner={provider.id === winnerProviderId}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
