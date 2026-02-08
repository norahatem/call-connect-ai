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

    const { receptionistMessage, provider, user, conversationHistory, toolResults } = await req.json();

    const systemPrompt = `You are an AI booking assistant making a PHONE CALL on behalf of your client "${user.name}".

YOUR ROLE:
- You are CALLING "${provider.name}" to book an appointment for your client
- You speak TO the receptionist (the human you're chatting with)
- You are polite, professional, and efficient - like a real secretary making a call

THE CONVERSATION:
- The receptionist works at ${provider.name}
- They will offer available times, ask questions, and confirm bookings
- You need to find a time that works for YOUR CLIENT (${user.name})

TOOL RESULTS:
When you receive tool results, USE THEM to respond appropriately:
- If client is AVAILABLE at a time → Confirm with receptionist: "That time works for my client!"
- If client has a CONFLICT → Ask for alternatives: "Unfortunately my client has a conflict then. Do you have any other times?"
- After getting a confirmation code → Thank them and confirm the booking is complete

RESPOND WITH JSON:
{
  "agentResponse": "What you say to the receptionist (use tool results to inform your response)",
  "toolCalls": [
    { "name": "check_client_availability", "params": { "time": "the time offered" } }
  ] or []
}

AVAILABLE TOOLS:
- check_client_availability: Check if ${user.name} is free. Params: { "time": "tomorrow at 2pm" }
- book_appointment: Finalize booking. Params: { "time": "the confirmed time", "confirmationCode": "ABC123" }

IMPORTANT RULES:
1. When receptionist offers a time → Call check_client_availability with that time
2. When you ALREADY HAVE tool results showing availability → DON'T call the tool again, just respond based on the result
3. When receptionist confirms booking with a code → Call book_appointment
4. Be conversational and natural

Current date: ${new Date().toLocaleDateString()}`;

    // Build messages including tool results if provided
    const messages: Array<{role: string, content: string}> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10),
    ];

    // Add the receptionist's message
    if (receptionistMessage) {
      messages.push({ role: 'user', content: receptionistMessage });
    }

    // If we have tool results, add them as context
    if (toolResults && toolResults.length > 0) {
      const toolResultsText = toolResults.map((t: any) => 
        `TOOL RESULT for ${t.name}: ${JSON.stringify(t.result)}`
      ).join('\n');
      
      messages.push({ 
        role: 'user', 
        content: `[SYSTEM: Tool execution completed]\n${toolResultsText}\n\nNow respond to the receptionist based on these results. DO NOT call the same tool again.` 
      });
    }

    console.log('Sending messages to AI:', JSON.stringify(messages, null, 2));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
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

    console.log('AI response:', content);

    if (!content) {
      throw new Error('No response from AI');
    }

    let parsed;
    try {
      // Clean up potential markdown formatting
      let cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse error:', e, 'Content:', content);
      parsed = { 
        agentResponse: content, 
        toolCalls: [] 
      };
    }

    // If we already have tool results, don't return more tool calls (prevent loop)
    if (toolResults && toolResults.length > 0) {
      parsed.toolCalls = [];
    }

    return new Response(JSON.stringify({
      agentResponse: parsed.agentResponse || "I see, let me confirm with my client's schedule...",
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
