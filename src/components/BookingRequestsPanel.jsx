import {
  Building2,
  CalendarCheck,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Inbox,
  LoaderCircle,
  MapPin,
  Repeat,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AdminDialog, {
  DIALOG_CANCEL_BUTTON,
  DIALOG_INPUT,
  DialogBody,
  DialogFooter,
} from "./AdminDialog.jsx";
import { GuestAvatar, GuestTable, PillPager } from "./MyBookingCard.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import LoadingState from "./LoadingState.jsx";
import { getTowerLabel } from "../constants/visitorOptions.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { ApiError } from "../lib/api.js";
import {
  decideMeetingBooking,
  getBookingRequests,
} from "../lib/bookingApi.js";
import {
  formatDate,
  formatSchedule,
  formatTimeRange,
  isMultiDayBooking,
  toDate,
} from "../lib/meetingSchedule.js";
import { lastBookingDay, shortAgencyName } from "../lib/myBookings.js";
import { toast } from "../lib/toast.js";

// Reception's view of meetings booked by Ministry staff through /book.
//
// mode "queue" (Dashboard): requests waiting for a decision only. The
//   card is hidden while there are none, and refreshes every minute.
// mode "schedule" (Meetings page): Approved and Closed bookings, Approved
//   first.
//
// Approving adds the meeting to the schedule; its guests then appear in
// pending admissions on the meeting's first day.

const SCHEDULE_VIEWS = Object.freeze([
  { countKey: "approvedCount", label: "Approved", value: "approved" },
  { countKey: "closedCount", label: "Closed", value: "closed" },
]);

const EMPTY_MESSAGES = Object.freeze({
  approved: "No approved bookings are coming up.",
  closed: "No bookings were closed in the last 60 days.",
});

const QUEUE_REFRESH_MS = 60_000;

const GUESTS_PER_PAGE = 6;

// Status chip with a dot, as in the booker's own cards.
const CARD_CHIPS = Object.freeze({
  approved: { dot: "bg-emerald-600", label: "Approved", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  cancelled: { dot: "bg-slate-400", label: "Cancelled", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  completed: { dot: "bg-slate-500", label: "Completed", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  expired: { dot: "bg-slate-400", label: "Expired", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  pending: { dot: "bg-amber-500", label: "Waiting for approval", tone: "bg-amber-50 text-amber-900 ring-amber-300" },
  rejected: { dot: "bg-red-600", label: "Not approved", tone: "bg-red-50 text-red-700 ring-red-200" },
});

// Each kind of booking has its own date tile and header tint.
const CARD_TONES = Object.freeze({
  approved: {
    border: "border-brand-200 dark:border-[#1f4f4a]",
    header: "bg-linear-to-r from-brand-50 to-white dark:bg-linear-to-b dark:from-[#0f2f2c]/80 dark:via-[#0f2f2c]/30 dark:to-transparent",
    tile: "bg-brand-800 text-white",
  },
  closed: {
    border: "border-slate-200",
    header: "bg-linear-to-r from-slate-50 to-white dark:bg-linear-to-b dark:from-[#1b2536]/80 dark:via-[#1b2536]/30 dark:to-transparent",
    tile: "bg-slate-200 text-slate-800 dark:bg-[#2a3a52] dark:text-slate-100",
  },
  waiting: {
    border: "border-amber-200 dark:border-[#5b4615]",
    header: "bg-linear-to-r from-amber-50 to-white dark:bg-linear-to-b dark:from-[#3a2c0b]/80 dark:via-[#3a2c0b]/30 dark:to-transparent",
    tile: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  },
});

function readTabCounts(data, view) {
  const counts = {};

  for (const option of SCHEDULE_VIEWS) {
    const value = Number(data?.[option.countKey]);

    if (Number.isInteger(value) && value >= 0) {
      counts[option.value] = value;
    } else if (option.value === view && Array.isArray(data?.bookings)) {
      // Older servers do not send counts; the open list still has one.
      counts[option.value] = data.bookings.length;
    }
  }

  return counts;
}

function cardChip(booking, today) {
  if (booking.status === "approved" && lastBookingDay(booking) < today) {
    return CARD_CHIPS.completed;
  }

  return CARD_CHIPS[booking.status] || CARD_CHIPS.pending;
}

function cardTone(booking, today) {
  if (booking.status === "pending") {
    return CARD_TONES.waiting;
  }

  return booking.status === "approved" && lastBookingDay(booking) >= today
    ? CARD_TONES.approved
    : CARD_TONES.closed;
}

const tileMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const tileWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });

function RejectDialog({ booking, onClose, onConfirm, submitting, error }) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 2;

  return (
    <AdminDialog
      busy={submitting}
      description={`${booking.bookerName} is emailed this reason.`}
      eyebrow={booking.referenceCode}
      icon={CircleX}
      onClose={onClose}
      tone="danger"
      title={`Reject “${booking.title}”?`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();

          if (!tooShort) {
            onConfirm(reason.trim());
          }
        }}
      >
        <DialogBody>
          {error ? <ErrorMessage message={error} title="Not rejected" /> : null}
          <div className="grid gap-2">
            <label className="font-semibold text-slate-800" htmlFor="booking-reject-reason">
              Reason
              <span aria-hidden="true" className="ml-1 text-red-700">*</span>
            </label>
            <textarea
              className={`${DIALOG_INPUT} min-h-28`}
              disabled={submitting}
              id="booking-reject-reason"
              maxLength="500"
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The conference room is booked at that time."
              required
              value={reason}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <button className={DIALOG_CANCEL_BUTTON} disabled={submitting} onClick={onClose} type="button">
            Keep request
          </button>
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-red-700 px-6 text-sm font-black text-white transition-colors hover:bg-red-800 focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting || tooShort}
            type="submit"
          >
            {submitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
            {submitting ? "Rejecting…" : "Reject request"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}

function DateTile({ isoDate, tone }) {
  if (!isoDate) {
    return null;
  }

  const date = toDate(isoDate);

  return (
    <span
      aria-hidden="true"
      className={`grid w-14 shrink-0 place-items-center self-start rounded-2xl py-2 sm:w-16 ${tone}`}
    >
      <span className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">
        {tileMonth.format(date)}
      </span>
      <span className="text-2xl font-black leading-none sm:text-[1.75rem]">{date.getUTCDate()}</span>
      <span className="text-[0.6875rem] font-bold">{tileWeekday.format(date)}</span>
    </span>
  );
}

function Fact({ children, icon: Icon }) {
  return (
    <li className="inline-flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function GuestsBox({ count }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-2xl border-2 border-brand-700 bg-white px-3 py-1 text-brand-800 sm:grid sm:min-w-20 sm:place-items-center sm:gap-0 sm:px-4 sm:py-2 dark:bg-transparent">
      <span className="text-[0.625rem] font-black uppercase tracking-[0.16em]">
        {count === 1 ? "Guest" : "Guests"}
      </span>
      <span className="text-lg font-black leading-tight sm:text-2xl">{count}</span>
    </p>
  );
}

function RequestCard({ booking, busy, onApprove, onReject, today }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const guestsId = `booking-guests-${booking.bookingId}`;
  const host = [booking.hostDivision, shortAgencyName(booking.hostAgency)]
    .filter(Boolean)
    .join(", ");
  const chip = cardChip(booking, today);
  const tone = cardTone(booking, today);
  const closed = !["pending", "approved"].includes(booking.status);

  // Guests of a rejected, cancelled or expired booking are not coming.
  const guests = useMemo(
    () =>
      booking.guests.map((guest) =>
        closed && ["expected", "waiting"].includes(guest.status)
          ? { ...guest, status: "not_expected" }
          : guest,
      ),
    [booking.guests, closed],
  );
  const guestCount = guests.length;
  const offset = (page - 1) * GUESTS_PER_PAGE;

  return (
    <article
      aria-label={`${booking.title}, ${formatDate(booking.meetingDate, { weekday: true })}`}
      className={`min-w-0 overflow-hidden rounded-3xl border bg-white ${tone.border}`}
    >
      <div className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5 ${tone.header}`}>
        <div className="flex min-w-0 flex-1 gap-3.5 sm:gap-5">
          <DateTile isoDate={booking.meetingDate} tone={tone.tile} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wide text-slate-600">
                {booking.referenceCode}
              </span>
              <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${chip.tone}`}>
                <span aria-hidden="true" className={`size-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
              </span>
            </div>
            <h3 className="mt-1.5 text-pretty text-base font-black leading-snug text-slate-950 sm:text-lg">
              {booking.title}
            </h3>
            <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              {formatTimeRange(booking) ? (
                <Fact icon={Clock}>{formatTimeRange(booking)}</Fact>
              ) : null}
              {isMultiDayBooking(booking) ? (
                <Fact icon={Repeat}>{formatSchedule(booking)}</Fact>
              ) : null}
              {booking.venue ? <Fact icon={MapPin}>{booking.venue}</Fact> : null}
              {host ? (
                <Fact icon={Building2}>
                  {host} · {getTowerLabel(booking.tower)}
                </Fact>
              ) : null}
            </ul>
            <p className="mt-2.5 flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <GuestAvatar name={booking.bookerName} />
              <span className="min-w-0">
                Booked by <span className="font-bold text-slate-900">{booking.bookerName}</span>{" "}
                <a
                  className="font-medium text-brand-800 wrap-anywhere max-sm:block underline underline-offset-2 hover:text-brand-900 focus-visible:rounded focus-visible:ring-4 focus-visible:ring-brand-200"
                  href={`mailto:${booking.bookerEmail}`}
                >
                  {booking.bookerEmail}
                </a>
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-17.5 sm:shrink-0 sm:flex-col sm:items-stretch sm:pl-0">
          <GuestsBox count={guestCount} />

          {booking.canDecide ? (
            <>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-black text-white transition hover:bg-brand-900 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
                disabled={busy}
                onClick={() => onApprove(booking)}
                type="button"
              >
                {busy ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <CircleCheck aria-hidden="true" className="size-4" />
                )}
                Approve
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-60 dark:bg-transparent"
                disabled={busy}
                onClick={() => onReject(booking)}
                type="button"
              >
                <CircleX aria-hidden="true" className="size-4" />
                Reject
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 px-4 pb-4 pt-2.5 sm:pb-5 sm:pl-26 sm:pr-5">
        {booking.notes ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            <span className="mr-2 font-black text-amber-900">Notes</span>
            {booking.notes}
          </p>
        ) : null}

        {booking.decisionReason ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-950">
            <span className="mr-2 font-black text-red-800">Reason</span>
            {booking.decisionReason}
          </p>
        ) : null}

        <div>
          <button
            aria-controls={guestsId}
            aria-expanded={open}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-bold text-brand-800 hover:underline focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-default disabled:text-slate-500 disabled:no-underline"
            disabled={guestCount === 0}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {guestCount ? (
              <ChevronDown aria-hidden="true" className={`size-4 transition ${open ? "rotate-180" : ""}`} />
            ) : null}
            {guestCount === 0
              ? "No guests listed"
              : `${open ? "Hide" : "Show"} ${guestCount === 1 ? "1 guest" : `${guestCount} guests`}`}
          </button>
        </div>

        {open ? (
          <div className="grid gap-4" id={guestsId}>
            <GuestTable
              guests={guests.slice(offset, offset + GUESTS_PER_PAGE)}
              offset={offset}
            />
            {guestCount > GUESTS_PER_PAGE ? (
              <PillPager
                label={`Guest pages for ${booking.title}`}
                noun="guests"
                nounSingular="guest"
                onPage={setPage}
                page={page}
                pageSize={GUESTS_PER_PAGE}
                total={guestCount}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ViewTab({ active, count, label, onClick }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm transition focus-visible:ring-4 focus-visible:ring-brand-200 ${
        active
          ? "bg-white font-bold text-brand-800 shadow-sm ring-1 ring-brand-200 dark:bg-[#24344c] dark:text-[#5eead4] dark:ring-transparent"
          : "font-semibold text-slate-600 hover:text-slate-900"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      {Number.isInteger(count) ? (
        <span
          className={`grid min-w-5 place-items-center rounded-full px-1.5 text-xs font-black leading-5 ${
            active ? "bg-brand-800 text-white" : "bg-slate-200 text-slate-700 dark:bg-[#2a3a52] dark:text-slate-200"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export default function BookingRequestsPanel({
  accessToken,
  mode = "schedule",
  onApproved = () => undefined,
  onCounts,
  onSessionExpired,
  tower,
}) {
  const queue = mode === "queue";
  const [view, setView] = useState(queue ? "pending" : "approved");
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [deciding, setDeciding] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [rejectError, setRejectError] = useState("");
  // Tab counts stay on screen while another view loads.
  const [tabCounts, setTabCounts] = useState({});

  useEffect(() => {
    const controller = new AbortController();

    getBookingRequests({
      accessToken,
      signal: controller.signal,
      tower,
      view,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setTabCounts((current) => ({ ...current, ...readTabCounts(data, view) }));
          setStatus("ready");
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

        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : "Booking requests could not be loaded.",
        );
        setStatus("error");
      });

    return () => controller.abort();
  }, [accessToken, onSessionExpired, refreshKey, tower, view]);

  // The dashboard queue picks up new requests on its own, quietly (the
  // list stays on screen while it refreshes).
  useEffect(() => {
    if (!queue) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshKey((key) => key + 1);
      }
    }, QUEUE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [queue]);

  function reload() {
    setStatus("loading");
    setRefreshKey((key) => key + 1);
  }

  async function decide(booking, decision, reason = "") {
    setDeciding(booking.bookingId);
    setRejectError("");

    try {
      const updated = await decideMeetingBooking({
        accessToken,
        bookingId: booking.bookingId,
        decision,
        reason,
        tower,
      });

      const emailNote = updated.emailSent
        ? `${booking.bookerName} has been emailed.`
        : `The email to ${booking.bookerName} could not be sent; let them know directly.`;

      if (decision === "approve") {
        toast.success("Booking approved", `“${booking.title}” is on the meeting schedule. ${emailNote}`);
        onApproved();
      } else {
        toast.success("Booking rejected", emailNote);
      }

      setRejecting(null);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }

      const message =
        error instanceof Error && error.message
          ? error.message
          : "The request could not be answered.";

      if (decision === "reject") {
        setRejectError(message);
      } else {
        toast.error("Booking not approved", message);
        reload();
      }
    } finally {
      setDeciding("");
    }
  }

  const bookings = result?.bookings || [];
  const pendingCount = Number(result?.pendingCount || 0);
  const today = getAccraIsoDate();
  useEffect(() => {
    onCounts?.(tabCounts);
  }, [onCounts, tabCounts]);

  // The queue only takes space when there is something to decide, or
  // when it could not be checked (so a failure is never silent).
  if (queue && status !== "error" && bookings.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby={`booking-requests-heading-${mode}`}
      className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-6 ${queue ? "mt-6 border-amber-200" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-2xl ${queue ? "bg-amber-100 text-amber-900" : "bg-brand-50 text-brand-800"}`}
          >
            <CalendarCheck aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              className="flex items-center gap-2 text-lg font-black text-slate-950"
              id={`booking-requests-heading-${mode}`}
            >
              {queue ? "Booking requests" : "Booked by Ministry staff"}
              {queue && pendingCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-900 ring-1 ring-amber-300">
                  {pendingCount}
                </span>
              ) : null}
            </h2>
            <p className="text-sm text-slate-600">
              {queue
                ? `${pendingCount === 1 ? "1 meeting is" : `${pendingCount} meetings are`} waiting for your approval.`
                : "Meetings booked through the booking link."}
            </p>
          </div>
        </div>

        {queue ? null : (
          <div
            aria-label="Booking view"
            className="flex gap-1 rounded-full border border-slate-200 bg-slate-100 p-1"
            role="group"
          >
            {SCHEDULE_VIEWS.map((option) => (
              <ViewTab
                active={view === option.value}
                count={tabCounts[option.value]}
                key={option.value}
                label={option.label}
                onClick={() => {
                  if (option.value !== view) {
                    setView(option.value);
                    setResult(null);
                    setStatus("loading");
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div aria-busy={status === "loading"} className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
        {status === "loading" && bookings.length === 0 ? (
          <LoadingState message="Loading bookings…" />
        ) : null}

        {status === "error" ? (
          <ErrorMessage message={loadError} onRetry={reload} title="Booking requests not loaded" />
        ) : null}

        {status === "ready" && bookings.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
            <Inbox aria-hidden="true" className="size-4 shrink-0" />
            {EMPTY_MESSAGES[view]}
          </p>
        ) : null}

        {status !== "error"
          ? bookings.map((booking) => (
              <RequestCard
                booking={booking}
                busy={deciding === booking.bookingId}
                key={booking.bookingId}
                onApprove={(target) => decide(target, "approve")}
                onReject={(target) => {
                  setRejectError("");
                  setRejecting(target);
                }}
                today={today}
              />
            ))
          : null}
      </div>

      {rejecting ? (
        <RejectDialog
          booking={rejecting}
          error={rejectError}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => decide(rejecting, "reject", reason)}
          submitting={deciding === rejecting.bookingId}
        />
      ) : null}
    </section>
  );
}
