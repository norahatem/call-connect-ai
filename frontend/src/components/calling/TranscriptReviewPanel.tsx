import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronRight, Phone, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Call, Provider, TranscriptLine } from '@/types';
import { cn } from '@/lib/utils';

interface TranscriptReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  calls: Map<string, Call>;
  providers: Provider[];
  winnerId: string | null;
  onExport: () => void;
}

export function TranscriptReviewPanel({
  isOpen,
  onClose,
  calls,
  providers,
  winnerId,
  onExport,
}: TranscriptReviewPanelProps) {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set([winnerId || '']));

  const toggleExpanded = (providerId: string) => {
    setExpandedCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(providerId)) {
        newSet.delete(providerId);
      } else {
        newSet.add(providerId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: Call['status'], isWinner: boolean) => {
    if (isWinner) return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (status === 'cancelled') return <XCircle className="h-4 w-4 text-muted-foreground" />;
    if (status === 'failed' || status === 'no_answer') return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: Call['status'], isWinner: boolean, failureReason?: string) => {
    if (isWinner) {
      return <Badge className="bg-success/20 text-success border-success/30">Winner</Badge>;
    }
    if (status === 'cancelled') {
      return <Badge variant="outline" className="text-muted-foreground">{failureReason || 'Cancelled'}</Badge>;
    }
    if (status === 'failed') {
      return <Badge variant="destructive">{failureReason || 'Failed'}</Badge>;
    }
    if (status === 'no_answer') {
      return <Badge variant="outline" className="text-warning">No Answer</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const sortedProviders = [...providers].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    const callA = calls.get(a.id);
    const callB = calls.get(b.id);
    if (callA?.status === 'success' && callB?.status !== 'success') return -1;
    if (callA?.status !== 'success' && callB?.status === 'success') return 1;
    return 0;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Call Transcripts</h2>
                <Badge variant="outline" className="ml-2">
                  {calls.size} calls
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export JSON
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="h-[calc(100vh-73px)]">
              <div className="p-4 space-y-3">
                {sortedProviders.map(provider => {
                  const call = calls.get(provider.id);
                  if (!call || call.status === 'queued') return null;
                  
                  const isWinner = provider.id === winnerId;
                  const isExpanded = expandedCalls.has(provider.id);
                  const transcript = call.transcript || [];

                  return (
                    <motion.div
                      key={provider.id}
                      layout
                      className={cn(
                        "border rounded-lg overflow-hidden",
                        isWinner ? "border-success/50 bg-success/5" : "border-border bg-card"
                      )}
                    >
                      {/* Provider Header */}
                      <button
                        onClick={() => toggleExpanded(provider.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {getStatusIcon(call.status, isWinner)}
                          <div className="text-left">
                            <div className="font-medium">{provider.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {transcript.length} messages • {call.duration}s
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(call.status, isWinner, call.failure_reason)}
                      </button>

                      {/* Transcript */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className="border-t border-border bg-muted/30 p-4">
                              {transcript.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">
                                  No transcript available - call was not connected
                                </p>
                              ) : (
                                <div className="space-y-3 font-mono text-sm">
                                  {transcript.map((line, index) => (
                                    <TranscriptMessage key={index} line={line} index={index} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TranscriptMessage({ line, index }: { line: TranscriptLine; index: number }) {
  const isAI = line.speaker === 'ai';
  
  return (
    <div className={cn(
      "flex gap-3",
      line.isSlotMatch && "bg-primary/10 -mx-2 px-2 py-1 rounded border-l-2 border-primary"
    )}>
      <div className={cn(
        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
        isAI ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {isAI ? '🤖' : '👤'}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn(
            "text-xs font-medium",
            isAI ? "text-primary" : "text-foreground"
          )}>
            {isAI ? 'AI Agent' : 'Provider'}
          </span>
          {line.isSlotMatch && line.matchedSlotTime && (
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
              📅 Matched: {line.matchedSlotTime}
            </Badge>
          )}
        </div>
        <p className="text-foreground/90 leading-relaxed">{line.text}</p>
      </div>
    </div>
  );
}
