import {
  CalendarDays,
  Download,
  LoaderCircle,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import useAuth from "../hooks/useAuth.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";

const dateFormatter =
  new Intl.DateTimeFormat("en-GH", {
    dateStyle: "long",
    timeZone: "Africa/Accra",
  });

function formatDate(value) {
  const date = new Date(
    `${value}T12:00:00.000Z`,
  );

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return dateFormatter.format(date);
}

function normalizeWeeklyQr(result) {
  const weeklyQr = result?.weeklyQr;

  if (
    !weeklyQr ||
    typeof weeklyQr !== "object" ||
    typeof weeklyQr.accessUrl !==
      "string" ||
    typeof weeklyQr.weekStartsOn !==
      "string" ||
    typeof weeklyQr.weekEndsOn !==
      "string" ||
    typeof weeklyQr.validFrom !==
      "string" ||
    typeof weeklyQr.validThrough !==
      "string" ||
    typeof weeklyQr.expiresAt !==
      "string"
  ) {
    throw new Error(
      "The weekly QR response is invalid.",
    );
  }

  let accessUrl;

  try {
    accessUrl = new URL(
      weeklyQr.accessUrl,
    );
  } catch {
    throw new Error(
      "The weekly QR response is invalid.",
    );
  }

  const fragment =
    new URLSearchParams(
      accessUrl.hash.slice(1),
    );

  if (
    accessUrl.search ||
    !fragment.get("weeklyAccess")
  ) {
    throw new Error(
      "The weekly QR response is invalid.",
    );
  }

  return {
    accessUrl: weeklyQr.accessUrl,
    displayUrl:
      `${accessUrl.origin}${accessUrl.pathname}`,
    expiresAt: weeklyQr.expiresAt,
    validFrom: weeklyQr.validFrom,
    validThrough:
      weeklyQr.validThrough,
    weekEndsOn:
      weeklyQr.weekEndsOn,
    weekStartsOn:
      weeklyQr.weekStartsOn,
  };
}

async function createQrDataUrl(accessUrl) {
  const qrModule =
    await import("qrcode");

  const qrCode =
    qrModule.default || qrModule;

  if (
    typeof qrCode.toDataURL !==
    "function"
  ) {
    throw new Error(
      "The QR renderer is unavailable.",
    );
  }

  return await qrCode.toDataURL(
    accessUrl,
    {
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
      margin: 4,
      type: "image/png",
      width: 768,
    },
  );
}

export default function StaffWeeklyQrPage() {
  const {
    session,
    signOut,
  } = useAuth();

  const [weeklyQr, setWeeklyQr] =
    useState(null);

  const [qrDataUrl, setQrDataUrl] =
    useState("");

  const [status, setStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  const accessToken =
    session?.access_token || "";

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadWeeklyQr() {
      try {
        const result = await apiRequest(
          "/api/staff/session",
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
            method: "POST",
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        const normalized =
          normalizeWeeklyQr(result);

        const dataUrl =
          await createQrDataUrl(
            normalized.accessUrl,
          );

        if (controller.signal.aborted) {
          return;
        }

        setWeeklyQr(normalized);
        setQrDataUrl(dataUrl);
        setRequestError("");
        setStatus("ready");
      } catch (error) {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          (error.status === 401 ||
            error.status === 403)
        ) {
          void signOut()
            .catch(() => undefined);

          return;
        }

        setWeeklyQr(null);
        setQrDataUrl("");

        setRequestError(
          error instanceof Error &&
            error.message
            ? error.message
            : "The weekly visitor QR code could not be loaded.",
        );

        setStatus("error");
      }
    }

    void loadWeeklyQr();

    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    refreshKey,
    signOut,
  ]);

  function refreshQr() {
    setRequestError("");
    setWeeklyQr(null);
    setQrDataUrl("");
    setStatus("loading");

    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  function printQr() {
    window.print();
  }

  const downloadName = weeklyQr
    ? `mof-visitor-qr-${weeklyQr.weekStartsOn}-to-${weeklyQr.weekEndsOn}.png`
    : "mof-visitor-qr.png";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 print:max-w-none print:p-0 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Reception access
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Weekly visitor QR code
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            Display this code on the reception screen or
            print it for the current Monday-to-Sunday
            access period.
          </p>
        </div>

        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={status === "loading"} onClick={refreshQr} type="button">
          <RefreshCw aria-hidden="true" className={`size-5 ${status === "loading" ? "animate-spin" : ""}`} />
          Refresh QR
        </button>
      </header>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 print:hidden">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />

        <p>
          This is a static weekly bearer QR code. Anyone
          with a copy can use it until Sunday night. Keep
          printed copies within reception and replace them
          every Monday.
        </p>
      </div>

      {status === "loading" ? (
        <div className="mt-6 print:hidden">
          <LoadingState message="Generating the weekly visitor QR code…" />
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 print:hidden">
          <ErrorMessage message={requestError} onRetry={refreshQr} title="Weekly QR unavailable" />
        </div>
      ) : null}

      {status === "ready" &&
      weeklyQr &&
      qrDataUrl ? (
        <>
          <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:m-0 print:rounded-none print:border-0 print:shadow-none">
            <div className="bg-brand-900 px-5 py-6 text-center text-white print:bg-white print:px-0 print:pb-4 print:pt-0 print:text-slate-950 sm:px-8">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-brand-100 print:text-slate-700">
                Ministry of Finance
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Visitor registration
              </h2>

              <p className="mt-3 text-brand-50 print:text-slate-700">
                Scan to access the visitor management
                application.
              </p>
            </div>

            <div className="grid items-center gap-8 p-5 print:block print:p-0 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
              <div className="flex justify-center">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
                  <img
                    alt={`Visitor registration QR code valid from ${formatDate(
                      weeklyQr.weekStartsOn,
                    )} through ${formatDate(
                      weeklyQr.weekEndsOn,
                    )}`}
                    className="mx-auto aspect-square w-full max-w-xl"
                    height="768"
                    src={qrDataUrl}
                    width="768"
                  />
                </div>
              </div>

              <div className="print:mt-5 print:text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-800">
                  <QrCode aria-hidden="true" className="size-7" />
                </span>

                <h3 className="mt-5 text-2xl font-black text-slate-950">
                  Scan with your phone camera
                </h3>

                <p className="mt-3 leading-7 text-slate-600">
                  Open the link shown by your camera and
                  select whether you are a new or returning
                  visitor.
                </p>

                <dl className="mt-6 grid gap-4 text-left print:mx-auto print:max-w-lg">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <dt className="flex items-center gap-2 text-sm font-bold text-slate-600">
                      <CalendarDays aria-hidden="true" className="size-4" />
                      Valid from
                    </dt>

                    <dd className="mt-2 font-black text-slate-950">
                      Monday,{" "}
                      {formatDate(
                        weeklyQr.weekStartsOn,
                      )}
                    </dd>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <dt className="flex items-center gap-2 text-sm font-bold text-slate-600">
                      <CalendarDays aria-hidden="true" className="size-4" />
                      Valid through
                    </dt>

                    <dd className="mt-2 font-black text-slate-950">
                      Sunday,{" "}
                      {formatDate(
                        weeklyQr.weekEndsOn,
                      )}
                    </dd>
                  </div>
                </dl>

                <p className="mt-6 break-all rounded-2xl border border-slate-200 bg-white p-4 font-mono text-sm font-bold text-slate-700">
                  {weeklyQr.displayUrl}
                </p>

                <p className="mt-4 text-sm leading-6 text-slate-500">
                  This printed code expires after Sunday
                  and must be replaced with the next
                  Monday’s code.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 flex flex-col gap-3 print:hidden sm:flex-row">
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900" onClick={printQr} type="button">
              <Printer aria-hidden="true" className="size-5" />
              Print reception QR
            </button>

            <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50" download={downloadName} href={qrDataUrl}>
              <Download aria-hidden="true" className="size-5" />
              Download PNG
            </a>
          </div>
        </>
      ) : null}

      {status === "loading" ? (
        <span className="sr-only" role="status">
          <LoaderCircle aria-hidden="true" />
          Loading weekly QR code
        </span>
      ) : null}
    </div>
  );
}