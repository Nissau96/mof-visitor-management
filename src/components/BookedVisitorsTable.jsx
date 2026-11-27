import { Ban, CalendarClock, CircleCheck, Clock, CreditCard, UserX } from "lucide-react";
import { Fragment } from "react";
import {
  InitialsAvatar,
  PurposePill,
  ReferencePill,
  TableActionButton,
  TableHead,
  TowerPill,
  VisitorName,
} from "./CheckedInVisitorsTable.jsx";
import { MobileDetail, StatusPill } from "./PendingAdmissionsTable.jsx";
import { getFloorLabel } from "../constants/visitorOptions.js";
import { formatDate } from "../lib/meetingSchedule.js";

// Visitors who booked with a visitor link, on the reception dashboard.

const COLUMNS = ["Reference", "Visitor", "Visiting", "Purpose", "Tower", "Date", "Status", "Action"];

const STATUSES = Object.freeze({
  arrived: { icon: CircleCheck, label: "Arrived", tone: "green" },
  cancelled: { icon: Ban, label: "Cancelled", tone: "slate" },
  not_arrived: { icon: UserX, label: "Did not arrive", tone: "red" },
  upcoming: { icon: CalendarClock, label: "Expected", tone: "teal" },
  waiting: { icon: Clock, label: "Waiting at reception", tone: "amber" },
});

function BookingStatus({ status }) {
  const shown = STATUSES[status] || STATUSES.upcoming;

  return (
    <StatusPill icon={shown.icon} tone={shown.tone}>
      {shown.label}
    </StatusPill>
  );
}

function toRow(booking) {
  return {
    bookedVisit: true,
    fullName: booking.visitorName,
    organization: booking.organization || "",
    purpose: booking.purpose || "",
    reference: booking.referenceCode,
  };
}

function hostDetail(booking) {
  return [booking.division || booking.agency, getFloorLabel(booking.floor || "", booking.tower)]
    .filter(Boolean)
    .join(" · ");
}

function HostDetail({ booking }) {
  const detail = hostDetail(booking);

  return (
    <div className="grid justify-items-center gap-1 max-lg:justify-items-start">
      <p className="font-bold text-slate-950">{booking.hostName}</p>
      {detail ? (
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

function AssignButton({ booking, fullWidth = false, onAssign }) {
  if (booking.status !== "waiting") {
    return <span className="text-sm text-slate-500">No action</span>;
  }

  return (
    <TableActionButton
      aria-label={`Assign card to ${booking.visitorName}`}
      fullWidth={fullWidth}
      icon={CreditCard}
      onClick={() => onAssign(booking)}
    >
      Assign card
    </TableActionButton>
  );
}

// Upcoming bookings are grouped by date; today's are one group.
function groupByDate(bookings) {
  const groups = new Map();

  for (const booking of bookings) {
    const list = groups.get(booking.visitDate) || [];
    list.push(booking);
    groups.set(booking.visitDate, list);
  }

  return [...groups.entries()];
}

/**
 * bookings: from /api/staff/bookings/visitors.
 * onAssign(booking) admits a visitor who is waiting at reception.
 */
export default function BookedVisitorsTable({ bookings, grouped = false, onAssign }) {
  const groups = grouped ? groupByDate(bookings) : [["", bookings]];

  return (
    <>
      <div className="grid gap-5 p-4 lg:hidden">
        {groups.map(([date, items]) => (
          <section aria-label={date ? formatDate(date, { weekday: true }) : undefined} className="grid gap-3" key={date || "today"}>
            {date ? (
              <h3 className="text-sm font-black text-slate-700">{formatDate(date, { weekday: true })}</h3>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {items.map((booking) => {
                const row = toRow(booking);

                return (
                  <article
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    key={booking.id}
                  >
                    <div className="flex items-start gap-3">
                      <InitialsAvatar fullName={row.fullName} />
                      <div className="min-w-0 flex-1">
                        <h3 className="wrap-break-word">
                          <VisitorName row={row} />
                        </h3>
                        {row.organization ? (
                          <p className="text-sm text-slate-600">{row.organization}</p>
                        ) : null}
                      </div>
                      <ReferencePill reference={row.reference} />
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <MobileDetail label="Visiting" wide>
                        <HostDetail booking={booking} />
                      </MobileDetail>
                      <MobileDetail label="Tower">
                        <TowerPill tower={booking.tower} />
                      </MobileDetail>
                      <MobileDetail label="Purpose">
                        <PurposePill purpose={row.purpose} />
                      </MobileDetail>
                    </dl>

                    <div className="mb-4 mt-4">
                      <BookingStatus status={booking.status} />
                    </div>

                    {booking.status === "waiting" ? (
                      <div className="mt-auto">
                        <AssignButton booking={booking} fullWidth onAssign={onAssign} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-300 border-collapse text-center">
          <TableHead columns={COLUMNS} />

          <tbody className="divide-y divide-slate-200 bg-white text-sm">
            {groups.map(([date, items]) => (
              <Fragment key={date || "today"}>
                {date ? (
                  <tr className="bg-slate-50">
                    <th
                      className="px-6 py-2.5 text-left text-xs font-black uppercase tracking-wider text-slate-600"
                      colSpan={COLUMNS.length}
                      scope="colgroup"
                    >
                      {formatDate(date, { weekday: true })}
                    </th>
                  </tr>
                ) : null}

                {items.map((booking) => {
                  const row = toRow(booking);

                  return (
                    <tr className="align-middle transition-colors hover:bg-slate-50" key={booking.id}>
                      <td className="whitespace-nowrap px-4 py-5">
                        <ReferencePill reference={row.reference} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-5">
                        <VisitorName row={row} />
                        {row.organization ? (
                          <p className="mt-1 text-xs text-slate-600">{row.organization}</p>
                        ) : null}
                      </td>
                      <td className="min-w-48 px-4 py-5">
                        <HostDetail booking={booking} />
                      </td>
                      <td className="px-4 py-5">
                        <PurposePill purpose={row.purpose} />
                      </td>
                      <td className="px-4 py-5">
                        <TowerPill tower={booking.tower} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-5 font-semibold text-slate-800">
                        {formatDate(booking.visitDate, { weekday: true })}
                      </td>
                      <td className="px-4 py-5">
                        <BookingStatus status={booking.status} />
                      </td>
                      <td className="px-4 py-5">
                        <AssignButton booking={booking} onAssign={onAssign} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
