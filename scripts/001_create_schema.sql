-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create profiles table (user management)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create profile_facts table (durable key/value facts)
CREATE TABLE IF NOT EXISTS public.profile_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT CHECK (status IN ('candidate', 'confirmed')) DEFAULT 'candidate',
  sensitivity TEXT CHECK (sensitivity IN ('low', 'medium', 'high')) DEFAULT 'low',
  ttl_days INTEGER,
  expires_at TIMESTAMPTZ,
  provenance_kind TEXT,
  provenance_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Create fact_events table (audit log for fact changes)
CREATE TABLE IF NOT EXISTS public.fact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact_id UUID REFERENCES public.profile_facts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted', 'confirmed', 'expired')),
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create episodic_memories table (what happened, when, where)
CREATE TABLE IF NOT EXISTS public.episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  location TEXT,
  provenance_kind TEXT,
  provenance_source TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create doc_chunks table (ingested document chunks)
CREATE TABLE IF NOT EXISTS public.doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_title TEXT NOT NULL,
  doc_uri TEXT,
  section_path TEXT,
  page_number INTEGER,
  text TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profile_facts_user_id ON public.profile_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_facts_status ON public.profile_facts(status);
CREATE INDEX IF NOT EXISTS idx_profile_facts_expires_at ON public.profile_facts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fact_events_user_id ON public.fact_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fact_events_fact_id ON public.fact_events(fact_id);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_user_id ON public.episodic_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_occurred_at ON public.episodic_memories(occurred_at);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_user_id ON public.doc_chunks(user_id);

-- Create GIN indexes for full-text search (BM25)
CREATE INDEX IF NOT EXISTS idx_episodic_memories_text_gin ON public.episodic_memories USING gin(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_doc_chunks_text_gin ON public.doc_chunks USING gin(to_tsvector('english', text));

-- Create vector indexes for similarity search
CREATE INDEX IF NOT EXISTS idx_episodic_memories_embedding ON public.episodic_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding ON public.doc_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodic_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete their own profile" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- RLS Policies for profile_facts
CREATE POLICY "Users can view their own facts" ON public.profile_facts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own facts" ON public.profile_facts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own facts" ON public.profile_facts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own facts" ON public.profile_facts FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for fact_events
CREATE POLICY "Users can view their own fact events" ON public.fact_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own fact events" ON public.fact_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for episodic_memories
CREATE POLICY "Users can view their own episodic memories" ON public.episodic_memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own episodic memories" ON public.episodic_memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own episodic memories" ON public.episodic_memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own episodic memories" ON public.episodic_memories FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for doc_chunks
CREATE POLICY "Users can view their own doc chunks" ON public.doc_chunks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own doc chunks" ON public.doc_chunks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own doc chunks" ON public.doc_chunks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own doc chunks" ON public.doc_chunks FOR DELETE USING (auth.uid() = user_id);
