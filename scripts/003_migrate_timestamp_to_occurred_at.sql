-- Migration: Rename timestamp column to occurred_at to avoid reserved keyword
-- Run this if you already created tables with the timestamp column

ALTER TABLE episodic_memories 
RENAME COLUMN timestamp TO occurred_at;

-- Update the index name for clarity
DROP INDEX IF EXISTS idx_episodic_timestamp;
CREATE INDEX idx_episodic_occurred_at ON episodic_memories(user_id, occurred_at DESC);
