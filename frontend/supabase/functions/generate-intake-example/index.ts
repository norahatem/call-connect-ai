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

    const { service } = await req.json();

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You generate short, helpful placeholder examples for appointment booking forms.
Given a service type, generate 1-2 brief example phrases a user might type when booking.
Keep it under 80 characters total. Use casual, natural language.
Format: 'e.g., "example 1" or "example 2"'
Do NOT include personal info like names or dates - just the service need.`
          },
          {
            role: 'user',
            content: `Service: "${service}"`
          }
        ],
        max_tokens: 60,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const example = data.choices?.[0]?.message?.content?.trim() || '';

    return new Response(JSON.stringify({ example }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Generate example error:', error);
    return new Response(
      JSON.stringify({ example: '' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
