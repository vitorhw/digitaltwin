-- Function to increment rule observation count
CREATE OR REPLACE FUNCTION increment_rule_observation(
  p_rule_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE procedural_rules
  SET 
    times_observed = times_observed + 1,
    last_observed_at = NOW()
  WHERE id = p_rule_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
