import { useState, useCallback, useRef } from 'react';
import { Call, TranscriptLine, Provider } from '@/types';

export interface TranscriptLogEntry {
  id: string;
  providerId: string;
  providerName: string;
  status: Call['status'];
  transcript: TranscriptLine[];
  startTime: string;
  endTime: string;
  duration: number;
  failureReason?: string;
  wasWinner: boolean;
}

export function useCallTranscriptLog() {
  const [transcriptLog, setTranscriptLog] = useState<TranscriptLogEntry[]>([]);
  const logRef = useRef<TranscriptLogEntry[]>([]);

  const logCall = useCallback((
    call: Call,
    provider: Provider,
    wasWinner: boolean
  ) => {
    const entry: TranscriptLogEntry = {
      id: call.id,
      providerId: call.provider_id,
      providerName: provider.name,
      status: call.status,
      transcript: call.transcript || [],
      startTime: call.created_at,
      endTime: call.updated_at,
      duration: call.duration,
      failureReason: call.failure_reason,
      wasWinner,
    };

    logRef.current = [...logRef.current, entry];
    setTranscriptLog(logRef.current);
    
    // Also log to console for debugging
    console.log(`📞 [Call Log] ${provider.name}:`, {
      status: call.status,
      wasWinner,
      transcriptLines: call.transcript?.length || 0,
      failureReason: call.failure_reason,
    });

    return entry;
  }, []);

  const logAllCalls = useCallback((
    calls: Map<string, Call>,
    providers: Provider[],
    winnerId: string | null
  ) => {
    const entries: TranscriptLogEntry[] = [];
    
    calls.forEach((call, providerId) => {
      const provider = providers.find(p => p.id === providerId);
      if (provider && call.status !== 'queued') {
        const entry: TranscriptLogEntry = {
          id: call.id,
          providerId: call.provider_id,
          providerName: provider.name,
          status: call.status,
          transcript: call.transcript || [],
          startTime: call.created_at,
          endTime: call.updated_at,
          duration: call.duration,
          failureReason: call.failure_reason,
          wasWinner: providerId === winnerId,
        };
        entries.push(entry);
      }
    });

    logRef.current = entries;
    setTranscriptLog(entries);
    
    // Log summary to console
    console.log('📋 [Session Transcript Log]', {
      totalCalls: entries.length,
      winner: entries.find(e => e.wasWinner)?.providerName || 'None',
      cancelled: entries.filter(e => e.status === 'cancelled').length,
      failed: entries.filter(e => e.status === 'failed').length,
    });
    
    // Log each call's transcript
    entries.forEach(entry => {
      console.group(`📞 ${entry.providerName} (${entry.status}${entry.wasWinner ? ' ⭐ WINNER' : ''})`);
      console.log('Duration:', entry.duration, 'seconds');
      if (entry.failureReason) console.log('Reason:', entry.failureReason);
      console.log('Transcript:');
      entry.transcript.forEach((line, i) => {
        const speaker = line.speaker === 'ai' ? '🤖 AI' : '👤 Provider';
        console.log(`  ${i + 1}. ${speaker}: ${line.text}`);
      });
      console.groupEnd();
    });

    return entries;
  }, []);

  const clearLog = useCallback(() => {
    logRef.current = [];
    setTranscriptLog([]);
  }, []);

  const exportLog = useCallback(() => {
    const logData = JSON.stringify(logRef.current, null, 2);
    const blob = new Blob([logData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-transcripts-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    transcriptLog,
    logCall,
    logAllCalls,
    clearLog,
    exportLog,
  };
}
