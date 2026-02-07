import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchBoxProps {
  onSearch: (service: string, location: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function SearchBox({ onSearch, isLoading, className }: SearchBoxProps) {
  const [service, setService] = useState('');
  const [location, setLocation] = useState('San Francisco, CA');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (service.trim() && location.trim()) {
      onSearch(service.trim(), location.trim());
    }
  };

  const suggestions = [
    'Emergency plumber',
    'Teeth cleaning',
    'Hair salon',
    'Auto repair',
    'House cleaning'
  ];

  return (
    <div className={cn('w-full max-w-2xl mx-auto', className)}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main search input */}
        <div className="relative input-glow rounded-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="What service do you need?"
            className="h-14 pl-12 pr-4 text-lg bg-card border-border/50 rounded-xl placeholder:text-muted-foreground/50 focus-visible:ring-primary"
            disabled={isLoading}
          />
        </div>

        {/* Location input */}
        <div className="relative input-glow rounded-xl">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Your location"
            className="h-12 pl-12 pr-4 bg-card border-border/50 rounded-xl placeholder:text-muted-foreground/50 focus-visible:ring-primary"
            disabled={isLoading}
          />
        </div>

        {/* Search button */}
        <Button 
          type="submit" 
          size="lg"
          className="w-full h-12 text-base font-semibold bg-gradient-primary hover:opacity-90 transition-opacity glow-primary"
          disabled={isLoading || !service.trim() || !location.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Discovering providers...
            </>
          ) : (
            <>
              <Search className="mr-2 h-5 w-5" />
              Find Providers
            </>
          )}
        </Button>
      </form>

      {/* Quick suggestions */}
      {!isLoading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex flex-wrap justify-center gap-2"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setService(suggestion)}
              className="px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-full transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
