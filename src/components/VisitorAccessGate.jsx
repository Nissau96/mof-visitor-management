import {
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import { Outlet } from "react-router-dom";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";

function readWeeklyAccessFragment() {
  const fragment =
    window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;

  if (!fragment) {
    return "";
  }

  const parameters =
    new URLSearchParams(fragment);

  return (
    parameters.get("weeklyAccess") || ""
  );
}

function removeWeeklyAccessFragment() {
  const cleanUrl =
    `${window.location.pathname}${window.location.search}`;

  window.history.replaceState(
    window.history.state,
    "",
    cleanUrl,
  );
}

function getAccessErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Scan the current visitor QR code at reception to access the application.";
    }

    if (error.status === 429) {
      return "Too many access attempts were made. Please wait before scanning the QR code again.";
    }
  }

  return error instanceof Error &&
    error.message
    ? error.message
    : "Visitor access could not be verified. Check your connection and try again.";
}

export default function VisitorAccessGate() {
  const [status, setStatus] =
    useState("checking");

  const [message, setMessage] =
    useState("");

  const [retryKey, setRetryKey] =
    useState(0);

  useEffect(() => {
    const controller =
      new AbortController();

    async function verifyAccess() {
      setMessage("");
      setStatus("checking");

      const weeklyAccess =
        readWeeklyAccessFragment();

      if (weeklyAccess) {
        // Remove the bearer token before making any network
        // request or allowing further navigation.
        removeWeeklyAccessFragment();
      }

      try {
        if (weeklyAccess) {
          await apiRequest(
            "/api/register",
            {
              body: JSON.stringify({
                token: weeklyAccess,
              }),
              method: "PUT",
              signal: controller.signal,
            },
          );
        } else {
          await apiRequest(
            "/api/register",
            {
              method: "GET",
              signal: controller.signal,
            },
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        setStatus("allowed");
      } catch (error) {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        setMessage(
          getAccessErrorMessage(error),
        );

        setStatus(
          error instanceof ApiError &&
            error.status === 401
            ? "denied"
            : "error",
        );
      }
    }

    void verifyAccess();

    return () => {
      controller.abort();
    };
  }, [retryKey]);

  function retryAccess() {
    setRetryKey(
      (currentKey) => currentKey + 1,
    );
  }

  if (status === "allowed") {
    return <Outlet />;
  }

  if (status === "checking") {
    return (
      <div className="mx-auto flex min-h-[65vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
        <section aria-live="polite" className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8" role="status">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-50 text-brand-800">
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
          </span>

          <h1 className="mt-6 text-2xl font-black text-slate-950">
            Verifying visitor access
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Please wait while the current reception QR
            code is verified.
          </p>
        </section>
      </div>
    );
  }

  const denied = status === "denied";

  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
      <section aria-labelledby="visitor-access-heading" className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className={`mx-auto grid size-16 place-items-center rounded-full ${denied ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
          {denied ? (
            <QrCode aria-hidden="true" className="size-8" />
          ) : (
            <ShieldAlert aria-hidden="true" className="size-8" />
          )}
        </span>

        <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-brand-800">
          Reception access required
        </p>

        <h1 className="mt-2 text-2xl font-black text-slate-950" id="visitor-access-heading">
          {denied
            ? "Scan the reception QR code"
            : "Access could not be verified"}
        </h1>

        <p className="mt-4 leading-7 text-slate-600">
          {message}
        </p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-left">
          <h2 className="font-black text-slate-950">
            How to continue
          </h2>

          <ol className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
            <li>
              1. Locate the visitor QR code displayed at
              reception.
            </li>

            <li>
              2. Scan it using your mobile phone camera.
            </li>

            <li>
              3. Open the visitor-management link shown by
              your phone.
            </li>
          </ol>
        </div>

        <button className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-brand-100" onClick={retryAccess} type="button">
          <RefreshCw aria-hidden="true" className="size-5" />
          Check access again
        </button>

        <p className="mt-5 text-sm leading-6 text-slate-500">
          The reception QR code changes every Monday and
          remains valid through Sunday.
        </p>
      </section>
    </div>
  );
}