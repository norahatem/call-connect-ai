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
    const { 
      toNumber,        // Business phone number to call
      fromNumber,      // User's verified phone number (caller ID)
      providerName,
      service,
      userName,
      purpose,
      details,
      timePreference,
    } = await req.json();
    
    const TWILIO_SID = Deno.env.get("TWILIO_SID");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    
    if (!TWILIO_SID || !TWILIO_API_KEY) {
      throw new Error("Twilio credentials are not configured");
    }

    console.log(`Initiating call to ${toNumber} from ${fromNumber} for ${service}`);

    const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_API_KEY}`);
    const twilioBaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}`;

    // First verify the fromNumber is a verified caller ID
    const verifyResponse = await fetch(
      `${twilioBaseUrl}/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(fromNumber)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Basic ${twilioAuth}` },
      }
    );
    
    const verifyData = await verifyResponse.json();
    if (!verifyData.outgoing_caller_ids || verifyData.outgoing_caller_ids.length === 0) {
      throw new Error('The caller ID is not verified. Please verify your phone number first.');
    }

    // Create TwiML for the call - this will be the AI conversation handler
    // For now, we'll use a simple TwiML that connects and plays a message
    // In production, this would connect to a WebSocket for real-time AI conversation
    const callbackUrl = `${SUPABASE_URL}/functions/v1/twilio-call-handler`;
    
    // Build TwiML inline for the initial call
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    Hello, this is an AI assistant calling on behalf of ${userName}. 
    I'm calling to inquire about ${service}. ${purpose === 'new_appointment' ? 'We would like to book an appointment.' : ''} 
    ${timePreference ? `Our preferred time is ${timePreference}.` : ''}
    ${details ? details : ''}
  </Say>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">Could you please let me know your available times?</Say>
  <Record maxLength="60" transcribe="true" transcribeCallback="${callbackUrl}"/>
</Response>`;

    // Initiate the call
    const callResponse = await fetch(`${twilioBaseUrl}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${twilioAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Twiml: twiml,
        StatusCallback: callbackUrl,
        StatusCallbackEvent: 'initiated ringing answered completed',
        StatusCallbackMethod: 'POST',
      }),
    });

    const callData = await callResponse.json();
    
    if (!callResponse.ok) {
      console.error('Twilio call error:', callData);
      throw new Error(callData.message || 'Failed to initiate call');
    }

    console.log('Call initiated:', callData.sid);

    return new Response(JSON.stringify({
      success: true,
      callSid: callData.sid,
      status: callData.status,
      message: `Call initiated to ${providerName}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in twilio-make-call:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
