import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// This handler receives Twilio webhooks for call status and transcriptions
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    console.log('Twilio webhook received:', params);

    const callSid = params.CallSid;
    const callStatus = params.CallStatus;
    const transcriptionText = params.TranscriptionText;
    const recordingUrl = params.RecordingUrl;

    // Handle call status updates
    if (callStatus) {
      console.log(`Call ${callSid} status: ${callStatus}`);
      
      // Here you would update the call record in your database
      // For now, just log the status
      
      if (callStatus === 'completed') {
        console.log('Call completed');
      } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
        console.log(`Call failed with status: ${callStatus}`);
      }
    }

    // Handle transcription callback
    if (transcriptionText) {
      console.log(`Transcription received for ${callSid}: ${transcriptionText}`);
      
      // Here you would:
      // 1. Process the transcription with AI to generate next response
      // 2. Continue the conversation
      // For now, we just log it
    }

    // Return empty TwiML to acknowledge
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/xml' 
      },
    });
  } catch (error) {
    console.error("Error in twilio-call-handler:", error);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });
  }
});
