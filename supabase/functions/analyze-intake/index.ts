import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define required fields per service category
// Note: 'date' type uses dd/mm/yyyy text format, not a date picker
const SERVICE_REQUIREMENTS: Record<string, { fields: Array<{ key: string; label: string; type: 'text' | 'date' | 'select' | 'textarea'; options?: string[]; required: boolean }> }> = {
  medical: {
    fields: [
      { key: 'patient_name', label: 'Full Name', type: 'text', required: true },
      { key: 'date_of_birth', label: 'Date of Birth (dd/mm/yyyy)', type: 'text', required: true },
      { key: 'reason_for_visit', label: 'Reason for Visit', type: 'textarea', required: true },
      { key: 'insurance_provider', label: 'Insurance Provider', type: 'text', required: false },
    ]
  },
  dental: {
    fields: [
      { key: 'patient_name', label: 'Full Name', type: 'text', required: true },
      { key: 'date_of_birth', label: 'Date of Birth (dd/mm/yyyy)', type: 'text', required: true },
      { key: 'reason_for_visit', label: 'Reason for Visit', type: 'textarea', required: true },
      { key: 'insurance_provider', label: 'Dental Insurance', type: 'text', required: false },
    ]
  },
  automotive: {
    fields: [
      { key: 'contact_name', label: 'Your Name', type: 'text', required: true },
      { key: 'vehicle_make', label: 'Vehicle Make', type: 'text', required: true },
      { key: 'vehicle_model', label: 'Vehicle Model', type: 'text', required: true },
      { key: 'vehicle_year', label: 'Vehicle Year', type: 'text', required: true },
      { key: 'issue_description', label: 'Describe the issue', type: 'textarea', required: true },
    ]
  },
  salon: {
    fields: [
      { key: 'client_name', label: 'Your Name', type: 'text', required: true },
      { key: 'service_type', label: 'Service Type', type: 'select', options: ['Haircut', 'Color', 'Styling', 'Manicure', 'Pedicure', 'Facial', 'Other'], required: true },
      { key: 'stylist_preference', label: 'Preferred Stylist (if any)', type: 'text', required: false },
      { key: 'special_requests', label: 'Special Requests', type: 'textarea', required: false },
    ]
  },
  restaurant: {
    fields: [
      { key: 'party_name', label: 'Name for Reservation', type: 'text', required: true },
      { key: 'party_size', label: 'Party Size', type: 'select', options: ['1', '2', '3', '4', '5', '6', '7', '8+'], required: true },
      { key: 'special_occasion', label: 'Special Occasion?', type: 'select', options: ['None', 'Birthday', 'Anniversary', 'Business', 'Other'], required: false },
      { key: 'dietary_restrictions', label: 'Dietary Restrictions', type: 'textarea', required: false },
    ]
  },
  general: {
    fields: [
      { key: 'contact_name', label: 'Your Name', type: 'text', required: true },
      { key: 'service_details', label: 'What do you need?', type: 'textarea', required: true },
    ]
  }
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

    const { service, userInput } = await req.json();

    // First, ask the LLM to categorize the service and extract any provided info
    const systemPrompt = `You are an intake assistant that categorizes services and extracts information from user input.

Given a service type and user's description, you must:
1. Categorize the service into one of: medical, dental, automotive, salon, restaurant, general
2. Extract any information the user has already provided
3. IMPORTANT: Always extract the reason/purpose from the user's description into "reason_for_visit" or "issue_description" or "service_details" depending on category

Respond with JSON:
{
  "category": "medical|dental|automotive|salon|restaurant|general",
  "extracted_info": {
    "field_key": "value they provided"
  },
  "confidence": 0.0-1.0
}

Examples of categorization:
- "doctor", "clinic", "physician", "checkup", "medical" → medical
- "dentist", "teeth", "dental" → dental
- "mechanic", "car repair", "auto shop", "garage", "oil change" → automotive
- "haircut", "salon", "spa", "nails", "barber" → salon
- "restaurant", "dinner", "reservation", "table" → restaurant
- anything else → general

Extract field values if the user mentions them. For example:
- "I need a haircut, my name is John" → extracted_info: { "client_name": "John", "service_type": "Haircut" }
- "Car won't start, it's a 2019 Honda Civic" → extracted_info: { "vehicle_make": "Honda", "vehicle_model": "Civic", "vehicle_year": "2019", "issue_description": "Car won't start" }
- "teeth cleaning" → extracted_info: { "reason_for_visit": "Teeth cleaning" }
- "I have a toothache" → extracted_info: { "reason_for_visit": "Toothache" }

IMPORTANT: The user's initial description almost always contains the reason for visit - extract it!`;

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
          { role: 'user', content: `Service: "${service}"\nUser input: "${userInput || 'No additional details provided'}"` }
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
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { category: 'general', extracted_info: {}, confidence: 0.5 };
    }

    const category = parsed.category || 'general';
    const extractedInfo = parsed.extracted_info || {};
    
    // Get the required fields for this category
    const requirements = SERVICE_REQUIREMENTS[category] || SERVICE_REQUIREMENTS.general;
    
    // Filter to only missing required fields
    const missingFields = requirements.fields.filter(field => {
      const hasValue = extractedInfo[field.key] && extractedInfo[field.key].trim() !== '';
      return field.required && !hasValue;
    });

    // Also include optional fields that weren't provided
    const optionalFields = requirements.fields.filter(field => {
      const hasValue = extractedInfo[field.key] && extractedInfo[field.key].trim() !== '';
      return !field.required && !hasValue;
    });

    return new Response(JSON.stringify({
      category,
      extractedInfo,
      missingFields,
      optionalFields,
      allFields: requirements.fields,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analyze intake error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze intake',
        category: 'general',
        missingFields: SERVICE_REQUIREMENTS.general.fields,
        optionalFields: [],
        extractedInfo: {},
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
