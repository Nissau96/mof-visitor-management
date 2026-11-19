import { Clock, CreditCard, UsersRound } from "lucide-react";
import {
  ContactDetails,
  Destination,
  InitialsAvatar,
  PurposePill,
  ReferencePill,
  TableActionButton,
  TableHead,
  TimeStack,
  TowerPill,
  VisitorName,
} from "./CheckedInVisitorsTable.jsx";
import { toVisitorRow } from "../lib/cardVisitorRow.js";

// Shared by the reception dashboard and the visitor-cards workspace, so
// the two pending-admission views look and behave the same.

const COLUMNS = [
  "Reference",
  "Visitor",
  "Contact details",
  "Purpose",
  "Destination",
  "Tower",
  "Submitted",
  "Status",
  "Action",
];

export function StatusPill({ children, icon: Icon, tone }) {
  const tones = {
    amber: "bg-amber-50 text-amber-800 ring-amber-300",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${tones[tone]}`}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-3.5" />
      ) : (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  );
}

export function MobileCardHeader({ row }) {
  return (
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

      {row.reference ? <ReferencePill reference={row.reference} /> : null}
    </div>
  );
}

export function MobileDetail({ children, label, wide = false }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-950">{children}</dd>
    </div>
  );
}

// Guests registered with a group show who brought them, so reception
// can admit the group together.
export function GuestOfNote({ className = "", leadName }) {
  if (!leadName) {
    return null;
  }

  return (
    <p
      className={`flex items-center gap-1.5 text-xs font-semibold text-slate-600 ${className}`}
    >
      <UsersRound aria-hidden="true" className="size-3.5 shrink-0" />
      Guest of {leadName}
    </p>
  );
}

function AssignButton({ fullWidth = false, onAssign, record }) {
  return (
    <TableActionButton
      aria-label={`Assign card to ${record.fullName}`}
      fullWidth={fullWidth}
      icon={CreditCard}
      onClick={() => onAssign(record)}
    >
      Assign card
    </TableActionButton>
  );
}

function PendingStatus() {
  return (
    <StatusPill icon={Clock} tone="amber">
      Pending admission
    </StatusPill>
  );
}

function destinationDetail(record) {
  return record.destinationDivision || record.personVisiting;
}

/**
 * records: pending admissions from /api/staff/cards/pending.
 * onAssign(record) opens the assign-card dialog for that visitor.
 */
export default function PendingAdmissionsTable({ onAssign, records }) {
  return (
    <>
      <div className="grid gap-4 p-4 md:grid-cols-2 lg:hidden">
        {records.map((record) => {
          const row = toVisitorRow(record);

          return (
            <article
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              key={record.visitId}
            >
              <MobileCardHeader row={row} />

              <GuestOfNote className="mt-3" leadName={record.groupLeadName} />

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <MobileDetail label="Destination">
                  <Destination
                    agency={record.destinationAgency}
                    detail={destinationDetail(record)}
                  />
                </MobileDetail>
                <MobileDetail label="Submitted">
                  <TimeStack value={record.submittedAt} />
                </MobileDetail>
                <MobileDetail label="Tower">
                  <TowerPill tower={record.tower} />
                </MobileDetail>
                <MobileDetail label="Purpose">
                  <PurposePill purpose={row.purpose} />
                </MobileDetail>
              </dl>

              <div className="mb-4 mt-4">
                <PendingStatus />
              </div>

              <div className="mt-auto">
                <AssignButton fullWidth onAssign={onAssign} record={record} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-300 border-collapse text-center">
          <TableHead columns={COLUMNS} />

          <tbody className="divide-y divide-slate-200 bg-white text-sm">
            {records.map((record) => {
              const row = toVisitorRow(record);

              return (
                <tr
                  className="align-middle transition-colors hover:bg-slate-50"
                  key={record.visitId}
                >
                  <td className="whitespace-nowrap px-4 py-5">
                    <ReferencePill reference={row.reference} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-5">
                    <VisitorName row={row} />
                    <GuestOfNote
                      className="mt-1 justify-center"
                      leadName={record.groupLeadName}
                    />
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
                  <td className="min-w-40 px-4 py-5">
                    <Destination
                      agency={record.destinationAgency}
                      detail={destinationDetail(record)}
                    />
                  </td>
                  <td className="px-4 py-5">
                    <TowerPill tower={record.tower} />
                  </td>
                  <td className="px-4 py-5">
                    <TimeStack value={record.submittedAt} />
                  </td>
                  <td className="px-4 py-5">
                    <PendingStatus />
                  </td>
                  <td className="px-4 py-5">
                    <AssignButton onAssign={onAssign} record={record} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
