-- Add biological memory components to episodic_memories and profile_facts

-- Add emotional salience and recall tracking to episodic_memories
ALTER TABLE public.episodic_memories
ADD COLUMN IF NOT EXISTS emotional_valence DOUBLE PRECISION DEFAULT 0.0 CHECK (emotional_valence >= -1.0 AND emotional_valence <= 1.0),
ADD COLUMN IF NOT EXISTS importance DOUBLE PRECISION DEFAULT 0.5 CHECK (importance >= 0.0 AND importance <= 1.0),
ADD COLUMN IF NOT EXISTS recall_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS memory_strength DOUBLE PRECISION DEFAULT 1.0 CHECK (memory_strength >= 0.0 AND memory_strength <= 1.0);

-- Add schema support and temporal info to profile_facts
ALTER TABLE public.profile_facts
ADD COLUMN IF NOT EXISTS schema_name TEXT,
ADD COLUMN IF NOT EXISTS fact_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recall_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMP WITH TIME ZONE;

-- Create index for schema-based queries
CREATE INDEX IF NOT EXISTS idx_profile_facts_schema ON public.profile_facts(user_id, schema_name) WHERE schema_name IS NOT NULL;

-- Create index for temporal queries on facts
CREATE INDEX IF NOT EXISTS idx_profile_facts_date ON public.profile_facts(user_id, fact_date) WHERE fact_date IS NOT NULL;

-- Create index for recall tracking on episodic memories
CREATE INDEX IF NOT EXISTS idx_episodic_recall ON public.episodic_memories(user_id, last_recalled_at DESC);

-- Create index for importance-based queries
CREATE INDEX IF NOT EXISTS idx_episodic_importance ON public.episodic_memories(user_id, importance DESC);

-- Function to update memory strength based on recall (simulates memory consolidation)
CREATE OR REPLACE FUNCTION update_memory_strength()
RETURNS TRIGGER AS $$
BEGIN
  -- Increase strength with each recall, but with diminishing returns
  -- Simulates synaptic strengthening through repeated activation
  NEW.memory_strength = LEAST(1.0, OLD.memory_strength + (0.1 * (1.0 - OLD.memory_strength)));
  NEW.last_recalled_at = NOW();
  NEW.recall_count = OLD.recall_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update memory strength when episodic memory is recalled
CREATE TRIGGER trigger_update_episodic_strength
BEFORE UPDATE OF recall_count ON public.episodic_memories
FOR EACH ROW
WHEN (NEW.recall_count > OLD.recall_count)
EXECUTE FUNCTION update_memory_strength();

-- Function to apply forgetting curve (memory decay over time)
CREATE OR REPLACE FUNCTION apply_forgetting_curve()
RETURNS void AS $$
BEGIN
  -- Apply Ebbinghaus forgetting curve: strength decays exponentially over time
  -- Formula: strength = initial_strength * e^(-time/decay_constant)
  -- Using 30 days as decay constant (memories lose ~63% strength after 30 days without recall)
  UPDATE public.episodic_memories
  SET memory_strength = GREATEST(
    0.1, -- Minimum strength (memories don't completely disappear)
    memory_strength * EXP(-EXTRACT(EPOCH FROM (NOW() - COALESCE(last_recalled_at, created_at))) / (30 * 24 * 3600))
  )
  WHERE memory_strength > 0.1
  AND (last_recalled_at IS NULL OR last_recalled_at < NOW() - INTERVAL '1 day');
END;
$$ LANGUAGE plpgsql;

-- Create schemas table for organizing related facts
CREATE TABLE IF NOT EXISTS public.memory_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Enable RLS on memory_schemas
ALTER TABLE public.memory_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own schemas"
ON public.memory_schemas
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for schema lookups
CREATE INDEX IF NOT EXISTS idx_memory_schemas_user ON public.memory_schemas(user_id, name);

COMMENT ON COLUMN public.episodic_memories.emotional_valence IS 'Emotional tone: -1 (negative) to +1 (positive). Emotionally salient memories are stronger.';
COMMENT ON COLUMN public.episodic_memories.importance IS 'Subjective importance: 0 (trivial) to 1 (critical). Important memories resist forgetting.';
COMMENT ON COLUMN public.episodic_memories.recall_count IS 'Number of times this memory has been retrieved. More recalls = stronger consolidation.';
COMMENT ON COLUMN public.episodic_memories.memory_strength IS 'Current strength: 1.0 (fresh) to 0.0 (forgotten). Decays over time, strengthens with recall.';
COMMENT ON COLUMN public.profile_facts.schema_name IS 'Optional schema for organizing related facts (e.g., "work", "family", "hobbies")';
COMMENT ON COLUMN public.profile_facts.fact_date IS 'When this fact became true or was observed (e.g., "started job in 2020")';
