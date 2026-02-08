import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, Terminal } from 'lucide-react';
import { IVREvent } from '@/types';
import { cn } from '@/lib/utils';

interface IVRLogPanelProps {
  events: IVREvent[];
  isActive: boolean;
  currentDigit?: string;
  className?: string;
}

const eventTypeToClass: Record<IVREvent['type'], string> = {
  menu_detected: 'menu',
  dtmf_sent: 'dtmf',
  option_selected: 'dtmf',
  routing: 'routing',
  human_reached: 'human',
  timeout: 'error',
  error: 'error',
};

const eventTypeToPrefix: Record<IVREvent['type'], string> = {
  menu_detected: '[MENU]',
  dtmf_sent: '[DTMF]',
  option_selected: '[SELECT]',
  routing: '[ROUTE]',
  human_reached: '[HUMAN]',
  timeout: '[TIMEOUT]',
  error: '[ERROR]',
};

export function IVRLogPanel({ events, isActive, currentDigit, className }: IVRLogPanelProps) {
  if (events.length === 0 && !isActive) return null;

  return (
    <div className={cn('ivr-log rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-900/50 bg-black/50">
        <Terminal className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-emerald-500 text-xs font-mono font-semibold">IVR LOGIC LOG</span>
        
        {/* Keypad indicator */}
        {currentDigit && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="ml-auto flex items-center gap-1.5"
          >
            <Keyboard className="h-3.5 w-3.5 text-emerald-400 keypad-pulse" />
            <span className="text-emerald-400 font-mono text-sm font-bold">
              {currentDigit}
            </span>
          </motion.div>
        )}
      </div>
      
      {/* Log entries */}
      <div className="max-h-24 overflow-y-auto scrollbar-thin p-1">
        <AnimatePresence mode="popLayout">
          {events.slice(-6).map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={cn(
                'ivr-log-entry',
                eventTypeToClass[event.type]
              )}
            >
              <span className="opacity-50">
                {new Date(event.timestamp).toLocaleTimeString('en-US', { 
                  hour12: false, 
                  hour: '2-digit', 
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </span>
              {' '}
              <span className="font-semibold">{eventTypeToPrefix[event.type]}</span>
              {' '}
              {event.message}
              {event.digit && (
                <span className="ml-1 text-emerald-300 font-bold">→ {event.digit}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {events.length === 0 && isActive && (
          <div className="ivr-log-entry text-muted-foreground animate-pulse">
            Monitoring for automated menu...
          </div>
        )}
      </div>
    </div>
  );
}
