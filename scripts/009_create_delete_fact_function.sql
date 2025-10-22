-- Create a function to safely delete a fact and all related fact_events
-- This bypasses any triggers that might cause FK constraint violations

CREATE OR REPLACE FUNCTION delete_fact(
  p_user_id UUID,
  p_fact_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fact_id UUID;
BEGIN
  -- Get the fact_id for the given key
  SELECT id INTO v_fact_id
  FROM profile_facts
  WHERE user_id = p_user_id AND key = p_fact_key;

  -- If fact doesn't exist, return false
  IF v_fact_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Disable the log_fact_changes trigger to prevent FK constraint violation
  -- The trigger tries to insert into fact_events on DELETE, which fails because
  -- fact_events has a FK constraint to profile_facts
  ALTER TABLE profile_facts DISABLE TRIGGER log_fact_changes;

  BEGIN
    -- Delete all fact_events for this fact first
    DELETE FROM fact_events
    WHERE fact_id = v_fact_id;

    -- Delete the fact itself
    DELETE FROM profile_facts
    WHERE id = v_fact_id;

    -- Re-enable the trigger
    ALTER TABLE profile_facts ENABLE TRIGGER log_fact_changes;

    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      -- Re-enable the trigger even if an error occurs
      ALTER TABLE profile_facts ENABLE TRIGGER log_fact_changes;
      RAISE;
  END;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_fact(UUID, TEXT) TO authenticated;
