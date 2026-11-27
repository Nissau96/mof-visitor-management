import {
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  LoaderCircle,
  LogOut,
  MapPin,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import CheckoutArt from "./CheckoutArt.jsx";
import { getTowerLabel } from "../constants/visitorOptions.js";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Accra",
  year: "numeric",
});

const ROLE_LABELS = {
  admin: "Super Administrator",
  client_service_head: "Unit Head",
  receptionist: "Receptionist",
};

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = toDate(value);

  return date ? timeFormatter.format(date) : "—";
}

function formatDay(value) {
  const date = toDate(value);

  return date ? dateFormatter.format(date) : "—";
}

// "2h 59m", "45m", "1d 3h". Null when the check-in time is unknown.
function formatTimeOnSite(from, to) {
  const start = toDate(from);
  const end = toDate(to);

  if (!start || !end) {
    return null;
  }

  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function initialsOf(name) {
  return (
    String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "V"
  );
}

function HeaderChip({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-1 sm:gap-1.5 sm:px-2.5 ${className}`}>
      {children}
    </span>
  );
}

function TimeStamp({ align = "left", label, value }) {
  const alignment = align === "right" ? "text-right" : "";

  return (
    <div className={`min-w-0 ${alignment}`}>
      <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#99f6e4]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-[#ffffff] sm:text-[1.75rem]">
        {formatTime(value)}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-[#ccfbf1]">
        {formatDay(value)}
      </p>
    </div>
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3">
      <dt className="contents">
        <span aria-hidden="true" className="row-span-2 grid size-10 place-items-center rounded-xl bg-white text-brand-700 ring-1 ring-slate-200 dark:bg-[#111a2b]! dark:text-brand-300! dark:ring-[#1f2a3d]!">
          <Icon className="size-4.5" />
        </span>
        <span className="self-end text-xs font-semibold text-slate-500">{label}</span>
      </dt>
      <dd className="col-start-2 self-start truncate font-black text-slate-950">{value || "—"}</dd>
    </div>
  );
}

/**
 * Dashboard check-out confirmation.
 * visitor: { fullName, organization, reference, tower, purpose, checkedInAt }
 * staff:   { fullName, role } — the account the departure is recorded against.
 */
export default function CheckoutConfirmDialog({
  checkingOut,
  error,
  onCancel,
  onConfirm,
  staff,
  visitor,
}) {
  const [now, setNow] = useState(() => new Date());

  // Keep the departure time and time on site current while the dialog is open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !checkingOut) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [checkingOut, onCancel]);

  const timeOnSite = formatTimeOnSite(visitor.checkedInAt, now);
  const staffRole = ROLE_LABELS[staff?.role] || "Staff";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <section aria-describedby="checkout-dialog-description" aria-labelledby="checkout-dialog-heading" aria-modal="true" className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl shadow-slate-950/30 sm:max-w-136 sm:rounded-4xl" role="dialog">
        {/* Header */}
        <div className="relative isolate shrink-0 overflow-hidden bg-linear-to-br from-[#e6f8f4] via-[#f2fbf9] to-white px-5 pb-5 pt-5 dark:bg-linear-to-br dark:from-[#0d2a27] dark:via-[#0d1d27] dark:to-[#0b1220] sm:px-7 sm:pt-6">
          {/* Concentric rings and a dotted arc in the top-right corner. */}
          <span aria-hidden="true">
            {["size-80", "size-60", "size-40"].map((size) => (
              <span className={`pointer-events-none absolute -right-20 -top-24 -z-10 rounded-full border border-[#0f766e]/10 dark:border-[#5eead4]/10 ${size}`} key={size} />
            ))}
            <span className="pointer-events-none absolute right-24 top-6 -z-10 size-1.5 rounded-full bg-[#5eead4]" />
          </span>

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center overflow-hidden rounded-full text-[0.6875rem] font-bold sm:text-xs ring-1 ring-[#0f766e]/25 dark:ring-[#5eead4]/25">
              <HeaderChip className="bg-white text-[#0f5f58] dark:bg-[#0b1220]! dark:text-[#99f6e4]!">
                <span aria-hidden="true" className="size-2 rounded-full bg-[#10b981]" />
                Checked in
              </HeaderChip>
              <HeaderChip className="border-l border-[#0f766e]/20 bg-white text-slate-700 dark:border-[#5eead4]/20 dark:bg-[#0b1220]! dark:text-[#e2e8f0]!">
                <Clock3 aria-hidden="true" className="size-3.5 text-[#0f766e] dark:text-[#5eead4]" />
                <span className="tabular-nums">{formatTime(visitor.checkedInAt)}</span>
              </HeaderChip>
              <HeaderChip className="bg-[#115e59] text-[#ffffff]">
                <CalendarDays aria-hidden="true" className="size-3.5 text-[#fcd34d]" />
                {formatDay(visitor.checkedInAt)}
              </HeaderChip>
            </div>

            <button aria-label="Close dialog" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:opacity-50 dark:bg-[#111a2b]! dark:text-[#e2e8f0]! dark:ring-[#1f2a3d]!" disabled={checkingOut} onClick={onCancel} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-balance text-[1.375rem] font-black leading-tight tracking-tight text-slate-950 sm:text-2xl" id="checkout-dialog-heading">
                Confirm visitor check-out
              </h2>
              <p className="mt-2 max-w-[36ch] text-sm leading-6 text-slate-600" id="checkout-dialog-description">
                Confirm this visitor is leaving the premises. We record the departure time, tower and your staff account.
              </p>
            </div>

            <CheckoutArt className="-mb-1 hidden h-24 w-34 shrink-0 sm:block" />
          </div>
        </div>

        {/* Body */}
        <div className="scroll-pane min-h-0 flex-1 space-y-3.5 px-5 pb-5 pt-4 sm:px-7">
          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 dark:bg-[#0f1726]! dark:border-[#1f2a3d]!">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#ccfbf1] text-base font-black text-[#115e59] dark:bg-[#123b37]! dark:text-[#99f6e4]!">
              {initialsOf(visitor.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black text-slate-950">{visitor.fullName}</p>
              {visitor.organization ? (
                <p className="truncate text-sm text-slate-600">{visitor.organization}</p>
              ) : null}
              <span className="mt-1.5 inline-block rounded-md border border-[#99e6da] bg-[#f0fdfa] px-2 py-0.5 font-mono text-xs font-bold text-[#0f766e] dark:bg-[#0b2b29]! dark:border-[#14756d]! dark:text-[#5eead4]! sm:hidden">
                <span className="sr-only">Visit reference </span>
                {visitor.reference}
              </span>
            </div>
            <span className="hidden shrink-0 sm:inline rounded-lg border border-[#99e6da] bg-[#f0fdfa] px-2.5 py-1.5 font-mono text-xs font-bold text-[#0f766e] dark:bg-[#0b2b29]! dark:border-[#14756d]! dark:text-[#5eead4]!">
              <span className="sr-only">Visit reference </span>
              {visitor.reference}
            </span>
          </div>

          {/* Time on site */}
          <div className="relative isolate overflow-hidden rounded-2xl bg-linear-to-br from-[#0f766e] to-[#115e59] px-4 py-4 sm:px-5">
            <span aria-hidden="true">
              <span className="pointer-events-none absolute -bottom-16 -right-10 -z-10 size-44 rounded-full border-[18px] border-[#ffffff]/6" />
              <span className="pointer-events-none absolute -left-8 -top-10 -z-10 size-24 rounded-full bg-[#ffffff]/5" />
            </span>

            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <TimeStamp label="Checked in" value={visitor.checkedInAt} />

              <div className="flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full bg-[#5eead4] ring-4 ring-[#5eead4]/20" />
                <span className="hidden h-px flex-1 border-t-2 border-dashed border-[#5eead4]/50 sm:block" />
                {timeOnSite ? (
                  <span className="mx-auto shrink-0 whitespace-nowrap rounded-full bg-[#ffffff]/10 px-2.5 py-1 text-xs font-bold text-[#ffffff] sm:mx-0">
                    {timeOnSite}
                    <span className="hidden sm:inline"> on site</span>
                    <span className="sr-only sm:hidden"> on site</span>
                  </span>
                ) : (
                  <span className="mx-auto h-px flex-1 border-t-2 border-dashed border-[#5eead4]/50 sm:hidden" />
                )}
                <span className="hidden h-px flex-1 border-t-2 border-dashed border-[#fcd34d]/50 sm:block" />
                <span className="size-2 shrink-0 rounded-full bg-[#fcd34d] ring-4 ring-[#fcd34d]/20" />
              </div>

              <TimeStamp align="right" label="Checking out" value={now} />
            </div>
          </div>

          <dl className="grid gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-[#0f1726]! sm:grid-cols-2">
            <Fact icon={MapPin} label="Reception tower" value={getTowerLabel(visitor.tower)} />
            <Fact icon={BriefcaseBusiness} label="Purpose" value={visitor.purpose} />
          </dl>

          {staff?.fullName ? (
            <p className="flex items-center gap-2 px-1 text-sm text-slate-600">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
              <span className="min-w-0">
                Recorded as <strong className="font-bold text-slate-950">{staff.fullName}</strong>
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {staffRole}
              </span>
            </p>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button autoFocus className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={checkingOut} onClick={onCancel} type="button">
            Cancel
          </button>

          <button className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-6 text-sm font-bold text-[#ffffff] shadow-lg shadow-[#0f766e]/25 transition-colors hover:from-[#0f766e] hover:to-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-70" disabled={checkingOut} onClick={onConfirm} type="button">
            {checkingOut ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <LogOut aria-hidden="true" className="size-4" />
            )}
            {checkingOut ? "Checking out…" : "Confirm check-out"}
          </button>
        </div>
      </section>
    </div>
  );
}
