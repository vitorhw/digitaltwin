-- Create procedural_rules table for habits, routines, and if/then rules
CREATE TABLE IF NOT EXISTS procedural_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Rule content
  rule_type TEXT NOT NULL CHECK (rule_type IN ('habit', 'preference', 'routine', 'if_then', 'skill')),
  condition TEXT, -- For if/then rules: "if X happens" or "when X"
  action TEXT NOT NULL, -- What to do: "always book with United", "brush teeth before bed"
  context TEXT, -- Additional context or explanation
  
  -- Metadata
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  frequency TEXT CHECK (frequency IN ('always', 'usually', 'sometimes', 'rarely')),
  importance DOUBLE PRECISION DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  
  -- Learning and validation
  times_observed INTEGER DEFAULT 1, -- How many times this pattern was observed
  times_applied INTEGER DEFAULT 0, -- How many times the rule was successfully applied
  last_observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_applied_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
  provenance_kind TEXT NOT NULL DEFAULT 'ai_learned',
  provenance_source TEXT DEFAULT 'chat',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Embedding for semantic search
  embedding vector(1536),
  
  -- Constraints
  UNIQUE(user_id, rule_type, action)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_procedural_rules_user_id ON procedural_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_procedural_rules_rule_type ON procedural_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_procedural_rules_status ON procedural_rules(status);
CREATE INDEX IF NOT EXISTS idx_procedural_rules_embedding ON procedural_rules USING ivfflat (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE procedural_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own procedural rules"
  ON procedural_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own procedural rules"
  ON procedural_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own procedural rules"
  ON procedural_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own procedural rules"
  ON procedural_rules FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_procedural_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_procedural_rules_updated_at
  BEFORE UPDATE ON procedural_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_procedural_rules_updated_at();
