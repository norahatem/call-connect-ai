import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CallContextData } from '@/types';

interface CallContextModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (context: CallContextData) => void;
  service: string;
  providerCount: number;
}

export function CallContextModal({ 
  open, 
  onOpenChange, 
  onSubmit,
  service,
  providerCount
}: CallContextModalProps) {
  const [purpose, setPurpose] = useState<CallContextData['purpose']>('new_appointment');
  const [details, setDetails] = useState('');
  const [timePreference, setTimePreference] = useState<CallContextData['time_preference']>('flexible');

  const handleSubmit = () => {
    onSubmit({ purpose, details, time_preference: timePreference });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="text-xl">Before we call...</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Help us find you the perfect appointment by providing some context.
          </DialogDescription>
        </DialogHeader>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5 pt-4"
        >
          {/* Purpose */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">What's the purpose?</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as CallContextData['purpose'])}>
              <SelectTrigger className="bg-background border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_appointment">New Appointment</SelectItem>
                <SelectItem value="reschedule">Reschedule Existing</SelectItem>
                <SelectItem value="general_inquiry">General Inquiry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time preference */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Preferred time
            </Label>
            <Select value={timePreference} onValueChange={(v) => setTimePreference(v as CallContextData['time_preference'])}>
              <SelectTrigger className="bg-background border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning (8 AM - 12 PM)</SelectItem>
                <SelectItem value="afternoon">Afternoon (12 PM - 5 PM)</SelectItem>
                <SelectItem value="evening">Evening (5 PM - 8 PM)</SelectItem>
                <SelectItem value="flexible">Flexible</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Additional details */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Additional details for the provider
            </Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={`e.g., "Need urgent repair for leaking pipe" or "First time patient, need full checkup"`}
              className="min-h-[80px] bg-background border-border/50 placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Action button */}
          <Button 
            onClick={handleSubmit}
            className="w-full h-12 text-base font-semibold bg-gradient-primary hover:opacity-90 transition-opacity glow-primary"
          >
            Start Calling {providerCount} Providers
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Our AI will identify itself and request your preferred appointment time.
          </p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
