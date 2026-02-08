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

    const { receptionistMessage, provider, user, conversationHistory } = await req.json();

    const systemPrompt = `You are an AI booking assistant making a PHONE CALL on behalf of your client "${user.name}".

YOUR ROLE:
- You are CALLING "${provider.name}" to book an appointment for your client
- You speak TO the receptionist (the human you're chatting with)
- You are polite, professional, and efficient - like a real secretary making a call
- You check your CLIENT's calendar before confirming any times

THE CONVERSATION:
- The receptionist works at ${provider.name}
- They will offer available times, ask questions, and confirm bookings
- You need to negotiate a time that works for YOUR CLIENT (${user.name})

YOUR TOOLS (use these to check your CLIENT's availability):
- check_client_availability: Check if ${user.name} is free at a specific time
- get_client_schedule: See ${user.name}'s existing calendar and free slots
- book_appointment: Finalize the booking on ${user.name}'s calendar

RESPOND WITH JSON:
{
  "agentResponse": "What you say to the receptionist",
  "toolCalls": [
    { "name": "check_client_availability", "params": { "time": "tomorrow at 2pm" } }
  ] or []
}

CONVERSATION FLOW:
1. Receptionist offers times → You check if your client is free
2. If client is free → Confirm the booking
3. If client has conflict → Ask for alternative times
4. When booking is confirmed → Use book_appointment with the time and confirmation code

IMPORTANT:
- Always be conversational and natural
- When the receptionist gives a confirmation code, include it in book_appointment
- Thank them when the booking is complete

Current date: ${new Date().toLocaleDateString()}`;

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
          ...conversationHistory.slice(-10),
          { role: 'user', content: receptionistMessage },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      parsed = { 
        agentResponse: content, 
        toolCalls: [] 
      };
    }

    return new Response(JSON.stringify({
      agentResponse: parsed.agentResponse || "Let me check on that for my client...",
      toolCalls: parsed.toolCalls || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Text agent chat error:', error);
    return new Response(
      JSON.stringify({ 
        agentResponse: "I apologize, I'm having some technical difficulties. Could you repeat that?",
        toolCalls: [],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
