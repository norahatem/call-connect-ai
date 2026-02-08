import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { message, provider, conversationHistory } = await req.json();

    const systemPrompt = `You are a booking assistant for ${provider.name}. Your job is to help users:
1. Check their calendar availability for proposed appointment times
2. Find available time slots
3. Book appointments

You have access to these tools:
- check_availability: Check if user is free at a specific time. Params: { proposed_time: string }
- get_available_slots: Get list of available slots. Params: { date?: string, preference?: string }
- confirm_booking: Book an appointment. Params: { appointment_time: string }
- get_calendar_events: See user's existing calendar events. Params: {}

Analyze the user's message and respond with JSON:
{
  "intent": "check_availability" | "get_available_slots" | "confirm_booking" | "get_calendar_events" | null,
  "params": { ... },
  "response": "A brief message if no tool is needed"
}

Time formats: Accept natural language like "tomorrow at 2pm", "Friday 10am", "next Monday afternoon".
Current date/time: ${new Date().toISOString()}

Examples:
- "Am I free tomorrow at 3pm?" → intent: "check_availability", params: { proposed_time: "tomorrow at 3pm" }
- "Book me for Friday at 10am" → intent: "confirm_booking", params: { appointment_time: "Friday at 10am" }
- "What's available this week?" → intent: "get_available_slots", params: { date: "this week" }
- "Show my calendar" → intent: "get_calendar_events", params: {}
- "Hello!" → intent: null, response: "Hi! I can help you check availability and book appointments..."`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-6), // Last 6 messages for context
          { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited, please try again' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If JSON parsing fails, treat as a simple response
      parsed = { intent: null, params: {}, response: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Text agent chat error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        intent: null,
        params: {},
        response: "I'm having trouble understanding. Try asking about availability or booking directly."
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
