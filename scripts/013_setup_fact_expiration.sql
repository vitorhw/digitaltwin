-- Trigger to automatically set expires_at based on ttl_days
CREATE OR REPLACE FUNCTION public.set_fact_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If ttl_days is set, calculate expires_at
  IF NEW.ttl_days IS NOT NULL AND NEW.ttl_days > 0 THEN
    NEW.expires_at = NOW() + (NEW.ttl_days || ' days')::INTERVAL;
  ELSE
    NEW.expires_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to set expiration on insert/update
DROP TRIGGER IF EXISTS set_fact_expiration_trigger ON public.profile_facts;
CREATE TRIGGER set_fact_expiration_trigger
  BEFORE INSERT OR UPDATE ON public.profile_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_fact_expiration();

-- Enable pg_cron extension (requires superuser, may need to be done manually in Supabase dashboard)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the sweep_expired_facts function to run daily at 2 AM UTC
-- This requires pg_cron extension to be enabled
-- SELECT cron.schedule(
--   'sweep-expired-facts-daily',
--   '0 2 * * *',
--   'SELECT public.sweep_expired_facts();'
-- );

-- Alternative: Create a function that can be called from the app to sweep expired facts
-- This can be called periodically from the frontend or a serverless function
CREATE OR REPLACE FUNCTION public.sweep_expired_facts_with_logging()
RETURNS TABLE (
  deleted_count INTEGER,
  swept_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Call the sweep function
  SELECT public.sweep_expired_facts() INTO v_deleted_count;
  
  -- Log the sweep operation
  RAISE NOTICE 'Swept % expired facts at %', v_deleted_count, NOW();
  
  -- Return the results
  RETURN QUERY SELECT v_deleted_count, NOW();
END;
$$;

-- Grant execute permission on the sweep function
GRANT EXECUTE ON FUNCTION public.sweep_expired_facts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_facts_with_logging() TO authenticated;
