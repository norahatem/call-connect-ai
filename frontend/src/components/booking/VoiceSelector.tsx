import { motion } from 'framer-motion';
import { User, Globe } from 'lucide-react';
import { VoicePreference } from '@/types';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface VoiceSelectorProps {
  value: VoicePreference;
  onChange: (voice: VoicePreference) => void;
}

const genderOptions = [
  { value: 'neutral', label: 'No preference' },
  { value: 'male', label: 'Male voice' },
  { value: 'female', label: 'Female voice' },
];

const accentOptions = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'british', label: 'British' },
  { value: 'american', label: 'American' },
  { value: 'australian', label: 'Australian' },
  { value: 'indian', label: 'Indian' },
];

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-border/50 bg-card/50 space-y-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <User className="h-4 w-4 text-primary" />
        AI Caller Voice
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Gender</Label>
          <Select
            value={value.gender}
            onValueChange={(gender) => onChange({ ...value, gender: gender as VoicePreference['gender'] })}
          >
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {genderOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Globe className="h-3 w-3" />
            Accent
          </Label>
          <Select
            value={value.accent}
            onValueChange={(accent) => onChange({ ...value, accent: accent as VoicePreference['accent'] })}
          >
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </motion.div>
  );
}
