import { cn } from '@/lib/utils';
import { CallPhase } from '@/types';

interface CallPhaseBarProps {
  phase: CallPhase;
  className?: string;
}

const phaseConfig: Record<CallPhase, { 
  label: string; 
  className: string;
  progress: number;
}> = {
  connecting: { 
    label: 'Connecting', 
    className: 'phase-connecting',
    progress: 16
  },
  ivr_detected: { 
    label: 'Menu Detected', 
    className: 'phase-ivr',
    progress: 32
  },
  navigating_menu: { 
    label: 'Navigating Menu', 
    className: 'phase-navigating',
    progress: 48
  },
  talking_to_human: { 
    label: 'Talking to Human', 
    className: 'phase-talking',
    progress: 64
  },
  negotiating: { 
    label: 'Negotiating', 
    className: 'phase-negotiating',
    progress: 80
  },
  finalizing: { 
    label: 'Finalizing', 
    className: 'phase-finalizing',
    progress: 100
  },
  completed: { 
    label: 'Completed', 
    className: 'phase-finalizing',
    progress: 100
  },
};

export function CallPhaseBar({ phase, className }: CallPhaseBarProps) {
  const config = phaseConfig[phase];
  
  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Phase label */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Status:</span>
        <span className="font-medium text-foreground">{config.label}</span>
      </div>
      
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all duration-500 ease-out', config.className)}
          style={{ width: `${config.progress}%` }}
        />
      </div>
      
      {/* Phase indicators */}
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>Connect</span>
        <span>IVR</span>
        <span>Human</span>
        <span>Book</span>
      </div>
    </div>
  );
}
