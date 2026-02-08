import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useSmartIntake } from '@/hooks/useSmartIntake';
import { IntakeField, IntakeFormData } from '@/types/intake';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface SmartIntakeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (data: IntakeFormData, category: string) => void;
  service: string;
}

type IntakeStep = 'initial' | 'analyzing' | 'form';

export function SmartIntakeModal({
  open,
  onOpenChange,
  onComplete,
  service,
}: SmartIntakeModalProps) {
  const [step, setStep] = useState<IntakeStep>('initial');
  const [initialDetails, setInitialDetails] = useState('');
  const [formData, setFormData] = useState<IntakeFormData>({});
  const [showOptional, setShowOptional] = useState(false);
  const [savedUserData, setSavedUserData] = useState<{ name?: string; dateOfBirth?: string }>({});

  const { isAnalyzing, analysis, analyzeIntake, buildCompleteData, reset } = useSmartIntake();

  // Load saved user data from profile in database
  useEffect(() => {
    const loadProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, date_of_birth')
        .eq('user_id', user.id)
        .single();
      
      if (profile) {
        setSavedUserData({
          name: profile.full_name || undefined,
          dateOfBirth: profile.date_of_birth || undefined,
        });
      }
    };
    
    loadProfileData();
  }, []);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep('initial');
      setInitialDetails('');
      setFormData({});
      setShowOptional(false);
      reset();
    }
  }, [open, reset]);

  const handleInitialSubmit = async () => {
    setStep('analyzing');
    const result = await analyzeIntake(service, initialDetails);
    
    if (result) {
      // Pre-fill form with extracted info + saved user data
      const prefilledData: IntakeFormData = { ...result.extractedInfo };
      
      // Auto-fill name fields from saved data
      const nameKey = result.allFields.find(f => 
        f.key.includes('name') && f.type === 'text'
      )?.key;
      if (nameKey && savedUserData.name && !prefilledData[nameKey]) {
        prefilledData[nameKey] = savedUserData.name;
      }
      
      // Auto-fill date of birth from saved data
      if (savedUserData.dateOfBirth && !prefilledData['date_of_birth']) {
        prefilledData['date_of_birth'] = savedUserData.dateOfBirth;
      }
      
      setFormData(prefilledData);
      setStep('form');
    } else {
      // Fallback to initial on error
      setStep('initial');
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    // Save name and DOB to user profile in database
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const nameKey = analysis?.allFields.find(f => f.key.includes('name') && f.type === 'text')?.key;
      const updates: { full_name?: string; date_of_birth?: string } = {};
      
      if (nameKey && formData[nameKey]) {
        updates.full_name = formData[nameKey];
      }
      if (formData['date_of_birth']) {
        updates.date_of_birth = formData['date_of_birth'];
      }
      
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('profiles')
          .update(updates)
          .eq('user_id', user.id);
      }
    }
    
    const completeData = buildCompleteData(formData);
    onComplete(completeData, analysis?.category || 'general');
  };

  const renderField = (field: IntakeField) => {
    const value = formData[field.key] || '';
    const isExtracted = analysis?.extractedInfo[field.key] || 
      (field.key.includes('name') && savedUserData.name && formData[field.key] === savedUserData.name) ||
      (field.key === 'date_of_birth' && savedUserData.dateOfBirth && formData[field.key] === savedUserData.dateOfBirth);

    return (
      <motion.div
        key={field.key}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <Label className="text-sm font-medium flex items-center gap-2">
          {field.label}
          {field.required && <span className="text-destructive">*</span>}
          {isExtracted && (
            <span className="text-xs text-primary flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Auto-filled
            </span>
          )}
        </Label>

        {field.type === 'text' && (
          <Input
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={cn(
              "bg-background border-border/50",
              isExtracted && "ring-1 ring-primary/30"
            )}
          />
        )}

        {field.type === 'date' && (
          <Input
            type="text"
            placeholder="dd/mm/yyyy"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={cn(
              "bg-background border-border/50",
              isExtracted && "ring-1 ring-primary/30"
            )}
          />
        )}

        {field.type === 'textarea' && (
          <Textarea
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={cn(
              "min-h-[80px] bg-background border-border/50",
              isExtracted && "ring-1 ring-primary/30"
            )}
          />
        )}

        {field.type === 'select' && field.options && (
          <Select value={value} onValueChange={(v) => handleFieldChange(field.key, v)}>
            <SelectTrigger className={cn(
              "bg-background border-border/50",
              isExtracted && "ring-1 ring-primary/30"
            )}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </motion.div>
    );
  };

  const isFormValid = () => {
    if (!analysis) return false;
    return analysis.missingFields.every(field => {
      const value = formData[field.key];
      return value && value.trim() !== '';
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Smart Booking
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 'initial' && "Tell us what you need and we'll figure out the rest."}
            {step === 'analyzing' && "Analyzing your request..."}
            {step === 'form' && "Please fill in the remaining details."}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1: Initial details */}
          {step === 'initial' && (
            <motion.div
              key="initial"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 pt-4"
            >
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  What do you need for your {service.toLowerCase()} appointment?
                </Label>
                <Textarea
                  value={initialDetails}
                  onChange={(e) => setInitialDetails(e.target.value)}
                  placeholder={`e.g., "I need a checkup, my name is John Smith and I was born on 1990-05-15" or just "teeth cleaning"`}
                  className="min-h-[120px] bg-background border-border/50"
                />
                <p className="text-xs text-muted-foreground">
                  Include any details you have - we'll ask for what's missing.
                </p>
              </div>

              <Button
                onClick={handleInitialSubmit}
                disabled={!initialDetails.trim()}
                className="w-full h-12 bg-gradient-primary hover:opacity-90"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: Analyzing */}
          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-12 space-y-4"
            >
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary animate-pulse" />
              </div>
              <p className="text-muted-foreground text-sm">
                Analyzing your request...
              </p>
            </motion.div>
          )}

          {/* Step 3: Dynamic form */}
          {step === 'form' && analysis && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 pt-4"
            >
              {/* Category badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                  {analysis.category}
                </span>
                {Object.keys(analysis.extractedInfo).length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {Object.keys(analysis.extractedInfo).length} field(s) auto-filled
                  </span>
                )}
              </div>

              {/* Missing required fields */}
              {analysis.missingFields.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Required Information
                  </p>
                  {analysis.missingFields.map(renderField)}
                </div>
              )}

              {/* Pre-filled fields (if any, show for review) */}
              {Object.keys(analysis.extractedInfo).length > 0 && (
                <Collapsible open={showOptional} onOpenChange={setShowOptional}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="text-sm">Review auto-filled details</span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        showOptional && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    {analysis.allFields
                      .filter(f => analysis.extractedInfo[f.key])
                      .map(renderField)}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Optional fields */}
              {analysis.optionalFields.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="text-sm text-muted-foreground">
                        Optional details ({analysis.optionalFields.length})
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    {analysis.optionalFields.map(renderField)}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* No missing fields message */}
              {analysis.missingFields.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <p className="text-sm">All required information collected!</p>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={!isFormValid()}
                className="w-full h-12 bg-gradient-primary hover:opacity-90"
              >
                Start Calling Providers
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
