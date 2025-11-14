import { createClient } from "@supabase/supabase-js"

export function createAdminClient() {
  const url = process.env.SUPABASE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SUPABASE_SERVICE_ROLE_KEY) must be set for admin operations.",
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
