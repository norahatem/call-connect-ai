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
    const { service, providerName, userName, purpose, details, timePreference } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an AI phone assistant making calls on behalf of users to book appointments. 
Generate a natural, professional phone script for the AI to use when calling a service provider.
The script should:
- Introduce the AI as calling on behalf of the user
- Clearly state the purpose of the call
- Be polite and professional
- Handle common scenarios (availability check, booking confirmation, providing details)
- Be concise but thorough

Return a JSON object with:
- "greeting": The opening line
- "purpose": How to explain why we're calling
- "details": How to communicate any special requirements
- "timeRequest": How to ask about availability
- "confirmation": How to confirm a booking
- "closing": How to end the call professionally`;

    const userPrompt = `Generate a call script for:
- Service: ${service}
- Provider: ${providerName}
- Calling for: ${userName}
- Purpose: ${purpose === 'new_appointment' ? 'Book a new appointment' : purpose === 'reschedule' ? 'Reschedule an existing appointment' : 'General inquiry'}
- Additional details: ${details || 'None provided'}
- Time preference: ${timePreference || 'Flexible'}`;

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
              name: "generate_script",
              description: "Generate a structured call script",
              parameters: {
                type: "object",
                properties: {
                  greeting: { type: "string", description: "Opening line for the call" },
                  purpose: { type: "string", description: "How to explain the call purpose" },
                  details: { type: "string", description: "How to communicate special requirements" },
                  timeRequest: { type: "string", description: "How to ask about availability" },
                  confirmation: { type: "string", description: "How to confirm a booking" },
                  closing: { type: "string", description: "Professional closing statement" },
                },
                required: ["greeting", "purpose", "details", "timeRequest", "confirmation", "closing"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_script" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const script = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ script }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating call script:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
