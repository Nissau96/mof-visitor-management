import {
  Ban,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  MapPin,
  Repeat,
  Search,
  UserPen,
  Wifi,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { BookingStatusChip } from "./BookingStatus.jsx";
import SegmentedChoice from "./SegmentedChoice.jsx";
import { getFloorLabel } from "../constants/visitorOptions.js";
import {
  formatSchedule,
  formatTimeRange,
  isMultiDayBooking,
  toDate,
} from "../lib/meetingSchedule.js";
import {
  describeGuestProgress,
  isUpcomingBooking,
  lastBookingDay,
  nextBookingDay,
  shortAgencyName,
} from "../lib/myBookings.js";
import { LATER_DAYS_NOTE } from "../validation/meetingBookings.js";

const GUESTS_PER_PAGE = 6;

const tileMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const tileWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });
const fullDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

// Colours per kind of booking: waiting for reception (teal), approved
// and still to come (green), past or closed (red).
const CARD_THEMES = Object.freeze({
  approved: {
    accent: "border-[#1f6b3a] text-[#1f6b3a] dark:border-[#6ee7a0] dark:text-[#6ee7a0]",
    border: "border-[#2f8a4f] dark:border-[#3fa565]",
    header: "bg-linear-to-r from-[#e3f8ea] to-white dark:from-[#0d3b26] dark:to-transparent",
    icon: "text-[#1f6b3a] dark:text-[#6ee7a0]",
    tile: "bg-[#1f6b3a]",
    toggle: "border-[#9fdcb4] bg-[#e3f8ea] text-[#1f6b3a] hover:bg-[#cdf1d9] dark:border-[#2f6b45] dark:bg-[#0d3b26]! dark:text-[#6ee7a0] dark:hover:bg-[#14502f]!",
  },
  past: {
    accent: "border-red-700 text-red-700",
    border: "border-red-600",
    header: "bg-linear-to-r from-red-50 to-white dark:from-[#3b1219] dark:to-transparent",
    icon: "text-red-700",
    tile: "bg-red-700",
    toggle: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  },
  waiting: {
    accent: "border-brand-800 text-brand-800",
    border: "border-brand-300",
    header: "bg-linear-to-r from-brand-50 to-white dark:from-[#0f3a37] dark:to-transparent",
    icon: "text-brand-700",
    tile: "bg-brand-800",
    toggle: "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100",
  },
});

function bookingKind(booking, today) {
  if (!isUpcomingBooking(booking, today)) {
    return "past";
  }

  return booking.status === "pending" ? "waiting" : "approved";
}

const GUEST_PILLS = Object.freeze({
  arrived: { dot: "bg-emerald-600", label: "Checked in", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  checked_out: { dot: "bg-slate-400", label: "Checked out", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  did_not_arrive: { dot: "bg-slate-400", label: "Did not arrive", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
  expected: { dot: "bg-slate-500", label: "Expected", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  not_expected: { dot: "bg-slate-400", label: "Not expected", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
  // At the desk but not yet admitted: still "Expected" to the booker
  // until reception checks the guest in.
  waiting: { dot: "bg-slate-500", label: "Expected", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
});

export function GuestPill({ status }) {
  const config = GUEST_PILLS[status] || GUEST_PILLS.expected;

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${config.tone}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function initialsOf(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function GuestAvatar({ name }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[0.6875rem] font-black text-brand-800"
    >
      {initialsOf(name)}
    </span>
  );
}

function NotGiven() {
  return <span className="italic text-slate-500">Not given</span>;
}

// What the booker needs to know now, in one line under the header.
function StatusBanner({ booking, today }) {
  const multiDay = isMultiDayBooking(booking);
  const over = lastBookingDay(booking) < today;
  let tone = "border-slate-200 bg-slate-50 text-slate-700";
  let message;

  if (booking.status === "pending") {
    tone = "border-amber-200 bg-amber-50 text-amber-900";
    message = booking.canEditGuests
      ? "Reception has not reviewed this yet. You can still change guests."
      : "Reception has not reviewed this yet.";
  } else if (booking.status === "approved" && over) {
    return null;
  } else if (booking.status === "approved") {
    tone = "border-emerald-200 bg-emerald-50 text-emerald-900";
    message = multiDay
      ? `Approved. ${LATER_DAYS_NOTE}`
      : "Approved. Reception will check guests in on the day.";

    if (!booking.canEditGuests && booking.canCancel) {
      message += " The guest list can no longer be changed.";
    }
  } else if (booking.status === "rejected") {
    tone = "border-red-200 bg-red-50 text-red-900";
    message = booking.decisionReason
      ? `Not approved. Reason: ${booking.decisionReason}`
      : "Not approved by reception.";
  } else if (booking.status === "cancelled") {
    message = "You cancelled this booking.";
  } else {
    message = "Reception did not answer before the meeting started, so the request expired.";
  }

  return (
    <p className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${tone}`}>
      {message}
    </p>
  );
}

export function GuestTable({ guests, offset }) {
  return (
    <>
      {/* Phones: one block per guest. */}
      <ul className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70 md:hidden">
        {guests.map((guest, index) => (
          <li className="flex gap-3 px-4 py-3.5" key={guest.guestId || index}>
            <GuestAvatar name={guest.fullName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-950">{guest.fullName}</p>
                <GuestPill status={guest.status} />
              </div>
              <p className="mt-1 text-sm text-slate-700">{guest.phone}</p>
              <p className="break-all text-sm text-slate-600">
                {guest.email || <NotGiven />}
              </p>
              {guest.organization ? (
                <p className="text-sm text-slate-600">{guest.organization}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet and up: a table. */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/70 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[0.6875rem] font-black uppercase tracking-widest text-slate-600">
            <tr>
              <th className="w-10 px-4 py-3" scope="col">#</th>
              <th className="px-3 py-3" scope="col">Guest</th>
              <th className="px-3 py-3" scope="col">Mobile</th>
              <th className="px-3 py-3" scope="col">Email</th>
              <th className="px-3 py-3" scope="col">Organisation</th>
              <th className="px-4 py-3 text-right" scope="col">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {guests.map((guest, index) => (
              <tr key={guest.guestId || index}>
                <td className="px-4 py-3 text-slate-500">{offset + index + 1}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2.5">
                    <GuestAvatar name={guest.fullName} />
                    <span className="font-bold text-slate-950">{guest.fullName}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{guest.phone}</td>
                <td className="break-all px-3 py-3 text-slate-700">
                  {guest.email || <NotGiven />}
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {guest.organization || <NotGiven />}
                </td>
                <td className="px-4 py-3 text-right">
                  <GuestPill status={guest.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GuestSection({ booking }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // Guests of a rejected, cancelled or expired booking are not coming,
  // whatever the server's per-guest status says.
  const closed = !["pending", "approved"].includes(booking.status);
  const guests = useMemo(
    () =>
      (booking.guests || []).map((guest) =>
        closed && ["expected", "waiting"].includes(guest.status)
          ? { ...guest, status: "not_expected" }
          : guest,
      ),
    [booking.guests, closed],
  );
  const searchable = guests.length > GUESTS_PER_PAGE;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return needle
      ? guests.filter((guest) =>
          [guest.fullName, guest.phone, guest.organization, guest.email].some(
            (value) => String(value || "").toLowerCase().includes(needle),
          ),
        )
      : guests;
  }, [guests, query]);

  const totalPages = Math.max(1, Math.ceil(matches.length / GUESTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * GUESTS_PER_PAGE;
  const progress = describeGuestProgress(guests);

  return (
    <section aria-label={`Guests for ${booking.title}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm text-slate-600">
          <span className="font-black text-slate-950">Guests ({guests.length})</span>
          {progress ? <span className="ml-2">{progress}</span> : null}
        </h3>
        {searchable ? (
          <div className="relative w-full sm:w-64">
            <label className="sr-only" htmlFor={searchId}>
              Find a guest
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              className="min-h-11 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-base text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 sm:text-sm"
              id={searchId}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Find a guest"
              type="search"
              value={query}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        {guests.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-600">
            No guests listed.
          </p>
        ) : matches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-600">
            No guest matches “{query.trim()}”.
          </p>
        ) : (
          <GuestTable
            guests={matches.slice(offset, offset + GUESTS_PER_PAGE)}
            offset={offset}
          />
        )}
      </div>

      {matches.length > GUESTS_PER_PAGE ? (
        <div className="mt-4">
          <PillPager
            label={`Guest pages for ${booking.title}`}
            noun="guests"
            nounSingular="guest"
            onPage={setPage}
            page={currentPage}
            pageSize={GUESTS_PER_PAGE}
            total={matches.length}
          />
        </div>
      ) : null}
    </section>
  );
}

// "Showing 1–6 of 14 guests" with Prev, page numbers and Next.
export function PillPager({ label, noun, nounSingular, onPage, page, pageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const step =
    "inline-flex min-h-11 items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white";

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p aria-live="polite" className="text-sm text-slate-600">
        {totalPages > 1
          ? `Showing ${first}–${last} of ${total} ${noun}`
          : `Showing ${total} of ${total} ${total === 1 ? nounSingular : noun}`}
      </p>
      {totalPages > 1 ? (
        <nav aria-label={label} className="flex items-center gap-1.5">
          <button className={step} disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">
            <ChevronLeft aria-hidden="true" className="size-4" />
            Prev<span className="sr-only">ious page</span>
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
            <button
              aria-current={item === page ? "page" : undefined}
              aria-label={`Page ${item}`}
              className={`grid size-11 place-items-center rounded-full border text-sm font-black transition focus-visible:ring-4 focus-visible:ring-brand-200 ${Math.abs(item - page) > 1 && item !== 1 && item !== totalPages ? "max-sm:hidden" : ""} ${item === page ? "border-brand-800 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}
              key={item}
              onClick={() => onPage(item)}
              type="button"
            >
              {item}
            </button>
          ))}
          <button className={step} disabled={page >= totalPages} onClick={() => onPage(page + 1)} type="button">
            Next<span className="sr-only"> page</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </nav>
      ) : null}
    </div>
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
      className={`grid w-14 shrink-0 place-items-center rounded-2xl py-2 text-white sm:w-16 ${tone}`}
    >
      <span className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">
        {tileMonth.format(date)}
      </span>
      <span className="text-2xl font-black leading-none sm:text-[1.75rem]">
        {date.getUTCDate()}
      </span>
      <span className="text-[0.6875rem] font-bold">{tileWeekday.format(date)}</span>
    </span>
  );
}

const WIFI_CHOICES = Object.freeze([
  Object.freeze({ label: "Not needed", value: "no" }),
  Object.freeze({ label: "Guests need Wi-Fi", value: "yes" }),
]);

const WIFI_PROGRESS = Object.freeze({
  given: "The IT team has given access.",
  not_given: "The IT team could not give access. Contact IT for details.",
  waiting: "The IT team will send the details to your guests.",
});

// The booker can turn Wi-Fi for the guests on or off until the
// meeting's last day ends.
function WifiSetting({ booking, busy, onChange }) {
  const name = useId();
  const value = booking.wifiRequested ? "yes" : "no";
  const progress = booking.wifiRequested
    ? WIFI_PROGRESS[booking.wifiStatus]
    : "";

  if (!booking.canCancel) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-700">
        <Wifi aria-hidden="true" className="size-4 text-slate-500" />
        Wi-Fi for guests:{" "}
        <span className="font-bold text-slate-950">
          {booking.wifiRequested ? "Requested" : "Not needed"}
        </span>
      </p>
    );
  }

  return (
    <div className="max-w-md">
      <SegmentedChoice
        description={progress || undefined}
        disabled={busy}
        inline
        legend="Wi-Fi for guests"
        name={name}
        onChange={(next) => {
          if (next !== value) {
            onChange(booking, next);
          }
        }}
        options={WIFI_CHOICES}
        value={value}
      />
    </div>
  );
}

export default function MyBookingCard({
  booking,
  expanded,
  onCancel,
  onChangeWifi,
  onEditGuests,
  onToggle,
  today,
  wifiSaving = false,
}) {
  const panelId = useId();
  const kind = bookingKind(booking, today);
  const theme = CARD_THEMES[kind];
  const completed = kind === "past" && booking.status === "approved";
  const day = nextBookingDay(booking, today);
  const multiDay = isMultiDayBooking(booking);
  const guestCount = booking.guests?.length || 0;
  const host = [booking.hostDivision, shortAgencyName(booking.hostAgency)]
    .filter(Boolean)
    .join(", ");
  const canEditGuests = Boolean(booking.canEditGuests);
  const canCancel = Boolean(booking.canCancel);

  return (
    <article
      aria-labelledby={`${panelId}-title`}
      className={`overflow-hidden rounded-3xl border bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] ${expanded ? theme.border : "border-slate-200/70"}`}
    >
      <div className={`flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5 ${theme.header}`}>
        <DateTile isoDate={day} tone={theme.tile} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-wide text-slate-600">
              {booking.referenceCode}
            </span>
            {completed ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                Completed
              </span>
            ) : (
              <BookingStatusChip status={booking.status} />
            )}
          </div>
          <h2 className="mt-1.5 text-pretty text-base font-black leading-snug text-slate-950 sm:text-lg" id={`${panelId}-title`}>
            {booking.title}
          </h2>
          <p className="sr-only">{day ? fullDate.format(toDate(day)) : ""}</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
            {formatTimeRange(booking) ? (
              <li className="inline-flex items-center gap-1.5">
                <Clock aria-hidden="true" className={`size-4 ${theme.icon}`} />
                {formatTimeRange(booking)}
              </li>
            ) : null}
            {multiDay ? (
              <li className="inline-flex items-center gap-1.5">
                <Repeat aria-hidden="true" className={`size-4 ${theme.icon}`} />
                {formatSchedule(booking)}
              </li>
            ) : null}
            {booking.venue ? (
              <li className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className={`size-4 ${theme.icon}`} />
                {booking.venue}
              </li>
            ) : null}
            {host ? (
              <li className="inline-flex items-center gap-1.5">
                <Building2 aria-hidden="true" className={`size-4 ${theme.icon}`} />
                {host}
              </li>
            ) : null}
            {booking.floor ? (
              <li className="inline-flex items-center gap-1.5">
                <Layers aria-hidden="true" className={`size-4 ${theme.icon}`} />
                {getFloorLabel(booking.floor, booking.tower)}
              </li>
            ) : null}
          </ul>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className={`hidden min-w-18 rounded-2xl border-2 bg-white px-3 py-1.5 text-center sm:block ${theme.accent}`}>
            <span className="block text-[0.625rem] font-black uppercase tracking-[0.12em]">
              Guests
            </span>
            <span className="block text-2xl font-black leading-tight">
              {guestCount}
            </span>
          </span>
          <button
            aria-controls={panelId}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${booking.title}`}
            className={`grid size-11 place-items-center rounded-full border transition focus-visible:ring-4 focus-visible:ring-brand-200 ${theme.toggle}`}
            onClick={onToggle}
            type="button"
          >
            <ChevronDown aria-hidden="true" className={`size-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 border-t border-slate-200/70 px-5 pb-5 pt-4 sm:pb-6 sm:pl-25 sm:pr-6" hidden={!expanded} id={panelId}>
        <p className="text-sm font-bold text-slate-800 sm:hidden">
          {guestCount} {guestCount === 1 ? "guest" : "guests"} listed
        </p>
        <StatusBanner booking={booking} today={today} />
        {expanded ? <GuestSection booking={booking} /> : null}

        {onChangeWifi ? (
          <WifiSetting
            booking={booking}
            busy={wifiSaving}
            onChange={onChangeWifi}
          />
        ) : null}

        {canEditGuests || canCancel ? (
          <div className="flex flex-wrap gap-2">
            {canEditGuests ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-800 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200"
                onClick={() => onEditGuests(booking)}
                type="button"
              >
                <UserPen aria-hidden="true" className="size-4" />
                Edit guests
              </button>
            ) : null}
            {canCancel ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-300 bg-white px-5 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-200"
                onClick={() => onCancel(booking)}
                type="button"
              >
                <Ban aria-hidden="true" className="size-4" />
                Cancel booking
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
