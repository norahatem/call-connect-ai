import { cn } from '@/lib/utils';
import { CallStatus } from '@/types';
import { Phone, PhoneCall, PhoneOff, Check, X, Clock, Ban } from 'lucide-react';

interface StatusBadgeProps {
  status: CallStatus;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<CallStatus, { 
  label: string; 
  className: string;
  icon: typeof Phone;
}> = {
  queued: { 
    label: 'Queued', 
    className: 'status-queued',
    icon: Clock
  },
  dialing: { 
    label: 'Dialing...', 
    className: 'status-dialing',
    icon: Phone
  },
  connected: { 
    label: 'Connected', 
    className: 'status-connected',
    icon: PhoneCall
  },
  in_progress: { 
    label: 'In Progress', 
    className: 'status-in-progress',
    icon: PhoneCall
  },
  success: { 
    label: 'Booked!', 
    className: 'status-success',
    icon: Check
  },
  failed: { 
    label: 'Failed', 
    className: 'status-failed',
    icon: X
  },
  no_answer: { 
    label: 'No Answer', 
    className: 'status-failed',
    icon: PhoneOff
  },
  cancelled: { 
    label: 'Cancelled', 
    className: 'status-cancelled',
    icon: Ban
  }
};

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border',
      config.className,
      className
    )}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </div>
  );
}
