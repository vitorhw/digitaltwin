-- Reset voice profile to clear old XTTS data
-- Run this in Supabase SQL Editor if you have old voice data

-- Option 1: Delete your voice profile (you'll need to re-enroll)
-- DELETE FROM voice_profile WHERE user_id = auth.uid();

-- Option 2: Just clear the clone_reference (keeps the audio sample)
UPDATE voice_profile 
SET clone_reference = NULL 
WHERE user_id = auth.uid();

-- After running this, go to the app and upload a new voice sample
