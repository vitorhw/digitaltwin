-- Add embedding column to profile_facts table
ALTER TABLE public.profile_facts 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create vector index for similarity search on profile_facts
CREATE INDEX IF NOT EXISTS idx_profile_facts_embedding 
ON public.profile_facts 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
