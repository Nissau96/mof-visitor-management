import {
  Ban,
  Building2,
  Clock,
  Landmark,
  MapPin,
  Pencil,
  RotateCcw,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import ErrorMessage from "./ErrorMessage.jsx";
import MeetingDetailsArt from "./MeetingDetailsArt.jsx";
import { GuestAvatar } from "./MyBookingCard.jsx";
import { getTowerLabel } from "../constants/visitorOptions.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { ApiError } from "../lib/api.js";
import { getStaffMeetingVisitors } from "../lib/meetingApi.js";
import {
  formatSchedule,
  formatTimeRange,
  meetingOccursOn,
  toDate,
} from "../lib/meetingSchedule.js";

// Details of one scheduled meeting: when, where, who hosts it and who
// has registered for it, with the manager's actions in the footer.

const tileMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const tileWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });
const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
  year: "numeric",
});

const FOOTER_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-black transition sm:px-6 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60";

function toMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);

  return hours * 60 + minutes;
}

// "2h 30m", or "" when the meeting has no end time.
function formatMeetingLength(meeting) {
  if (!meeting.startsAt || !meeting.endsAt) {
    return "";
  }

  const total = toMinutes(meeting.endsAt) - toMinutes(meeting.startsAt);

  if (!Number.isFinite(total) || total <= 0) {
    return "";
  }

  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""]
    .filter(Boolean)
    .join(" ");
}

function hostName(meeting) {
  return meeting.hostDivision || meeting.hostAgency || "Not set";
}

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 gap-3">
      <dt className="contents">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/70 dark:bg-[#111a2b] dark:ring-[#24344c]"
        >
          <Icon className="size-4.5" />
        </span>
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0">
        <span aria-hidden="true" className="block text-xs font-semibold text-slate-600">
          {label}
        </span>
        <span className="block text-pretty font-bold text-slate-950">{children}</span>
      </dd>
    </div>
  );
}

function RegisteredVisitors({ accessToken, meeting, onSessionExpired, tower }) {
  const [state, setState] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getStaffMeetingVisitors({
      accessToken,
      meetingId: meeting.meetingId,
      signal: controller.signal,
      tower,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({
            status: "ready",
            visitors: Array.isArray(data?.visitors) ? data.visitors : [],
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired();
          return;
        }

        setState({
          message:
            error instanceof Error && error.message
              ? error.message
              : "Registered visitors could not be loaded.",
          status: "error",
        });
      });

    return () => controller.abort();
  }, [accessToken, attempt, meeting.meetingId, onSessionExpired, tower]);

  if (state.status === "error") {
    return (
      <ErrorMessage
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((current) => current + 1);
        }}
        title="Visitors not loaded"
      />
    );
  }

  if (state.status === "loading") {
    return (
      <ul aria-busy="true" aria-label="Loading registered visitors" className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70">
        {Array.from({ length: Math.min(meeting.visitorCount, 3) }, (_, index) => (
          <li className="flex items-center gap-3 px-4 py-3" key={index}>
            <span className="size-8 animate-pulse rounded-full bg-slate-100" />
            <span className="h-3.5 w-32 animate-pulse rounded-full bg-slate-100" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="max-h-64 divide-y divide-slate-200/70 overflow-y-auto rounded-2xl border border-slate-200/70">
      {state.visitors.map((visitor) => (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" key={visitor.visitId}>
          <GuestAvatar name={visitor.fullName} />
          <span className="min-w-0 flex-1 font-bold text-slate-950">{visitor.fullName}</span>
          {visitor.organization ? (
            <span className="text-sm text-slate-600 max-sm:basis-full max-sm:pl-11">
              {visitor.organization}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// day: the calendar day the dialog was opened from, when there is one.
export default function MeetingDetailsDialog({
  accessToken,
  day,
  meeting,
  onCancelMeeting,
  onClose,
  onEdit,
  onRestore,
  onSessionExpired,
  tower,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(null);
  const today = getAccraIsoDate();
  const shownDay = day || meeting.startsOn;
  const single = meeting.scheduleType === "single";
  const time = formatTimeRange(meeting);
  const length = formatMeetingLength(meeting);
  const host = [meeting.hostAgency, meeting.hostDivision].filter(Boolean).join(" · ");
  const happeningToday = meeting.active && meetingOccursOn(meeting, today);
  const visitorCount = Number(meeting.visitorCount) || 0;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby={host ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        role="dialog"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-brand-100 bg-linear-to-br from-brand-50 via-white to-white px-5 pb-5 pt-6 sm:px-7 dark:border-[#1f4f4b] dark:from-[#0f2f2c] dark:via-transparent dark:to-transparent">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border border-brand-100 dark:border-[#1f4f4b]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-6 size-36 rounded-full border border-brand-100 dark:border-[#1f4f4b]"
          />

          <div className="relative flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                {meeting.active ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-800 ring-1 ring-brand-200 dark:bg-transparent">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-600" />
                    Scheduled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-slate-500" />
                    Cancelled
                  </span>
                )}
                {happeningToday ? (
                  <span className="rounded-full bg-brand-800 px-2.5 py-0.5 text-xs font-black text-white">
                    Today
                  </span>
                ) : null}
              </p>

              <h2
                className="mt-3 text-balance text-xl font-black leading-snug tracking-tight text-slate-950 sm:text-2xl"
                id={titleId}
              >
                {meeting.title}
              </h2>

              {host ? (
                <p className="mt-1.5 text-sm text-slate-600" id={descriptionId}>
                  {host}
                </p>
              ) : null}
            </div>

            <MeetingDetailsArt className="hidden h-28 w-36 shrink-0 self-center sm:block" />

            <button
              aria-label="Close meeting details"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 dark:bg-[#111a2b]"
              onClick={onClose}
              ref={closeRef}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-5 sm:px-7">
          {/* When */}
          <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-brand-100 bg-linear-to-r from-white to-brand-50/70 p-4 dark:border-[#1f4f4b] dark:from-transparent dark:to-[#0f2f2c]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -right-10 size-40 rounded-full border border-brand-100 dark:border-[#1f4f4b]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-12 -right-2 size-24 rounded-full border border-brand-100 dark:border-[#1f4f4b]"
            />

            {shownDay ? (
              <span
                aria-hidden="true"
                className="grid w-16 shrink-0 place-items-center rounded-2xl bg-brand-800 py-2 text-white"
              >
                <span className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">
                  {tileMonth.format(toDate(shownDay))}
                </span>
                <span className="text-[1.75rem] font-black leading-none">
                  {toDate(shownDay).getUTCDate()}
                </span>
                <span className="text-[0.6875rem] font-bold">
                  {tileWeekday.format(toDate(shownDay))}
                </span>
              </span>
            ) : null}

            <div className="relative min-w-0">
              <p className="text-lg font-black text-slate-950">
                {single || !day
                  ? single
                    ? longDate.format(toDate(meeting.startsOn)).replace(/,/g, "")
                    : formatSchedule(meeting)
                  : longDate.format(toDate(day)).replace(/,/g, "")}
              </p>
              {!single && day ? (
                <p className="text-sm text-slate-600">{formatSchedule(meeting)}</p>
              ) : null}
              <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-800">
                <Clock aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
                <span className="font-semibold">{time || "Time not set"}</span>
                {length ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-black text-brand-800 ring-1 ring-brand-100 dark:bg-[#0f2f2c] dark:ring-[#1f4f4b]">
                    {length}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          {/* Where and who */}
          <dl className="grid gap-x-6 gap-y-5 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 sm:p-5">
            <Fact icon={MapPin} label="Venue">
              {meeting.venue || "Not set"}
            </Fact>
            <Fact icon={Building2} label="Tower">
              {meeting.tower ? getTowerLabel(meeting.tower) : "No tower"}
            </Fact>
            <Fact icon={Landmark} label="Host">
              {hostName(meeting)}
            </Fact>
            <Fact icon={UsersRound} label="Visitors registered">
              {visitorCount === 1 ? "1 visitor" : `${visitorCount} visitors`}
            </Fact>
          </dl>

          {visitorCount > 0 ? (
            <section aria-labelledby={`${titleId}-visitors`} className="grid gap-2.5">
              <h3
                className="text-xs font-black uppercase tracking-widest text-slate-600"
                id={`${titleId}-visitors`}
              >
                Registered visitors
              </h3>
              <RegisteredVisitors
                accessToken={accessToken}
                meeting={meeting}
                onSessionExpired={onSessionExpired}
                tower={tower}
              />
            </section>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            {meeting.canManage && meeting.active ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-100"
                onClick={onCancelMeeting}
                type="button"
              >
                <Ban aria-hidden="true" className="size-4" />
                Cancel meeting
              </button>
            ) : null}
            {meeting.canManage && !meeting.active ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200"
                onClick={onRestore}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Restore meeting
              </button>
            ) : null}
          </div>

          <div className="flex gap-3 max-sm:[&>button]:flex-1">
            <button
              className={`${FOOTER_BUTTON} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-brand-200 dark:bg-transparent`}
              onClick={onClose}
              type="button"
            >
              Close
            </button>

            {meeting.canManage && meeting.active ? (
              <button
                className={`${FOOTER_BUTTON} bg-brand-800 text-white hover:bg-brand-900 focus-visible:ring-brand-200`}
                onClick={onEdit}
                type="button"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit meeting
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
