import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowLeft, Zap, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { ProviderCard } from '@/components/providers/ProviderCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Provider, Call, Search, TranscriptLine, CallContextData } from '@/types';
import { simulateCall } from '@/lib/call-simulation';

export default function WarRoomPage() {
  const navigate = useNavigate();
  const { searchId } = useParams<{ searchId: string }>();
  const { user } = useAuth();
  
  const [search, setSearch] = useState<Search | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [calls, setCalls] = useState<Map<string, Call>>(new Map());
  const [winnerProviderId, setWinnerProviderId] = useState<string | null>(null);
  const [callingActive, setCallingActive] = useState(true);
  const [callQueue, setCallQueue] = useState<string[]>([]);
  const [currentCallIndex, setCurrentCallIndex] = useState(0);

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

  // Simulate calling process
  const simulateCallProcess = useCallback(async (providerId: string) => {
    if (!search || !callingActive || winnerProviderId) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Update to dialing
    setCalls(prev => {
      const newCalls = new Map(prev);
      const call = newCalls.get(providerId);
      if (call) {
        newCalls.set(providerId, { ...call, status: 'dialing', updated_at: new Date().toISOString() });
      }
      return newCalls;
    });

    // Wait 2-4 seconds for dialing
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
    
    if (!callingActive || winnerProviderId) return;

    // Random chance of no answer
    if (Math.random() < 0.15) {
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          newCalls.set(providerId, { 
            ...call, 
            status: 'no_answer', 
            failure_reason: 'No answer after 30 seconds',
            duration: 30,
            updated_at: new Date().toISOString() 
          });
        }
        return newCalls;
      });
      return;
    }

    // Connected
    setCalls(prev => {
      const newCalls = new Map(prev);
      const call = newCalls.get(providerId);
      if (call) {
        newCalls.set(providerId, { ...call, status: 'connected', updated_at: new Date().toISOString() });
      }
      return newCalls;
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (!callingActive || winnerProviderId) return;

    // In progress with transcript simulation
    const preferences = search.preferences as CallContextData | undefined;
    const result = simulateCall(
      search.service,
      'Customer',
      preferences?.time_preference || 'flexible',
      preferences?.details || ''
    );

    // Simulate transcript appearing over time
    setCalls(prev => {
      const newCalls = new Map(prev);
      const call = newCalls.get(providerId);
      if (call) {
        newCalls.set(providerId, { ...call, status: 'in_progress', updated_at: new Date().toISOString() });
      }
      return newCalls;
    });

    // Stream transcript lines
    for (let i = 0; i < result.transcript.length; i++) {
      if (!callingActive || winnerProviderId) break;
      
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));
      
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          const newTranscript = [...(call.transcript as TranscriptLine[]), result.transcript[i]];
          newCalls.set(providerId, { 
            ...call, 
            transcript: newTranscript,
            duration: call.duration + 2,
            updated_at: new Date().toISOString() 
          });
        }
        return newCalls;
      });
    }

    if (winnerProviderId) return;

    // Final result
    if (result.status === 'success') {
      setWinnerProviderId(providerId);
      setCallingActive(false);
      
      // Update winning call
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          newCalls.set(providerId, { 
            ...call, 
            status: 'success',
            available_slot: result.availableSlot?.toISOString(),
            duration: result.duration,
            updated_at: new Date().toISOString() 
          });
        }
        
        // Cancel other active calls
        newCalls.forEach((c, id) => {
          if (id !== providerId && ['queued', 'dialing', 'connected', 'in_progress'].includes(c.status)) {
            newCalls.set(id, { ...c, status: 'cancelled', updated_at: new Date().toISOString() });
          }
        });
        
        return newCalls;
      });

      // Create booking in database
      if (result.confirmationCode && result.availableSlot) {
        await supabase.from('bookings').insert({
          user_id: user?.id,
          call_id: calls.get(providerId)?.id,
          provider_id: providerId,
          appointment_time: result.availableSlot.toISOString(),
          confirmation_code: result.confirmationCode
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
    } else {
      setCalls(prev => {
        const newCalls = new Map(prev);
        const call = newCalls.get(providerId);
        if (call) {
          newCalls.set(providerId, { 
            ...call, 
            status: result.status,
            failure_reason: result.failureReason,
            duration: result.duration,
            updated_at: new Date().toISOString() 
          });
        }
        return newCalls;
      });
    }
  }, [search, callingActive, winnerProviderId, providers, navigate, user, calls]);

  // Start calling sequence
  useEffect(() => {
    if (callQueue.length === 0 || !callingActive) return;

    // Start 3 calls in parallel initially
    const startInitialCalls = async () => {
      const initialBatch = callQueue.slice(0, 3);
      initialBatch.forEach((providerId, index) => {
        setTimeout(() => {
          simulateCallProcess(providerId);
        }, index * 1000);
      });
      setCurrentCallIndex(3);
    };

    startInitialCalls();
  }, [callQueue]);

  // Continue with more calls as previous ones complete
  useEffect(() => {
    if (!callingActive || winnerProviderId) return;
    
    const completedCount = Array.from(calls.values()).filter(
      c => ['success', 'failed', 'no_answer', 'cancelled'].includes(c.status)
    ).length;

    if (completedCount > 0 && currentCallIndex < callQueue.length) {
      const nextProviderId = callQueue[currentCallIndex];
      setCurrentCallIndex(prev => prev + 1);
      simulateCallProcess(nextProviderId);
    }
  }, [calls, currentCallIndex, callQueue, callingActive, winnerProviderId, simulateCallProcess]);

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
              onClick={() => navigate('/dashboard')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          
          <div className="flex items-center gap-6">
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
              {winnerProviderId ? 'Appointment Booked!' : 'Calling Providers...'}
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
