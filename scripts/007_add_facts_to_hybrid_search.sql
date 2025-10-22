-- Update hybrid_search_memories to include profile_facts in search results

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
  combined_score FLOAT
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
      ts_rank(to_tsvector('english', em.text), plainto_tsquery('english', p_query_text))::double precision AS text_rank,
      EXTRACT(EPOCH FROM (NOW() - em.occurred_at)) / 86400.0 AS days_ago
    FROM public.episodic_memories em
    WHERE em.user_id = p_user_id
  ),
  -- Added fact_results to search profile_facts table
  fact_results AS (
    SELECT
      pf.id,
      (pf.key || ': ' || pf.value) AS text,
      pf.confidence,
      pf.updated_at AS occurred_at,
      'fact' AS source,
      1 - (pf.embedding <=> p_query_embedding) AS similarity_score,
      ts_rank(to_tsvector('english', pf.key || ' ' || pf.value), plainto_tsquery('english', p_query_text))::double precision AS text_rank,
      EXTRACT(EPOCH FROM (NOW() - pf.updated_at)) / 86400.0 AS days_ago
    FROM public.profile_facts pf
    WHERE pf.user_id = p_user_id
      AND pf.status = 'confirmed'
      AND pf.embedding IS NOT NULL
  ),
  doc_results AS (
    SELECT
      dc.id,
      dc.text,
      NULL::FLOAT AS confidence,
      dc.created_at AS occurred_at,
      'document' AS source,
      1 - (dc.embedding <=> p_query_embedding) AS similarity_score,
      ts_rank(to_tsvector('english', dc.text), plainto_tsquery('english', p_query_text))::double precision AS text_rank,
      EXTRACT(EPOCH FROM (NOW() - dc.created_at)) / 86400.0 AS days_ago
    FROM public.doc_chunks dc
    WHERE dc.user_id = p_user_id
  ),
  combined AS (
    SELECT * FROM episodic_results
    UNION ALL
    SELECT * FROM fact_results
    UNION ALL
    SELECT * FROM doc_results
  )
  SELECT
    c.id,
    c.text,
    c.confidence,
    c.occurred_at,
    c.source,
    c.similarity_score,
    c.text_rank,
    (c.similarity_score * 0.5 + c.text_rank * 0.4 + (1.0 / (1.0 + c.days_ago * p_recency_weight)) * 0.1) AS combined_score
  FROM combined c
  ORDER BY combined_score DESC
  LIMIT p_limit;
END;
$$;
