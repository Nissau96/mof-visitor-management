import {
  Ban,
  CalendarClock,
  CircleCheck,
  CircleX,
  Clock,
  MapPin,
  Building2,
  UsersRound,
} from "lucide-react";
import { getTowerLabel } from "../constants/visitorOptions.js";
import {
  formatBookingSchedule,
  formatDate,
  isMultiDayBooking,
} from "../lib/meetingSchedule.js";

// Shared by the booker's "My bookings" page and reception's booking
// requests, so a booking reads the same on both sides.

const BOOKING_STATUSES = Object.freeze({
  approved: { icon: CircleCheck, label: "Approved", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  cancelled: { icon: Ban, label: "Cancelled", tone: "bg-slate-100 text-slate-700 ring-slate-300" },
  expired: { icon: Clock, label: "Expired", tone: "bg-slate-100 text-slate-700 ring-slate-300" },
  pending: { icon: Clock, label: "Waiting for approval", tone: "bg-amber-50 text-amber-800 ring-amber-300" },
  rejected: { icon: CircleX, label: "Not approved", tone: "bg-red-50 text-red-700 ring-red-200" },
});

export function BookingStatusChip({ status }) {
  const config = BOOKING_STATUSES[status] || BOOKING_STATUSES.pending;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${config.tone}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {config.label}
    </span>
  );
}

const GUEST_STATUSES = Object.freeze({
  arrived: { label: "Arrived", tone: "text-emerald-700" },
  checked_out: { label: "Checked out", tone: "text-slate-600" },
  did_not_arrive: { label: "Did not arrive", tone: "text-slate-500" },
  expected: { label: "Expected", tone: "text-slate-600" },
  waiting: { label: "Expected today", tone: "text-amber-800" },
});

export function GuestStatus({ status }) {
  const config = GUEST_STATUSES[status] || GUEST_STATUSES.expected;

  return (
    <span className={`text-xs font-bold ${config.tone}`}>{config.label}</span>
  );
}

function formatBookingHost(booking) {
  return booking.hostDivision
    ? `${booking.hostDivision}, ${booking.hostAgency}`
    : booking.hostAgency;
}

export function BookingFacts({ booking, showTower = false }) {
  return (
    <ul className="grid gap-1.5 text-sm text-slate-700">
      <li className="flex items-start gap-2">
        <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span>{formatBookingSchedule(booking)}</span>
      </li>
      {isMultiDayBooking(booking) ? (
        <li className="flex items-start gap-2">
          <UsersRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span>
            Guests expected:{" "}
            {formatDate(booking.meetingDate, { weekday: true })}
          </span>
        </li>
      ) : null}
      <li className="flex items-start gap-2">
        <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span>
          {formatBookingHost(booking)}
          {showTower ? ` · ${getTowerLabel(booking.tower)}` : ""}
        </span>
      </li>
      {booking.venue ? (
        <li className="flex items-start gap-2">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span>{booking.venue}</span>
        </li>
      ) : null}
    </ul>
  );
}

export function GuestList({ guests }) {
  if (!guests.length) {
    return (
      <p className="text-sm text-slate-600">No guests listed.</p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
      {guests.map((guest) => (
        <li
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
          key={guest.guestId}
        >
          <span className="min-w-0">
            <span className="block font-bold text-slate-950">{guest.fullName}</span>
            <span className="block text-slate-600">
              {[guest.phone, guest.organization].filter(Boolean).join(" · ")}
            </span>
          </span>
          <GuestStatus status={guest.status} />
        </li>
      ))}
    </ul>
  );
}
