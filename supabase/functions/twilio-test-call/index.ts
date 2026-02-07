import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Test endpoint to initiate a call for testing the full voice pipeline.
 * This will call the specified number and connect to our Media Streams handler.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      toNumber,        // Phone number to call (for testing, this is YOUR number)
      providerName = "Test Business",
      service = "appointment booking",
      userName = "Test User",
      purpose = "new_appointment",
      details = "",
      timePreference = "tomorrow afternoon",
    } = await req.json();
    
    const TWILIO_SID = Deno.env.get("TWILIO_SID");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    
    if (!TWILIO_SID || !TWILIO_API_KEY) {
      throw new Error("Twilio credentials are not configured");
    }
    
    if (!toNumber) {
      throw new Error("toNumber is required");
    }

    console.log(`Initiating test call to ${toNumber}`);

    const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_API_KEY}`);
    const twilioBaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}`;

    // Build the WebSocket URL for Media Streams
    // Note: Twilio requires wss:// URL
    const wsUrl = SUPABASE_URL?.replace('https://', 'wss://').replace('.co', '.co/functions/v1/twilio-media-stream');
    
    // TwiML that connects to our WebSocket handler
    // We use <Connect><Stream> to enable bidirectional audio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="providerName" value="${encodeURIComponent(providerName)}"/>
      <Parameter name="service" value="${encodeURIComponent(service)}"/>
      <Parameter name="userName" value="${encodeURIComponent(userName)}"/>
      <Parameter name="purpose" value="${encodeURIComponent(purpose)}"/>
      <Parameter name="details" value="${encodeURIComponent(details)}"/>
      <Parameter name="timePreference" value="${encodeURIComponent(timePreference)}"/>
    </Stream>
  </Connect>
</Response>`;

    console.log("TwiML:", twiml);

    // For testing, we need a Twilio phone number to call FROM
    // First, get our Twilio phone numbers
    const numbersResponse = await fetch(
      `${twilioBaseUrl}/IncomingPhoneNumbers.json?PageSize=1`,
      {
        method: 'GET',
        headers: { 'Authorization': `Basic ${twilioAuth}` },
      }
    );
    
    const numbersData = await numbersResponse.json();
    
    if (!numbersData.incoming_phone_numbers || numbersData.incoming_phone_numbers.length === 0) {
      throw new Error('No Twilio phone number found. Please purchase a Twilio number to make outbound calls.');
    }
    
    const fromNumber = numbersData.incoming_phone_numbers[0].phone_number;
    console.log(`Using Twilio number: ${fromNumber}`);

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
      }),
    });

    const callData = await callResponse.json();
    
    if (!callResponse.ok) {
      console.error('Twilio call error:', callData);
      throw new Error(callData.message || 'Failed to initiate call');
    }

    console.log('Test call initiated:', callData.sid);

    return new Response(JSON.stringify({
      success: true,
      callSid: callData.sid,
      status: callData.status,
      from: fromNumber,
      to: toNumber,
      message: `Test call initiated! You should receive a call at ${toNumber}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in twilio-test-call:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
