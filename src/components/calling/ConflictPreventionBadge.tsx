import { motion } from 'framer-motion';
import { Shield, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConflictPreventionBadgeProps {
  activeCallCount: number;
  isSecured: boolean;
  className?: string;
}

export function ConflictPreventionBadge({ 
  activeCallCount, 
  isSecured,
  className 
}: ConflictPreventionBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-center gap-2',
        className
      )}
    >
      {isSecured ? (
        <div className="flex items-center gap-2 bg-success/20 text-success border border-success/40 rounded-full px-3 py-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Slot Secured</span>
        </div>
      ) : (
        <div className="conflict-badge flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />
          <span>Conflict Prevention Active</span>
          {activeCallCount > 1 && (
            <span className="bg-primary/30 rounded px-1.5 py-0.5 text-[10px]">
              {activeCallCount} calls
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
