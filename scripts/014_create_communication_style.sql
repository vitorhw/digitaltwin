-- Create communication_style table to store the person's tone, vocabulary, and writing patterns
CREATE TABLE IF NOT EXISTS public.communication_style (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Tone and personality
  tone_descriptors TEXT[], -- e.g., ['casual', 'humorous', 'direct', 'empathetic']
  formality_level TEXT CHECK (formality_level IN ('very_casual', 'casual', 'neutral', 'formal', 'very_formal')) DEFAULT 'neutral',
  humor_style TEXT, -- e.g., 'sarcastic', 'witty', 'puns', 'dry', 'none'
  
  -- Language patterns
  common_phrases TEXT[], -- Frequently used phrases or expressions
  vocabulary_level TEXT CHECK (vocabulary_level IN ('simple', 'moderate', 'advanced', 'technical')) DEFAULT 'moderate',
  sentence_structure TEXT CHECK (sentence_structure IN ('short', 'mixed', 'long', 'complex')) DEFAULT 'mixed',
  
  -- Communication preferences
  emoji_usage TEXT CHECK (emoji_usage IN ('never', 'rare', 'occasional', 'frequent')) DEFAULT 'occasional',
  punctuation_style TEXT, -- e.g., 'minimal', 'standard', 'expressive'
  paragraph_length TEXT CHECK (paragraph_length IN ('brief', 'moderate', 'detailed')) DEFAULT 'moderate',
  
  -- Example texts for reference
  example_messages TEXT[], -- Sample messages that exemplify the person's style
  
  -- Metadata
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1) DEFAULT 0.5,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.communication_style ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own communication style" ON public.communication_style FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own communication style" ON public.communication_style FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own communication style" ON public.communication_style FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own communication style" ON public.communication_style FOR DELETE USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_communication_style_user_id ON public.communication_style(user_id);
