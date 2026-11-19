import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock,
  CalendarCheck,
  Crown,
  LogOut,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { getTowerLabel } from "../constants/visitorOptions.js";

// Shared by the reception dashboard and the visitor-cards workspace so the
// two checked-in views cannot drift apart. Each page maps its own records
// to the row shape documented on `CheckedInVisitorsTable`.

const timeFormatter = new Intl.DateTimeFormat("en-GH", {
  timeStyle: "short",
  timeZone: "Africa/Accra",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Accra",
  year: "numeric",
});

const COLUMNS = [
  "Reference",
  "Visitor",
  "Contact details",
  "Purpose",
  "Card",
  "Destination",
  "Checked in",
  "Status",
  "Action",
];

function formatWith(formatter, value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : formatter.format(date);
}

// "Ministry of Finance (MoF)" -> "MoF"; agencies without an abbreviation
// are shown in full.
function getAgencyShortName(agency = "") {
  return agency.match(/\(([^)]+)\)\s*$/)?.[1] || agency;
}

function getInitials(fullName = "") {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "V"
  );
}

export function VisitorTypeIcon({ type }) {
  const vip = type === "vip";
  const label = vip ? "VIP guest" : "Regular visitor";
  const Icon = vip ? Crown : User;

  return (
    <span
      aria-label={label}
      className={`inline-grid size-7 shrink-0 place-items-center rounded-full ring-1 ${
        vip
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-brand-50 text-brand-700 ring-brand-200"
      }`}
      role="img"
      title={label}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

export function PurposePill({ purpose }) {
  if (!purpose) {
    return (
      <span className="text-sm text-slate-400">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No purpose given</span>
      </span>
    );
  }

  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
      {purpose}
    </span>
  );
}

export function TowerPill({ tower }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-800 ring-1 ring-brand-600">
      <MapPin aria-hidden="true" className="size-3.5" />
      {getTowerLabel(tower)}
    </span>
  );
}

export function ContactDetails({ email, organization, phone }) {
  if (!organization && !phone && !email) {
    return (
      <span className="text-sm text-slate-400">
        No contact details
      </span>
    );
  }

  return (
    <div className="grid justify-items-center gap-0.5 text-sm">
      {organization ? (
        <p className="font-bold text-slate-950">{organization}</p>
      ) : null}

      {phone ? (
        <p className="inline-flex items-center gap-1.5 text-slate-700">
          <Phone aria-hidden="true" className="size-3.5 text-slate-500" />
          {phone}
        </p>
      ) : null}

      {email ? (
        <p className="inline-flex min-w-0 items-center gap-1.5 text-slate-700 [overflow-wrap:anywhere]">
          <Mail aria-hidden="true" className="size-3.5 shrink-0 text-slate-500" />
          <span>
            {email.split("@")[0]}
            {email.includes("@") ? (
              <>
                <wbr />@{email.slice(email.indexOf("@") + 1)}
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function Destination({ agency, detail }) {
  return (
    <div className="grid justify-items-center gap-1">
      <p className="font-bold text-slate-950" title={agency}>
        {getAgencyShortName(agency) || "Not provided"}
      </p>

      {detail ? (
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

// VIP cards (MOF-VIP025, MOF-VIP025-R1) are burgundy so reception can
// spot them at a glance; regular cards stay teal.
const VIP_CARD_PATTERN = /^MOF-VIP/i;

function CardNumberPill({ cardNumber }) {
  const vip = VIP_CARD_PATTERN.test(cardNumber);

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ring-1 ${
        vip
          ? "bg-[#fbeef2] text-[#7a1f3d] ring-[#e8b4c4] dark:bg-[#3a1220]! dark:text-[#f4a8c0]! dark:ring-[#6b2a40]!"
          : "text-brand-800 ring-brand-300"
      }`}
      title={vip ? "VIP visitor card" : undefined}
    >
      {cardNumber}
      {vip ? <span className="sr-only"> (VIP card)</span> : null}
    </span>
  );
}

function CardCell({ cardNumber, tower }) {
  return (
    <div className="grid justify-items-center gap-1.5">
      {cardNumber ? (
        <CardNumberPill cardNumber={cardNumber} />
      ) : (
        <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-300">
          Not assigned
        </span>
      )}
      <TowerPill tower={tower} />
    </div>
  );
}

const CARD_STATUSES = {
  assigned: {
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    icon: CircleCheck,
    label: "Card assigned",
  },
  awaiting: {
    className: "bg-amber-50 text-amber-800 ring-amber-300",
    icon: Clock,
    label: "Awaiting card",
  },
  not_returned: {
    className: "bg-red-50 text-red-700 ring-red-200",
    icon: CircleAlert,
    label: "Not returned",
  },
};

function getCardState(row) {
  if (row.cardStatus === "not_returned") {
    return "not_returned";
  }

  return row.cardNumber ? "assigned" : "awaiting";
}

function CardStatusPill({ row }) {
  const status = CARD_STATUSES[getCardState(row)];
  const Icon = status.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${status.className}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {status.label}
    </span>
  );
}

export function TimeStack({ value }) {
  return (
    <div className="whitespace-nowrap">
      <p className="font-bold text-slate-950">
        {formatWith(timeFormatter, value)}
      </p>
      <p className="text-xs text-slate-500">
        {formatWith(dateFormatter, value)}
      </p>
    </div>
  );
}

function CheckoutButton({ fullWidth = false, onCheckout, row }) {
  const blocked = row.canCheckout === false;
  const label = blocked
    ? row.checkoutBlockedReason ||
      `${row.fullName} cannot be checked out yet`
    : `Check out ${row.fullName}`;

  return (
    <TableActionButton
      aria-label={label}
      disabled={blocked}
      fullWidth={fullWidth}
      icon={LogOut}
      onClick={() => onCheckout(row.source)}
      title={label}
    >
      Check out
    </TableActionButton>
  );
}

// The row's main action: a filled pill with a round arrow chip.
export function TableActionButton({
  children,
  fullWidth = false,
  icon: Icon,
  ...props
}) {
  return (
    <button
      className={`group inline-flex min-h-11 items-center justify-between gap-3 whitespace-nowrap rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] py-1.5 pl-5 pr-1.5 text-sm font-bold text-[#ffffff] shadow-md shadow-[#115e59]/25 transition-shadow hover:shadow-lg hover:shadow-[#115e59]/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none ${
        fullWidth ? "w-full" : ""
      }`}
      type="button"
      {...props}
    >
      <span className="inline-flex items-center gap-2">
        {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
        {children}
      </span>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-full bg-[#ffffff]/15 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-disabled:translate-x-0 group-disabled:translate-y-0 group-disabled:bg-slate-300/40"
      >
        <ArrowUpRight className="size-4" />
      </span>
    </button>
  );
}

// Column headings shared by the visitor tables.
export function TableHead({ columns }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
      <tr>
        {columns.map((label) => (
          <th className="whitespace-nowrap px-4 py-4 font-bold" key={label} scope="col">
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// Marks a guest who was pre-registered through a meeting booking, so
// reception knows their details are already on file.
export function BookedGuestBadge({ booked }) {
  if (!booked) {
    return null;
  }

  return (
    <span
      aria-label="Booked meeting guest"
      className="inline-grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-800 ring-1 ring-brand-300"
      role="img"
      title="Booked meeting guest"
    >
      <CalendarCheck aria-hidden="true" className="size-3.5" />
    </span>
  );
}

// A visitor who booked ahead with a visitor link: a small clock pill
// set low beside the name, like a subscript.
export function BookedVisitBadge({ booked }) {
  if (!booked) {
    return null;
  }

  return (
    <span
      aria-label="Booked visit"
      className="inline-flex h-5 shrink-0 translate-y-1.5 items-center rounded-full bg-brand-50 px-1.5 text-brand-800 ring-1 ring-brand-300 dark:bg-[#0b2b29] dark:text-[#5eead4] dark:ring-[#14756d]"
      role="img"
      title="Booked visit"
    >
      <Clock aria-hidden="true" className="size-3" strokeWidth={2.5} />
    </span>
  );
}

export function VisitorName({ row }) {
  return (
    <span className="inline-flex items-center gap-2">
      <VisitorTypeIcon type={row.visitorType} />
      <span className="inline-flex items-center gap-1">
        <span className="font-bold text-slate-950">{row.fullName}</span>
        <BookedVisitBadge booked={row.bookedVisit} />
      </span>
      <BookedGuestBadge booked={row.bookedGuest} />
    </span>
  );
}

export function ReferencePill({ reference }) {
  return (
    <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 font-mono text-xs font-bold text-brand-800 ring-1 ring-brand-200">
      {reference}
    </span>
  );
}

function CheckedInCard({ onCheckout, row }) {
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800"
        >
          {getInitials(row.fullName)}
        </span>

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
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-slate-500">Destination</dt>
          <dd className="mt-0.5 font-semibold text-slate-950">
            {getAgencyShortName(row.destinationAgency) || "Not provided"}
          </dd>
          {row.destinationDetail ? (
            <dd className="text-xs text-slate-600">
              {row.destinationDetail}
            </dd>
          ) : null}
        </div>

        <div>
          <dt className="text-xs font-semibold text-slate-500">Checked in</dt>
          <dd className="mt-0.5">
            <TimeStack value={row.checkedInAt} />
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-xs font-semibold text-slate-500">Card</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {row.cardNumber ? (
              <CardNumberPill cardNumber={row.cardNumber} />
            ) : null}
            <TowerPill tower={row.tower} />
          </dd>
        </div>

        <div>
          <dt className="text-xs font-semibold text-slate-500">Purpose</dt>
          <dd className="mt-1">
            <PurposePill purpose={row.purpose} />
          </dd>
        </div>

        {row.phone || row.email ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-xs font-semibold text-slate-500">Contact</dt>
            {[row.phone, row.email].filter(Boolean).map((value) => (
              <dd className="mt-0.5 break-all text-slate-950" key={value}>
                {value}
              </dd>
            ))}
          </div>
        ) : null}
      </dl>

      <div className="mb-4 mt-4">
        <CardStatusPill row={row} />
      </div>

      <div className="mt-auto">
        <CheckoutButton fullWidth onCheckout={onCheckout} row={row} />
      </div>
    </article>
  );
}

/**
 * rows: {
 *   id, reference, fullName, visitorType ("vip" | "regular" | null),
 *   organization, phone, email, purpose,
 *   cardNumber, cardStatus ("assigned" | "not_returned" | null), tower,
 *   destinationAgency, destinationDetail (division or person visiting),
 *   checkedInAt, canCheckout, checkoutBlockedReason,
 *   source (the page's own record, handed back to onCheckout)
 * }[]
 */
export default function CheckedInVisitorsTable({ onCheckout, rows }) {
  return (
    <>
      <div className="grid gap-4 p-4 md:grid-cols-2 lg:hidden">
        {rows.map((row) => (
          <CheckedInCard key={row.id} onCheckout={onCheckout} row={row} />
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-300 border-collapse text-center">
          <TableHead columns={COLUMNS} />

          <tbody className="divide-y divide-slate-200 bg-white text-sm">
            {rows.map((row) => (
              <tr
                className="align-middle transition-colors hover:bg-slate-50"
                key={row.id}
              >
                <td className="whitespace-nowrap px-4 py-5">
                  <ReferencePill reference={row.reference} />
                </td>
                <td className="whitespace-nowrap px-4 py-5">
                  <VisitorName row={row} />
                </td>
                <td className="min-w-60 px-4 py-5">
                  <ContactDetails
                    email={row.email}
                    organization={row.organization}
                    phone={row.phone}
                  />
                </td>
                <td className="px-4 py-5">
                  <PurposePill purpose={row.purpose} />
                </td>
                <td className="px-4 py-5">
                  <CardCell cardNumber={row.cardNumber} tower={row.tower} />
                </td>
                <td className="min-w-40 px-4 py-5">
                  <Destination
                    agency={row.destinationAgency}
                    detail={row.destinationDetail}
                  />
                </td>
                <td className="px-4 py-5">
                  <TimeStack value={row.checkedInAt} />
                </td>
                <td className="px-4 py-5">
                  <CardStatusPill row={row} />
                </td>
                <td className="px-4 py-5">
                  <CheckoutButton onCheckout={onCheckout} row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Initials avatar used by the mobile visitor cards.
export function InitialsAvatar({ fullName }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800"
    >
      {getInitials(fullName)}
    </span>
  );
}
