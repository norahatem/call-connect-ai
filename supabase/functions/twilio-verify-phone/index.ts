import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, phoneNumber, code } = await req.json();
    
    const TWILIO_SID = Deno.env.get("TWILIO_SID");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    
    if (!TWILIO_SID || !TWILIO_API_KEY) {
      throw new Error("Twilio credentials are not configured");
    }

    const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_API_KEY}`);
    const twilioBaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}`;

    if (action === 'start_verification') {
      // Start outgoing caller ID verification - Twilio will call the number with a code
      console.log(`Starting verification for phone: ${phoneNumber}`);
      
      const response = await fetch(`${twilioBaseUrl}/OutgoingCallerIds.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${twilioAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          PhoneNumber: phoneNumber,
          FriendlyName: `User Verified: ${phoneNumber}`,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Twilio verification start error:', data);
        
        // Check if number is already verified
        if (data.code === 21450) {
          return new Response(JSON.stringify({ 
            success: true, 
            alreadyVerified: true,
            message: 'This number is already verified as a caller ID'
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        throw new Error(data.message || 'Failed to start verification');
      }

      console.log('Verification started:', data);

      return new Response(JSON.stringify({
        success: true,
        validationCode: data.validation_code,
        callSid: data.call_sid,
        message: 'Twilio is calling your phone. Enter the code shown when prompted.',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'check_verification') {
      // Check if the phone number is now verified
      console.log(`Checking verification status for: ${phoneNumber}`);
      
      const response = await fetch(`${twilioBaseUrl}/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${twilioAuth}`,
        },
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Twilio check error:', data);
        throw new Error('Failed to check verification status');
      }

      const isVerified = data.outgoing_caller_ids && data.outgoing_caller_ids.length > 0;
      
      return new Response(JSON.stringify({
        success: true,
        verified: isVerified,
        callerIdSid: isVerified ? data.outgoing_caller_ids[0].sid : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'list_verified') {
      // List all verified caller IDs
      const response = await fetch(`${twilioBaseUrl}/OutgoingCallerIds.json`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${twilioAuth}`,
        },
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error('Failed to list verified numbers');
      }

      return new Response(JSON.stringify({
        success: true,
        callerIds: data.outgoing_caller_ids || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error("Error in twilio-verify-phone:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
