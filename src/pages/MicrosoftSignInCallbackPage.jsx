import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  MICROSOFT_SIGN_IN_CHANNEL,
  readMicrosoftError,
} from "../lib/microsoftSignIn.js";
import { supabase } from "../lib/supabase.js";

// Microsoft sends the sign-in popup back here. supabase-js exchanges the
// returned code for a session as the page loads; this page then tells
// the main window and closes. If the browser keeps the window open, the
// person is told they can close it.
export default function MicrosoftSignInCallbackPage() {
  const [result, setResult] = useState({ message: "", status: "working" });

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const error = readMicrosoftError(window.location.search);

      // getSession waits for supabase-js to finish the code exchange.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const ok = Boolean(session) && !error;
      const message = ok
        ? ""
        : error || "Microsoft sign-in did not complete. Please try again.";

      if (typeof BroadcastChannel === "function") {
        const channel = new BroadcastChannel(MICROSOFT_SIGN_IN_CHANNEL);
        channel.postMessage({ message, ok });
        channel.close();
      }

      if (cancelled) {
        return;
      }

      setResult({ message, status: ok ? "done" : "error" });

      window.setTimeout(() => window.close(), ok ? 300 : 2_500);
    }

    void finish();

    return () => {
      cancelled = true;
    };
  }, []);

  const Icon =
    result.status === "working"
      ? LoaderCircle
      : result.status === "done"
        ? CheckCircle2
        : XCircle;

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4">
      <div
        aria-live="polite"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
        role="status"
      >
        <Icon
          aria-hidden="true"
          className={`mx-auto size-8 ${
            result.status === "working"
              ? "animate-spin text-brand-700"
              : result.status === "done"
                ? "text-brand-700"
                : "text-red-700"
          }`}
        />

        <h1 className="mt-3 text-lg font-black text-slate-950">
          {result.status === "working"
            ? "Completing sign-in…"
            : result.status === "done"
              ? "Signed in"
              : "Sign-in did not complete"}
        </h1>

        <p className="mt-1 text-sm leading-6 text-slate-600">
          {result.status === "working"
            ? "This window closes on its own."
            : result.message ||
              "You can close this window and return to the visitor management system."}
        </p>
      </div>
    </main>
  );
}
