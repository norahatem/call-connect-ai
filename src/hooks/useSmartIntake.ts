import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IntakeAnalysisResult, IntakeFormData } from '@/types/intake';

interface UseSmartIntakeOptions {
  onAnalysisComplete?: (result: IntakeAnalysisResult) => void;
}

export function useSmartIntake(options: UseSmartIntakeOptions = {}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<IntakeAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeIntake = useCallback(async (service: string, userInput: string) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-intake', {
        body: { service, userInput }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      const result: IntakeAnalysisResult = {
        category: data.category,
        extractedInfo: data.extractedInfo || {},
        missingFields: data.missingFields || [],
        optionalFields: data.optionalFields || [],
        allFields: data.allFields || [],
      };

      setAnalysis(result);
      options.onAnalysisComplete?.(result);
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze intake';
      setError(message);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [options]);

  const buildCompleteData = useCallback((formData: IntakeFormData): IntakeFormData => {
    if (!analysis) return formData;
    
    // Merge extracted info with form data (form data takes precedence)
    return {
      ...analysis.extractedInfo,
      ...formData,
    };
  }, [analysis]);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    isAnalyzing,
    analysis,
    error,
    analyzeIntake,
    buildCompleteData,
    reset,
  };
}
