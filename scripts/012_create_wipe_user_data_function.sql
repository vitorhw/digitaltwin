-- Create a function to wipe all user data safely
-- This function handles FK constraints by deleting in the correct order

CREATE OR REPLACE FUNCTION wipe_user_data(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_facts_count INT;
  v_episodic_count INT;
  v_docs_count INT;
  v_events_count INT;
BEGIN
  -- Delete all fact_events first (including orphaned ones)
  -- This prevents FK constraint violations when deleting profile_facts
  DELETE FROM fact_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_events_count = ROW_COUNT;
  
  -- Now delete profile_facts without the trigger causing issues
  -- The trigger will try to insert a delete event, but we'll catch any errors
  BEGIN
    DELETE FROM profile_facts WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_facts_count = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- If FK constraint error, try disabling trigger and retrying
      EXECUTE 'ALTER TABLE profile_facts DISABLE TRIGGER log_fact_changes';
      DELETE FROM profile_facts WHERE user_id = p_user_id;
      GET DIAGNOSTICS v_facts_count = ROW_COUNT;
      EXECUTE 'ALTER TABLE profile_facts ENABLE TRIGGER log_fact_changes';
  END;
  
  -- Delete episodic_memories
  DELETE FROM episodic_memories WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_episodic_count = ROW_COUNT;
  
  -- Delete doc_chunks
  DELETE FROM doc_chunks WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_docs_count = ROW_COUNT;
  
  -- Return summary
  v_result := json_build_object(
    'success', true,
    'deleted', json_build_object(
      'facts', v_facts_count,
      'episodic', v_episodic_count,
      'documents', v_docs_count,
      'events', v_events_count
    )
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Try to re-enable trigger if it was disabled
    BEGIN
      EXECUTE 'ALTER TABLE profile_facts ENABLE TRIGGER log_fact_changes';
    EXCEPTION
      WHEN OTHERS THEN
        NULL; -- Ignore errors when re-enabling
    END;
    
    RAISE EXCEPTION 'Error wiping user data: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION wipe_user_data(UUID) TO authenticated;
