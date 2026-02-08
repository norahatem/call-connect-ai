import { motion } from 'framer-motion';
import { MapPin, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { StarRating } from '@/components/ui/star-rating';
import { Provider, Call, TranscriptLine } from '@/types';
import { cn } from '@/lib/utils';

interface ProviderCardProps {
  provider: Provider;
  call?: Call;
  isWinner?: boolean;
  className?: string;
}

export function ProviderCard({ provider, call, isWinner, className }: ProviderCardProps) {
  const status = call?.status || 'queued';
  const isActive = ['dialing', 'connected', 'in_progress'].includes(status);
  const showTranscript = status === 'in_progress' && call?.transcript && call.transcript.length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn(
        'glass-card overflow-hidden transition-all duration-300',
        isWinner && 'border-success/50 winner-glow',
        isActive && 'border-primary/30',
        status === 'cancelled' && 'opacity-50',
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
            <StatusBadge status={status} />
          </div>

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

          {/* Live Transcript */}
          {showTranscript && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="text-xs font-medium text-muted-foreground mb-2">Live Transcript</div>
              <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1">
                {(call.transcript as TranscriptLine[]).slice(-3).map((line, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      'transcript-line text-xs',
                      line.speaker === 'ai' ? 'transcript-ai' : 'transcript-provider'
                    )}
                  >
                    <span className="font-medium">
                      {line.speaker === 'ai' ? 'AI: ' : 'Provider: '}
                    </span>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
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

          {/* Cancelled message */}
          {status === 'cancelled' && (
            <div className="mt-3 text-xs text-muted-foreground italic">
              Booking secured elsewhere
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
