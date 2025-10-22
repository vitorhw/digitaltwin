-- Fix the foreign key constraint on fact_events to use CASCADE delete
-- This ensures that when a fact is deleted, all related fact_events are automatically deleted

-- Drop the existing foreign key constraint
ALTER TABLE fact_events
DROP CONSTRAINT IF EXISTS fact_events_fact_id_fkey;

-- Add the foreign key constraint back with ON DELETE CASCADE
ALTER TABLE fact_events
ADD CONSTRAINT fact_events_fact_id_fkey
FOREIGN KEY (fact_id)
REFERENCES profile_facts(id)
ON DELETE CASCADE;

-- Also clean up any orphaned fact_events that reference non-existent facts
DELETE FROM fact_events
WHERE fact_id NOT IN (SELECT id FROM profile_facts);
