-- Add booking mode and preferences to searches table
ALTER TABLE public.searches 
ADD COLUMN IF NOT EXISTS booking_mode text DEFAULT 'single' CHECK (booking_mode IN ('single', 'multi')),
ADD COLUMN IF NOT EXISTS stage text DEFAULT 'discovery' CHECK (stage IN ('discovery', 'ranking', 'confirmation', 'booking', 'completed')),
ADD COLUMN IF NOT EXISTS additional_requirements text,
ADD COLUMN IF NOT EXISTS voice_preference jsonb DEFAULT '{"gender": "neutral", "accent": "neutral"}'::jsonb,
ADD COLUMN IF NOT EXISTS scoring_weights jsonb DEFAULT '[]'::jsonb;

-- Add ranking score to calls table for the hybrid ranking system
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS ai_score numeric,
ADD COLUMN IF NOT EXISTS user_selected boolean DEFAULT false;

-- Add ranked_results to store the AI's ranking after stage 1
ALTER TABLE public.searches
ADD COLUMN IF NOT EXISTS ranked_results jsonb DEFAULT '[]'::jsonb;