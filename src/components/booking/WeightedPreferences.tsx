import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Sliders } from 'lucide-react';
import { ScoringWeight } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface WeightedPreferencesProps {
  weights: ScoringWeight[];
  onChange: (weights: ScoringWeight[]) => void;
}

const presetCriteria = [
  'Distance from me',
  'Travel time',
  'Provider rating',
  'Earliest availability',
  'Price',
  'Accessibility',
  'Parking available',
  'Public transport access',
];

export function WeightedPreferences({ weights, onChange }: WeightedPreferencesProps) {
  const [newCriterion, setNewCriterion] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const addWeight = (criterion: string) => {
    if (!criterion.trim()) return;
    if (weights.some(w => w.criterion.toLowerCase() === criterion.toLowerCase())) return;

    const newWeight: ScoringWeight = {
      id: crypto.randomUUID(),
      criterion: criterion.trim(),
      weight: 5,
    };
    onChange([...weights, newWeight]);
    setNewCriterion('');
    setShowPresets(false);
  };

  const updateWeight = (id: string, weight: number) => {
    onChange(weights.map(w => w.id === id ? { ...w, weight } : w));
  };

  const removeWeight = (id: string) => {
    onChange(weights.filter(w => w.id !== id));
  };

  const availablePresets = presetCriteria.filter(
    p => !weights.some(w => w.criterion.toLowerCase() === p.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-border/50 bg-card/50 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sliders className="h-4 w-4 text-primary" />
          Ranking Preferences
        </div>
        <span className="text-xs text-muted-foreground">
          {weights.length} criteria
        </span>
      </div>

      {/* Existing weights */}
      <AnimatePresence mode="popLayout">
        {weights.map((weight) => (
          <motion.div
            key={weight.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">{weight.criterion}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {weight.weight}/10
                </span>
                <button
                  type="button"
                  onClick={() => removeWeight(weight.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Slider
              value={[weight.weight]}
              onValueChange={([value]) => updateWeight(weight.id, value)}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Add new criterion */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            placeholder="Add custom preference..."
            className="flex-1 bg-background"
            onKeyDown={(e) => e.key === 'Enter' && addWeight(newCriterion)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowPresets(!showPresets)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Preset suggestions */}
        <AnimatePresence>
          {showPresets && availablePresets.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2"
            >
              {availablePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addWeight(preset)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-full border border-border/50",
                    "bg-background hover:bg-primary/10 hover:border-primary/30",
                    "transition-colors"
                  )}
                >
                  + {preset}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
