import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className, showText = true, size = 'md' }: LogoProps) {
  const sizes = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10'
  };
  
  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl'
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'relative flex items-center justify-center rounded-xl bg-gradient-primary p-2',
        sizes[size]
      )}>
        <Phone className="h-full w-full text-white" strokeWidth={2.5} />
        <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md" />
      </div>
      {showText && (
        <span className={cn(
          'font-bold tracking-tight',
          textSizes[size]
        )}>
          <span className="text-foreground">Call</span>
          <span className="text-gradient-primary">Flow</span>
        </span>
      )}
    </div>
  );
}
