-- Add AI scoring recommendation fields to risks table
ALTER TABLE public.risks 
ADD COLUMN IF NOT EXISTS ai_recommended_likelihood INTEGER,
ADD COLUMN IF NOT EXISTS ai_recommended_impact INTEGER,
ADD COLUMN IF NOT EXISTS ai_score_reasoning TEXT,
ADD COLUMN IF NOT EXISTS ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
ADD COLUMN IF NOT EXISTS ai_score_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ai_score_status TEXT DEFAULT 'none' CHECK (ai_score_status IN ('none', 'pending', 'applied', 'dismissed'));