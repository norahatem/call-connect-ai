import { motion } from 'framer-motion';
import { Headphones, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmergencyTakeoverButtonProps {
  onTakeover: () => void;
  isActive: boolean;
  isTakenOver: boolean;
  className?: string;
}

export function EmergencyTakeoverButton({ 
  onTakeover, 
  isActive, 
  isTakenOver,
  className 
}: EmergencyTakeoverButtonProps) {
  if (!isActive || isTakenOver) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={className}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onTakeover}
        className={cn(
          'emergency-takeover w-full border-destructive/50 hover:border-destructive',
          'bg-destructive/10 hover:bg-destructive/20 text-destructive',
          'text-xs font-medium'
        )}
      >
        <Headphones className="h-3.5 w-3.5 mr-1.5" />
        Emergency Takeover
        <AlertTriangle className="h-3 w-3 ml-1.5 animate-pulse" />
      </Button>
      
      {isTakenOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 p-2 rounded-lg bg-warning/20 border border-warning/30 text-center"
        >
          <span className="text-warning text-xs font-medium">
            🎧 You have joined the call
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
