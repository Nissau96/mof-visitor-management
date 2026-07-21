import { createClient } from "@supabase/supabase-js";
import process from "node:process";

let adminClient;

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
    },
  });

  return adminClient;
}