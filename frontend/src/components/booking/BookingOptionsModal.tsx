import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, ArrowRight, ArrowLeft, ChevronDown, Settings2 } from 'lucide-react';
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
import { BookingMode, VoicePreference, ScoringWeight } from '@/types';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ai as aiApi, profiles as profilesApi } from '@/lib/api-client';
import { BookingModeSelector } from '@/components/booking/BookingModeSelector';
import { VoiceSelector } from '@/components/booking/VoiceSelector';
import { WeightedPreferences } from '@/components/booking/WeightedPreferences';
import { AdditionalRequirements } from '@/components/booking/AdditionalRequirements';

export interface BookingOptions {
  intakeData: IntakeFormData;
  category: string;
  bookingMode: BookingMode;
  voicePreference: VoicePreference;
  scoringWeights: ScoringWeight[];
  additionalRequirements: string;
}

interface BookingOptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (options: BookingOptions) => void;
  service: string;
}

type Step = 'initial' | 'analyzing' | 'intake' | 'options';

export function BookingOptionsModal({
  open,
  onOpenChange,
  onComplete,
  service,
}: BookingOptionsModalProps) {
  // Step management
  const [step, setStep] = useState<Step>('initial');
  
  // Initial description
  const [initialDetails, setInitialDetails] = useState('');
  const [placeholderExample, setPlaceholderExample] = useState('');
  
  // Intake form
  const [formData, setFormData] = useState<IntakeFormData>({});
  const [showOptional, setShowOptional] = useState(false);
  const [savedUserData, setSavedUserData] = useState<{ name?: string; dateOfBirth?: string }>({});
  
  // Booking options
  const [bookingMode, setBookingMode] = useState<BookingMode>('single');
  const [voicePreference, setVoicePreference] = useState<VoicePreference>({ gender: 'neutral', accent: 'neutral' });
  const [scoringWeights, setScoringWeights] = useState<ScoringWeight[]>([]);
  const [additionalRequirements, setAdditionalRequirements] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { isAnalyzing, analysis, analyzeIntake, buildCompleteData, reset } = useSmartIntake();

  // Load profile data when modal opens
  useEffect(() => {
    if (!open) return;

    const loadProfileData = async () => {
      try {
        const profile = await profilesApi.get();
        if (profile) {
          setSavedUserData({
            name: (profile.full_name as string) || undefined,
            dateOfBirth: (profile.date_of_birth as string) || undefined,
          });
        }
      } catch {
        // Profile may not exist yet
      }
    };

    loadProfileData();
  }, [open]);

  // Reset and generate placeholder on open
  useEffect(() => {
    if (open) {
      setStep('initial');
      setInitialDetails('');
      setFormData({});
      setShowOptional(false);
      setBookingMode('single');
      setVoicePreference({ gender: 'neutral', accent: 'neutral' });
      setScoringWeights([]);
      setAdditionalRequirements('');
      setShowAdvanced(false);
      setPlaceholderExample('');
      reset();

      // Generate dynamic placeholder
      const generatePlaceholder = async () => {
        try {
          const data = await aiApi.generateIntakeExample({ service });
          if (data?.example) {
            setPlaceholderExample(data.example);
          }
        } catch {
          // Silently fail
        }
      };
      generatePlaceholder();
    }
  }, [open, reset, service]);

  const handleInitialSubmit = async () => {
    setStep('analyzing');
    const result = await analyzeIntake(service, initialDetails);

    if (result) {
      const prefilledData: IntakeFormData = { ...result.extractedInfo };

      // Auto-fill name
      const nameKey = result.allFields.find(f => f.key.includes('name') && f.type === 'text')?.key;
      if (nameKey && savedUserData.name && !prefilledData[nameKey]) {
        prefilledData[nameKey] = savedUserData.name;
      }

      // Auto-fill DOB
      if (savedUserData.dateOfBirth && !prefilledData['date_of_birth']) {
        prefilledData['date_of_birth'] = savedUserData.dateOfBirth;
      }

      setFormData(prefilledData);
      setStep('intake');
    } else {
      setStep('initial');
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleIntakeNext = () => {
    setStep('options');
  };

  const handleBack = () => {
    if (step === 'options') setStep('intake');
    else if (step === 'intake') setStep('initial');
  };

  const handleSubmit = async () => {
    // Save profile data via backend
    try {
      const nameKey = analysis?.allFields.find((f: IntakeField) => f.key.includes('name') && f.type === 'text')?.key;
      const updates: { full_name?: string; date_of_birth?: string } = {};

      if (nameKey && formData[nameKey]) {
        updates.full_name = formData[nameKey];
      }
      if (formData['date_of_birth']) {
        updates.date_of_birth = formData['date_of_birth'];
      }

      if (Object.keys(updates).length > 0) {
        await profilesApi.update(updates);
      }
    } catch {
      // Silently fail - profile update is non-critical
    }

    const completeData = buildCompleteData(formData);
    onComplete({
      intakeData: completeData,
      category: analysis?.category || 'general',
      bookingMode,
      voicePreference,
      scoringWeights,
      additionalRequirements,
    });
  };

  const isIntakeValid = () => {
    if (!analysis) return false;
    return analysis.missingFields.every(field => {
      const value = formData[field.key];
      return value && value.trim() !== '';
    });
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
            className={cn("bg-background border-border/50", isExtracted && "ring-1 ring-primary/30")}
          />
        )}

        {field.type === 'date' && (
          <Input
            type="text"
            placeholder="dd/mm/yyyy"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={cn("bg-background border-border/50", isExtracted && "ring-1 ring-primary/30")}
          />
        )}

        {field.type === 'textarea' && (
          <Textarea
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={cn("min-h-[80px] bg-background border-border/50", isExtracted && "ring-1 ring-primary/30")}
          />
        )}

        {field.type === 'select' && field.options && (
          <Select value={value} onValueChange={(v) => handleFieldChange(field.key, v)}>
            <SelectTrigger className={cn("bg-background border-border/50", isExtracted && "ring-1 ring-primary/30")}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </motion.div>
    );
  };

  const stepTitles = {
    initial: "What do you need?",
    analyzing: "Analyzing...",
    intake: "Booking Details",
    options: "Booking Options",
  };

  const stepDescriptions = {
    initial: "Tell us what you need and we'll figure out the rest.",
    analyzing: "Analyzing your request...",
    intake: "Please fill in the remaining details.",
    options: "Choose how you'd like to book.",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Smart Booking
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {stepDescriptions[step]}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1: Initial description */}
          {step === 'initial' && (
            <motion.div
              key="initial"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4 pt-4"
            >
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  What do you need for your {service.toLowerCase()} appointment?
                </Label>
                <Textarea
                  value={initialDetails}
                  onChange={(e) => setInitialDetails(e.target.value)}
                  placeholder={placeholderExample || 'Describe what you need...'}
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
              <p className="text-muted-foreground text-sm">Analyzing your request...</p>
            </motion.div>
          )}

          {/* Step 3: Intake form */}
          {step === 'intake' && analysis && (
            <motion.div
              key="intake"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
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
                  <p className="text-sm font-medium text-foreground">Required Information</p>
                  {analysis.missingFields.map(renderField)}
                </div>
              )}

              {/* Pre-filled fields */}
              {Object.keys(analysis.extractedInfo).length > 0 && (
                <Collapsible open={showOptional} onOpenChange={setShowOptional}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="text-sm">Review auto-filled details</span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showOptional && "rotate-180")} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    {analysis.allFields.filter(f => analysis.extractedInfo[f.key]).map(renderField)}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* No missing fields */}
              {analysis.missingFields.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <p className="text-sm">All required information collected!</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleIntakeNext}
                  disabled={!isIntakeValid()}
                  className="flex-1 bg-gradient-primary hover:opacity-90"
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Booking options */}
          {step === 'options' && (
            <motion.div
              key="options"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 pt-4"
            >
              {/* Booking mode */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">How would you like to book?</Label>
                <BookingModeSelector value={bookingMode} onChange={setBookingMode} />
              </div>

              {/* Advanced options toggle */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    <span className="text-sm flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Advanced Options
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  {/* Voice selection */}
                  <VoiceSelector value={voicePreference} onChange={setVoicePreference} />

                  {/* Weighted preferences (only for multi-call) */}
                  {bookingMode === 'multi' && (
                    <WeightedPreferences weights={scoringWeights} onChange={setScoringWeights} />
                  )}

                  {/* Additional requirements */}
                  <AdditionalRequirements value={additionalRequirements} onChange={setAdditionalRequirements} />
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1 bg-gradient-primary hover:opacity-90"
                >
                  {bookingMode === 'single' ? 'Start Calling' : 'Scout Providers'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
