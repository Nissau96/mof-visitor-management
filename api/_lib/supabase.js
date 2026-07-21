import { createClient } from "@supabase/supabase-js";
import process from "node:process";

let adminClient;

/**
 * Retrieves the server-side Supabase admin client.
 * @returns {import('@supabase/supabase-js').SupabaseClient} The configured Supabase client.
 * @throws {Error} If `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing.
 */
export function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY on the server.",
    );
  }

  if (adminClient) {
    return adminClient;
  }

  adminClient = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}