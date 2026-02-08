import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface AdditionalRequirementsProps {
  value: string;
  onChange: (value: string) => void;
}

export function AdditionalRequirements({ value, onChange }: AdditionalRequirementsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <Label className="text-sm font-medium flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        Additional Requirements
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Any special requirements, disabilities, accessibility needs, or preferences not covered above..."
        className="min-h-[80px] bg-background border-border/50"
      />
      <p className="text-xs text-muted-foreground">
        This information will be shared with the AI caller to ensure your needs are communicated.
      </p>
    </motion.div>
  );
}
