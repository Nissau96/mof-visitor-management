import { supabase } from "./supabase.js";

// Events only the browser sees, reported to the activity log. Each is
// best effort: a report that fails never blocks or slows the user.

const ENDPOINT = "/api/staff/session";

function post(event, body, accessToken) {
  try {
    return fetch(`${ENDPOINT}?event=${encodeURIComponent(event)}`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      // Lets a sign-out report finish while the page moves on.
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

async function currentAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  } catch {
    return "";
  }
}

/** A wrong email or password at staff sign-in. */
export function reportFailedSignIn({ email, tower }) {
  return post("sign-in-failed", { email, tower });
}

/** A staff member signed out ("manual") or was signed out when idle. */
export async function reportSignOut(reason) {
  const token = await currentAccessToken();

  if (token) {
    await post("signed-out", { reason }, token);
  }
}

/** A report downloaded from Analytics & Reports. */
export async function reportExported({ format, period, report, rows }) {
  const token = await currentAccessToken();

  if (token) {
    await post("report-exported", { format, period, report, rows }, token);
  }
}
