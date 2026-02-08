import { motion } from 'framer-motion';
import { Phone, Users, Check } from 'lucide-react';
import { BookingMode } from '@/types';
import { cn } from '@/lib/utils';

interface BookingModeSelectorProps {
  value: BookingMode;
  onChange: (mode: BookingMode) => void;
}

export function BookingModeSelector({ value, onChange }: BookingModeSelectorProps) {
  const modes = [
    {
      id: 'single' as BookingMode,
      title: 'Quick Book',
      description: 'First available slot gets booked instantly',
      icon: Phone,
      features: ['Fastest option', 'Race to first success', 'Automatic booking'],
    },
    {
      id: 'multi' as BookingMode,
      title: 'Compare & Choose',
      description: 'Scout 15 providers, rank results, then you pick',
      icon: Users,
      features: ['AI ranks top 3', 'You make final choice', 'Two-stage process'],
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {modes.map((mode) => (
        <motion.button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "relative p-5 rounded-xl border-2 text-left transition-all",
            value === mode.id
              ? "border-primary bg-primary/5"
              : "border-border/50 bg-card hover:border-border"
          )}
        >
          {value === mode.id && (
            <div className="absolute top-3 right-3">
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>
          )}
          
          <mode.icon className={cn(
            "h-8 w-8 mb-3",
            value === mode.id ? "text-primary" : "text-muted-foreground"
          )} />
          
          <h3 className="font-semibold mb-1">{mode.title}</h3>
          <p className="text-sm text-muted-foreground mb-3">{mode.description}</p>
          
          <ul className="space-y-1">
            {mode.features.map((feature) => (
              <li key={feature} className="text-xs text-muted-foreground flex items-center gap-2">
                <div className={cn(
                  "w-1 h-1 rounded-full",
                  value === mode.id ? "bg-primary" : "bg-muted-foreground"
                )} />
                {feature}
              </li>
            ))}
          </ul>
        </motion.button>
      ))}
    </div>
  );
}
