import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error(
    "Connection check failed: SUPABASE_URL or SUPABASE_SECRET_KEY is missing.",
  );

  process.exitCode = 1;
} else {
  const supabase = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { count, error } = await supabase
    .from("hosts")
    .select("id", {
      count: "exact",
      head: true,
    });

  if (error) {
    console.error(`Connection check failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Supabase connection successful. Host records: ${count ?? 0}.`,
    );
  }
}