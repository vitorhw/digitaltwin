-- Clean up orphaned fact_events records
DELETE FROM public.fact_events
WHERE fact_id NOT IN (SELECT id FROM public.profile_facts);

-- Ensure proper CASCADE delete on foreign key
ALTER TABLE public.fact_events
DROP CONSTRAINT IF EXISTS fact_events_fact_id_fkey;

ALTER TABLE public.fact_events
ADD CONSTRAINT fact_events_fact_id_fkey
FOREIGN KEY (fact_id)
REFERENCES public.profile_facts(id)
ON DELETE CASCADE;
