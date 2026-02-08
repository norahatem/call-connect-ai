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
    const { service, providerName, aiMessage, conversationHistory, timePreference } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are simulating a service provider receptionist at "${providerName}" responding to an AI assistant booking call.

Your role:
- Respond naturally as a human receptionist would
- Consider the service type: ${service}
- Time preference requested: ${timePreference || 'flexible'}

Behavior guidelines:
- 70% chance: Be helpful and offer available slots
- 20% chance: Be busy/fully booked this week
- 10% chance: Be closed or unavailable

If offering availability, suggest realistic time slots within the next few days.
Keep responses concise (1-3 sentences) like real phone conversations.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversationHistory || []),
      { role: "user", content: `AI Assistant says: "${aiMessage}"` },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "provider_response",
              description: "Generate the provider's response",
              parameters: {
                type: "object",
                properties: {
                  response: { type: "string", description: "The provider's spoken response" },
                  status: { 
                    type: "string", 
                    enum: ["continue", "success", "unavailable", "closed"],
                    description: "Call status after this response"
                  },
                  availableSlot: { 
                    type: "string", 
                    description: "If booking successful, the offered time slot (ISO 8601 format or natural language)"
                  },
                  confirmationCode: {
                    type: "string",
                    description: "If booking confirmed, a confirmation code"
                  },
                },
                required: ["response", "status"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provider_response" } },
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

    const providerResponse = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(providerResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error simulating response:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
