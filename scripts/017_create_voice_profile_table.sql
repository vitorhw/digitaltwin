-- Voice profile metadata for user-specific voice cloning
CREATE TABLE IF NOT EXISTS voice_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  sample_object_path TEXT NOT NULL,
  sample_mime_type TEXT NOT NULL,
  clone_reference JSONB,
  speak_back_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure updated_at gets refreshed on each change
CREATE OR REPLACE FUNCTION set_voice_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_profile_updated_at ON voice_profile;
CREATE TRIGGER trg_voice_profile_updated_at
BEFORE UPDATE ON voice_profile
FOR EACH ROW
EXECUTE PROCEDURE set_voice_profile_updated_at();

-- Row level security so users only see their own profile
ALTER TABLE voice_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_profile_select" ON voice_profile;
CREATE POLICY "voice_profile_select" ON voice_profile
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "voice_profile_upsert" ON voice_profile;
CREATE POLICY "voice_profile_upsert" ON voice_profile
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "voice_profile_update" ON voice_profile;
CREATE POLICY "voice_profile_update" ON voice_profile
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "voice_profile_delete" ON voice_profile;
CREATE POLICY "voice_profile_delete" ON voice_profile
  FOR DELETE USING (auth.uid() = user_id);
