-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_profile_facts_updated_at BEFORE UPDATE ON public.profile_facts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_episodic_memories_updated_at BEFORE UPDATE ON public.episodic_memories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to log fact events
CREATE OR REPLACE FUNCTION public.log_fact_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fact_events (user_id, fact_id, event_type, new_value)
    VALUES (NEW.user_id, NEW.id, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'candidate' AND NEW.status = 'confirmed' THEN
      INSERT INTO public.fact_events (user_id, fact_id, event_type, old_value, new_value)
      VALUES (NEW.user_id, NEW.id, 'confirmed', to_jsonb(OLD), to_jsonb(NEW));
    ELSE
      INSERT INTO public.fact_events (user_id, fact_id, event_type, old_value, new_value)
      VALUES (NEW.user_id, NEW.id, 'updated', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fact_events (user_id, fact_id, event_type, old_value)
    VALUES (OLD.user_id, OLD.id, 'deleted', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to log fact events
DROP TRIGGER IF EXISTS log_fact_changes ON public.profile_facts;
CREATE TRIGGER log_fact_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_fact_event();

-- Function to sweep expired facts
CREATE OR REPLACE FUNCTION public.sweep_expired_facts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.profile_facts
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Updated hybrid search to include new biological memory fields
CREATE OR REPLACE FUNCTION public.hybrid_search_memories(
  p_user_id UUID,
  p_query_text TEXT,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 10,
  p_recency_weight FLOAT DEFAULT 0.1
)
RETURNS TABLE (
  id UUID,
  text TEXT,
  confidence FLOAT,
  occurred_at TIMESTAMPTZ,
  source TEXT,
  similarity_score FLOAT,
  text_rank FLOAT,
  combined_score FLOAT,
  emotional_valence FLOAT,
  importance FLOAT,
  recall_count INTEGER,
  memory_strength FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH episodic_results AS (
    SELECT
      em.id,
      em.text,
      em.confidence,
      em.occurred_at,
      'episodic' AS source,
      1 - (em.embedding <=> p_query_embedding) AS similarity_score,
      ts_rank(to_tsvector('english', em.text), plainto_tsquery('english', p_query_text)) AS text_rank,
      EXTRACT(EPOCH FROM (NOW() - em.occurred_at)) / 86400.0 AS days_ago,
      em.emotional_valence,
      em.importance,
      em.recall_count,
      em.memory_strength
    FROM public.episodic_memories em
    WHERE em.user_id = p_user_id
  ),
  doc_results AS (
    SELECT
      dc.id,
      dc.text,
      NULL::FLOAT AS confidence,
      dc.created_at AS occurred_at,
      'document' AS source,
      1 - (dc.embedding <=> p_query_embedding) AS similarity_score,
      ts_rank(to_tsvector('english', dc.text), plainto_tsquery('english', p_query_text)) AS text_rank,
      EXTRACT(EPOCH FROM (NOW() - dc.created_at)) / 86400.0 AS days_ago,
      NULL::FLOAT AS emotional_valence,
      NULL::FLOAT AS importance,
      NULL::INTEGER AS recall_count,
      NULL::FLOAT AS memory_strength
    FROM public.doc_chunks dc
    WHERE dc.user_id = p_user_id
  ),
  fact_results AS (
    SELECT
      pf.id,
      CONCAT(pf.key, ': ', pf.value::text) AS text,
      pf.confidence,
      pf.created_at AS occurred_at,
      'fact' AS source,
      1 - (pf.embedding <=> p_query_embedding) AS similarity_score,
      ts_rank(to_tsvector('english', CONCAT(pf.key, ' ', pf.value::text)), plainto_tsquery('english', p_query_text)) AS text_rank,
      EXTRACT(EPOCH FROM (NOW() - pf.created_at)) / 86400.0 AS days_ago,
      NULL::FLOAT AS emotional_valence,
      NULL::FLOAT AS importance,
      NULL::INTEGER AS recall_count,
      NULL::FLOAT AS memory_strength
    FROM public.profile_facts pf
    WHERE pf.user_id = p_user_id AND pf.status = 'confirmed'
  ),
  combined AS (
    SELECT * FROM episodic_results
    UNION ALL
    SELECT * FROM doc_results
    UNION ALL
    SELECT * FROM fact_results
  )
  SELECT
    c.id,
    c.text,
    c.confidence,
    c.occurred_at,
    c.source,
    c.similarity_score,
    c.text_rank,
    (c.similarity_score * 0.5 + c.text_rank * 0.4 + (1.0 / (1.0 + c.days_ago * p_recency_weight)) * 0.1) AS combined_score,
    c.emotional_valence,
    c.importance,
    c.recall_count,
    c.memory_strength
  FROM combined c
  ORDER BY combined_score DESC
  LIMIT p_limit;
END;
$$;
