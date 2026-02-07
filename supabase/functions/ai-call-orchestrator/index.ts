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
      service, 
      providerName, 
      userName, 
      purpose, 
      details, 
      timePreference,
      conversationHistory 
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Determine what the AI should say next based on conversation history
    const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
    
    let systemPrompt: string;
    let userPrompt: string;

    if (isFirstMessage) {
      systemPrompt = `You are an AI phone assistant making a call to book an appointment.
Generate the opening message for a call to ${providerName}.
Be polite, professional, and clearly state you're an AI calling on behalf of ${userName}.
Keep it concise (2-3 sentences max).`;
      
      userPrompt = `Generate opening for:
Service: ${service}
Purpose: ${purpose === 'new_appointment' ? 'Book new appointment' : purpose === 'reschedule' ? 'Reschedule' : 'General inquiry'}
Details: ${details || 'None'}
Time preference: ${timePreference || 'Flexible'}`;
    } else {
      systemPrompt = `You are an AI phone assistant in a conversation to book an appointment.
Based on the provider's last response, generate an appropriate reply.
If they offered a time slot, confirm it.
If they asked a question, answer it.
If they can't help, thank them politely and end the call.
Keep responses concise (1-2 sentences).`;

      const lastProviderMessage = conversationHistory
        .filter((m: any) => m.speaker === 'provider')
        .pop();

      userPrompt = `Provider's last response: "${lastProviderMessage?.text || 'Hello?'}"
Service requested: ${service}
Time preference: ${timePreference || 'Flexible'}
Additional context: ${details || 'None'}

What should the AI say next?`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "ai_response",
              description: "Generate the AI assistant's spoken response",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "What the AI should say" },
                  intent: { 
                    type: "string", 
                    enum: ["greeting", "request", "confirm", "clarify", "thank", "end"],
                    description: "The intent of this message"
                  },
                },
                required: ["message", "intent"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "ai_response" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const aiResponse = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in AI orchestrator:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
