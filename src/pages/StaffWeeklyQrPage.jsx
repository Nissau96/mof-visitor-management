import {
  ArrowUpRight,
  Camera,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  LoaderCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import ministrySeal from "../assets/images/mof-seal.webp";
import peerValues from "../assets/images/peer-values.webp";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import useAuth from "../hooks/useAuth.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { renderPosterPng } from "../lib/weeklyQrPoster.js";

const DAY_MS = 86_400_000;

// Week dates arrive as YYYY-MM-DD in Accra time (UTC+0); noon UTC keeps
// formatting on the right calendar day.
function fromIsoDate(isoDate) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

const shortDayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
});

const longDayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "long",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
});

// "Mon 19 Oct to Sun 25 Oct 2026"
function formatWeekRange(weeklyQr) {
  const end = fromIsoDate(weeklyQr.weekEndsOn);

  return `${shortDayFormatter.format(
    fromIsoDate(weeklyQr.weekStartsOn),
  )} to ${shortDayFormatter.format(end)} ${end.getUTCFullYear()}`;
}

// "Sunday 25 Oct"
function formatLongDay(isoDate) {
  return longDayFormatter.format(fromIsoDate(isoDate));
}

// Whole days remaining after today in the access week.
function getDaysLeft(weeklyQr) {
  return Math.max(
    0,
    Math.round(
      (fromIsoDate(weeklyQr.weekEndsOn).getTime() -
        fromIsoDate(getAccraIsoDate()).getTime()) /
        DAY_MS,
    ),
  );
}

function getWeekDays(weekStartsOn) {
  const start = fromIsoDate(weekStartsOn).getTime();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start + index * DAY_MS);

    return {
      dayOfMonth: date.getUTCDate(),
      iso: date.toISOString().slice(0, 10),
      label: weekdayFormatter.format(date),
    };
  });
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

  const [downloading, setDownloading] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  const [actionMessage, setActionMessage] =
    useState("");

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

  async function downloadPoster() {
    if (!weeklyQr || !qrDataUrl) {
      return;
    }

    setDownloading(true);
    setActionMessage("");

    try {
      const pngUrl = await renderPosterPng({
        peerSrc: peerValues,
        qrSrc: qrDataUrl,
        sealSrc: ministrySeal,
      });

      const link = document.createElement("a");
      link.download = `mof-visitor-poster-${weeklyQr.weekStartsOn}-to-${weeklyQr.weekEndsOn}.png`;
      link.href = pngUrl;
      link.click();
    } catch {
      setActionMessage(
        "The poster could not be downloaded. Try again or use Print instead.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function copyLink() {
    if (!weeklyQr) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        weeklyQr.accessUrl,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionMessage(
        "The link could not be copied. Select it and copy it manually.",
      );
    }
  }

  const ready =
    status === "ready" &&
    weeklyQr &&
    qrDataUrl;

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 print:max-w-none print:p-0 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col gap-4 px-1 pt-2 print:hidden xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Reception access
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Weekly visitor QR code
          </h1>

          <p className="mx-auto mt-3 max-w-xl leading-7 sm:mx-0 text-slate-600">
            Display this code on the reception screen or
            print it for the current Monday-to-Sunday
            access period.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap justify-center gap-3 sm:justify-start xl:flex-nowrap">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-600 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "loading"}
            onClick={refreshQr}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${status === "loading" ? "animate-spin" : ""}`}
            />
            Refresh QR
          </button>

          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-600 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!ready || downloading}
            onClick={downloadPoster}
            type="button"
          >
            {downloading ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            Download PNG
          </button>

          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-bold text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!ready}
            onClick={printQr}
            type="button"
          >
            <Printer aria-hidden="true" className="size-4" />
            Print reception QR
          </button>
        </div>
      </header>

      {actionMessage ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print:hidden"
          role="alert"
        >
          {actionMessage}
        </p>
      ) : null}

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

      {ready ? (
        <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 print:mt-0 print:block lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="reception-poster-heading"
            className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
              <h2
                className="text-lg font-black text-slate-950"
                id="reception-poster-heading"
              >
                Reception poster
              </h2>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <Eye aria-hidden="true" className="size-3.5" />
                Print preview
              </span>
            </div>

            <ReceptionPoster
              qrDataUrl={qrDataUrl}
              weeklyQr={weeklyQr}
            />
          </section>

          {/* Stretches to the poster's height; the week card takes the slack. */}
          <div className="flex min-w-0 flex-col gap-4 print:hidden">
            <ValidityCard weeklyQr={weeklyQr} />
            <WeekCard weeklyQr={weeklyQr} />
            <ScanCard
              copied={copied}
              onCopy={copyLink}
              weeklyQr={weeklyQr}
            />

            <aside className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>

              <div>
                <h2 className="font-black text-amber-900">
                  Bearer code
                </h2>
                <p className="mt-1">
                  Anyone with a copy can use it until
                  Sunday night. Keep printed copies at
                  reception and replace them every Monday.
                </p>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Explicit colours (not brand/white utilities) keep the poster identical
// in light mode, dark mode and print.
function ReceptionPoster({ qrDataUrl, weeklyQr }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-[#134e4a] text-[#ffffff] [print-color-adjust:exact] print:mx-auto print:max-w-[170mm] print:break-inside-avoid">
      <div className="relative isolate overflow-hidden px-6 pb-6 pt-7 text-center print:pb-4 print:pt-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full border-[16px] border-[#ffffff14]"
        >
          <span className="absolute inset-8 rounded-full border-[12px] border-[#ffffff12]" />
          <span className="absolute inset-[4.5rem] rounded-full border-[8px] border-[#ffffff0f]" />
        </span>

        <img
          alt="Ministry of Finance, Republic of Ghana seal"
          className="mx-auto size-24 sm:size-28 print:size-20"
          src={ministrySeal}
        />

        <h3 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Visitor Registration
        </h3>

        <p className="mt-2 text-[#ccfbf1] sm:text-lg">
          Scan to access the visitor management application.
        </p>
      </div>

      <div className="bg-[#0f403c] px-6 pb-8 pt-6 text-center print:pb-5 print:pt-4">
        <p className="inline-flex items-center gap-2 text-xl font-black sm:text-2xl">
          <Smartphone aria-hidden="true" className="size-6" />
          Scan QR Code
        </p>

        <div className="mx-auto mt-5 w-full max-w-xs rounded-[2rem] bg-[#e6f6f4] p-4 sm:max-w-sm sm:p-5 print:mt-3 print:max-w-[80mm]">
          <img
            alt={`Weekly visitor QR code, valid ${formatWeekRange(weeklyQr)}`}
            className="aspect-square w-full [image-rendering:pixelated]"
            src={qrDataUrl}
          />
        </div>
      </div>

      <div className="bg-[#fefefe]">
        <img
          alt="PEER: Professional, Ethical, Efficient, Responsive"
          className="mx-auto aspect-[2/1] w-full max-w-2xl object-cover print:max-w-[150mm]"
          src={peerValues}
        />
      </div>
    </div>
  );
}

function ValidityCard({ weeklyQr }) {
  const daysLeft = getDaysLeft(weeklyQr);

  return (
    <section
      aria-labelledby="code-validity-heading"
      className="relative overflow-hidden rounded-3xl bg-brand-800 p-5 text-white shadow-sm sm:p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -right-14 size-52 rounded-full border-[14px] border-white/10"
      >
        <span className="absolute inset-6 rounded-full border-[10px] border-white/10" />
      </span>

      <div className="relative flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-white/15">
          <Clock aria-hidden="true" className="size-5" />
        </span>
        <h2
          className="font-bold"
          id="code-validity-heading"
        >
          Code validity
        </h2>
      </div>

      <p className="relative mt-4 flex items-baseline gap-2">
        {daysLeft > 0 ? (
          <>
            <span className="text-5xl font-black">
              {daysLeft}
            </span>
            <span className="text-lg font-bold">
              {daysLeft === 1 ? "day left" : "days left"}
            </span>
          </>
        ) : (
          <span className="text-3xl font-black">
            Last day
          </span>
        )}
      </p>

      <p className="relative mt-2 text-sm text-white/90">
        Expires {formatLongDay(weeklyQr.weekEndsOn)}, 11:59 pm GMT
      </p>

      <p className="relative mt-4 inline-flex rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold">
        {formatWeekRange(weeklyQr)}
      </p>
    </section>
  );
}

function WeekCard({ weeklyQr }) {
  const today = getAccraIsoDate();
  const days = getWeekDays(weeklyQr.weekStartsOn);
  const todayIndex = days.findIndex(
    (day) => day.iso === today,
  );
  const daysPassed = days.filter(
    (day) => day.iso < today,
  ).length;
  const daysRemaining = days.filter(
    (day) => day.iso > today,
  ).length;
  const weekProgress = Math.round(
    ((daysPassed + (todayIndex >= 0 ? 1 : 0)) / 7) * 100,
  );

  return (
    <section
      aria-labelledby="this-week-heading"
      className="flex flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="text-lg font-black text-slate-950"
          id="this-week-heading"
        >
          This week
        </h2>

        {todayIndex >= 0 ? (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">
            Day {todayIndex + 1} of 7
          </span>
        ) : null}
      </div>

      <ol className="my-auto grid grid-cols-7 gap-1.5 py-5 sm:gap-2">
        {days.map((day) => {
          const state =
            day.iso < today
              ? "passed"
              : day.iso === today
                ? "today"
                : "remaining";

          return (
            <li
              className="flex flex-col items-center gap-1.5"
              key={day.iso}
            >
              <span className="sr-only">
                {day.label} {day.dayOfMonth}: {state}
              </span>
              <span
                aria-hidden="true"
                className={`grid h-14 w-full max-w-12 place-items-center rounded-full text-sm font-black lg:h-20 lg:max-w-14 lg:text-base ${
                  state === "passed"
                    ? "bg-brand-700 text-[#ffffff]"
                    : state === "today"
                      ? "border-2 border-dashed border-brand-600 bg-brand-50 text-brand-800"
                      : "border border-slate-200 bg-[repeating-linear-gradient(135deg,var(--color-slate-200)_0_4px,transparent_4px_9px)] text-slate-700"
                }`}
              >
                {day.dayOfMonth}
              </span>
              <span
                aria-hidden="true"
                className={`text-xs ${
                  state === "today"
                    ? "font-bold text-brand-800"
                    : "text-slate-600"
                }`}
              >
                {day.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-2 gap-3">
        <p className="rounded-2xl bg-slate-50 px-4 py-3">
          <span className="block text-2xl font-black text-slate-950">
            {daysPassed}
          </span>
          <span className="text-xs font-semibold text-slate-600">
            {daysPassed === 1 ? "day passed" : "days passed"}
          </span>
        </p>
        <p className="rounded-2xl bg-slate-50 px-4 py-3">
          <span className="block text-2xl font-black text-slate-950">
            {daysRemaining}
          </span>
          <span className="text-xs font-semibold text-slate-600">
            {daysRemaining === 1
              ? "day after today"
              : "days after today"}
          </span>
        </p>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span id="week-progress-label">Week progress</span>
          <span>{weekProgress}%</span>
        </div>
        <div
          aria-labelledby="week-progress-label"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={weekProgress}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${weekProgress}%` }}
          />
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-brand-700" />
          Passed
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-dashed border-brand-600" />
          Today
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full border border-slate-300" />
          Remaining
        </li>
      </ul>
    </section>
  );
}

function ScanCard({ copied, onCopy, weeklyQr }) {
  const shortUrl = weeklyQr.displayUrl.replace(
    /^https?:\/\//,
    "",
  );

  return (
    <section
      aria-labelledby="scan-heading"
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-800">
          <Camera aria-hidden="true" className="size-5" />
        </span>

        <h2
          className="flex-1 font-bold text-slate-950"
          id="scan-heading"
        >
          Scan with your phone camera
        </h2>

        <a
          aria-label="Open the visitor page in a new tab"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
          href={weeklyQr.accessUrl}
          rel="noopener noreferrer"
          target="_blank"
          title="Open the visitor page in a new tab"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        Open the link shown by your camera and select
        whether you are a new or returning visitor.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-4 pr-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
          {shortUrl}
        </span>

        <button
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand-800 px-4 text-xs font-bold text-white transition hover:bg-brand-900"
          onClick={onCopy}
          type="button"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
          <span aria-live="polite">
            {copied ? "Copied" : "Copy link"}
          </span>
        </button>
      </div>
    </section>
  );
}
