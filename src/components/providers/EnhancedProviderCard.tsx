import { motion } from 'framer-motion';
import { MapPin, Phone, User, Bot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { StarRating } from '@/components/ui/star-rating';
import { IVRLogPanel } from '@/components/calling/IVRLogPanel';
import { CallPhaseBar } from '@/components/calling/CallPhaseBar';
import { EmergencyTakeoverButton } from '@/components/calling/EmergencyTakeoverButton';
import { Provider, Call, TranscriptLine, CallPhase, IVREvent } from '@/types';
import { cn } from '@/lib/utils';

interface EnhancedProviderCardProps {
  provider: Provider;
  call?: Call;
  isWinner?: boolean;
  isShuttingDown?: boolean;
  onEmergencyTakeover?: (providerId: string) => void;
  className?: string;
}

export function EnhancedProviderCard({ 
  provider, 
  call, 
  isWinner, 
  isShuttingDown,
  onEmergencyTakeover,
  className 
}: EnhancedProviderCardProps) {
  const status = call?.status || 'queued';
  const phase = call?.phase || 'connecting';
  const isActive = ['dialing', 'connected', 'in_progress'].includes(status);
  const showTranscript = status === 'in_progress' && call?.transcript && call.transcript.length > 0;
  const showIVRLog = isActive && (call?.ivr_events?.length || 0) > 0;
  const isTakenOver = call?.is_emergency_takeover || false;
  
  // Get current DTMF digit from recent events
  const currentDigit = call?.ivr_events?.slice(-1).find(e => e.type === 'dtmf_sent')?.digit;

  const handleTakeover = () => {
    if (onEmergencyTakeover) {
      onEmergencyTakeover(provider.id);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={cn(isShuttingDown && 'call-shutdown')}
    >
      <Card className={cn(
        'glass-card overflow-hidden transition-all duration-300',
        isWinner && 'border-success/50 winner-glow',
        isActive && !isWinner && 'border-primary/30',
        status === 'cancelled' && 'opacity-50',
        isTakenOver && 'border-warning/50',
        className
      )}>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1">
              <h3 className={cn(
                'font-semibold truncate',
                isWinner ? 'text-success' : 'text-foreground'
              )}>
                {provider.name}
              </h3>
              <StarRating 
                rating={provider.rating} 
                reviewCount={provider.review_count}
                className="mt-1"
              />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StatusBadge status={status} />
              {/* Answer type indicator */}
              {call?.answer_type && call.answer_type !== 'unknown' && (
                <div className={cn(
                  'flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5',
                  call.answer_type === 'human' 
                    ? 'bg-primary/20 text-primary' 
                    : 'bg-warning/20 text-warning'
                )}>
                  {call.answer_type === 'human' ? (
                    <><User className="h-2.5 w-2.5" /> Human</>
                  ) : (
                    <><Bot className="h-2.5 w-2.5" /> Machine</>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Phase Progress Bar - Show during active calls */}
          {isActive && phase && (
            <CallPhaseBar phase={phase} className="mb-3" />
          )}

          {/* Details */}
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{provider.distance} mi • {provider.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{provider.phone}</span>
            </div>
          </div>

          {/* Duration timer */}
          {call && ['connected', 'in_progress', 'success'].includes(status) && (
            <div className="mt-3 text-xs text-muted-foreground">
              Duration: {Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}
            </div>
          )}

          {/* IVR Logic Log - Terminal style */}
          {showIVRLog && (
            <IVRLogPanel 
              events={call?.ivr_events as IVREvent[] || []} 
              isActive={isActive}
              currentDigit={currentDigit}
              className="mt-3"
            />
          )}

          {/* Live Transcript with slot highlighting */}
          {showTranscript && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="text-xs font-medium text-muted-foreground mb-2">Live Transcript</div>
              <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1">
                {(call.transcript as TranscriptLine[]).slice(-5).map((line, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      'transcript-line text-xs',
                      line.speaker === 'ai' ? 'transcript-ai' : 'transcript-provider',
                      line.isSlotMatch && 'slot-match-highlight'
                    )}
                  >
                    <span className="font-medium">
                      {line.speaker === 'ai' ? 'AI: ' : 'Provider: '}
                    </span>
                    {line.text}
                    {line.isSlotMatch && line.matchedSlotTime && (
                      <span className="ml-2 text-success text-[10px] font-semibold">
                        ✓ CALENDAR MATCH
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emergency Takeover Button */}
          {isActive && !isWinner && (
            <EmergencyTakeoverButton
              onTakeover={handleTakeover}
              isActive={isActive}
              isTakenOver={isTakenOver}
              className="mt-3"
            />
          )}

          {/* Success slot */}
          {status === 'success' && call?.available_slot && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 p-2 rounded-lg bg-success/10 border border-success/30"
            >
              <div className="text-xs font-medium text-success">
                ✓ Available: {new Date(call.available_slot).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </div>
            </motion.div>
          )}

          {/* Failure reason */}
          {['failed', 'no_answer'].includes(status) && call?.failure_reason && (
            <div className="mt-3 text-xs text-muted-foreground">
              Reason: {call.failure_reason}
            </div>
          )}

          {/* Cancelled message - Enhanced shutdown */}
          {status === 'cancelled' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 p-2 rounded-lg bg-muted/30 border border-muted/50 text-center"
            >
              <span className="text-xs text-muted-foreground font-medium">
                🔒 Cancelled — Slot Secured Elsewhere
              </span>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
