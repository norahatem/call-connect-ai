import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VerificationState {
  isLoading: boolean;
  error: string | null;
  validationCode: string | null;
  isVerified: boolean;
  isPending: boolean;
}

export function usePhoneVerification() {
  const [state, setState] = useState<VerificationState>({
    isLoading: false,
    error: null,
    validationCode: null,
    isVerified: false,
    isPending: false,
  });

  const startVerification = useCallback(async (phoneNumber: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { data, error } = await supabase.functions.invoke('twilio-verify-phone', {
        body: { action: 'start_verification', phoneNumber },
      });

      if (error) throw error;
      
      if (data.alreadyVerified) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          isVerified: true,
          isPending: false,
        }));
        return { success: true, alreadyVerified: true };
      }

      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        validationCode: data.validationCode,
        isPending: true,
      }));
      
      return { 
        success: true, 
        validationCode: data.validationCode,
        message: data.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return { success: false, error: message };
    }
  }, []);

  const checkVerification = useCallback(async (phoneNumber: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { data, error } = await supabase.functions.invoke('twilio-verify-phone', {
        body: { action: 'check_verification', phoneNumber },
      });

      if (error) throw error;

      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        isVerified: data.verified,
        isPending: !data.verified,
      }));
      
      return { success: true, verified: data.verified };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check failed';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return { success: false, error: message };
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      validationCode: null,
      isVerified: false,
      isPending: false,
    });
  }, []);

  return {
    ...state,
    startVerification,
    checkVerification,
    reset,
  };
}
