-- Quick mock data insertion (500 episodic, 20 facts)
-- Run this script to populate the database with test data

-- Insert 20 mock facts
INSERT INTO public.profile_facts (user_id, key, value, confidence, sensitivity, status, embedding)
SELECT 
  (SELECT id FROM auth.users LIMIT 1),
  'fact_' || i,
  jsonb_build_object('text', 'Mock fact value ' || i),
  0.5 + (random() * 0.5),
  CASE (random() * 3)::int WHEN 0 THEN 'low' WHEN 1 THEN 'medium' ELSE 'high' END,
  CASE WHEN random() > 0.5 THEN 'confirmed' ELSE 'candidate' END,
  (SELECT array_agg(random()) FROM generate_series(1, 1536))::vector
FROM generate_series(1, 20) AS i
ON CONFLICT DO NOTHING;

-- Removed status column as it doesn't exist in episodic_memories table
-- Insert 500 mock episodic memories spread over the past year
INSERT INTO public.episodic_memories (user_id, text, confidence, occurred_at, embedding)
SELECT 
  (SELECT id FROM auth.users LIMIT 1),
  'Mock episodic memory event ' || i || ' describing something that happened',
  0.5 + (random() * 0.5),
  NOW() - (random() * interval '365 days'),
  (SELECT array_agg(random()) FROM generate_series(1, 1536))::vector
FROM generate_series(1, 500) AS i
ON CONFLICT DO NOTHING;
