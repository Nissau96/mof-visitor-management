import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  CreditCard,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AssignVisitorCardModal,
  CheckoutVisitorModal,
  IncidentManagementModal,
} from "../components/VisitorCardActions.jsx";
import AppSelect from "../components/AppSelect.jsx";
import CheckedInVisitorsTable, {
  ContactDetails,
  Destination,
  InitialsAvatar,
  PurposePill,
  ReferencePill,
  TimeStack,
  TowerPill,
  VisitorName,
} from "../components/CheckedInVisitorsTable.jsx";
import { getTowerLabel } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError, apiRequest } from "../lib/api.js";
import {
  getCheckedInCardVisitors,
  getPendingAdmissions,
  getVisitorCardIncidents,
} from "../lib/visitorCardApi.js";

const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;

const RECEPTION_TABS = Object.freeze([
  Object.freeze({
    id: "pending",
    label: "Pending admissions",
  }),
  Object.freeze({
    id: "checked-in",
    label: "Checked-in visitors",
  }),
  Object.freeze({
    id: "incidents",
    label: "Card incidents",
  }),
]);

const ADMIN_TABS = RECEPTION_TABS;

const INCIDENT_TABS = Object.freeze([
  Object.freeze({
    id: "incidents",
    label: "Card incidents",
  }),
]);

const TOWER_SEGMENTS = Object.freeze([
  { label: "All Towers", value: "" },
  { label: "Tower 1", value: "tower_1" },
  { label: "Tower 2", value: "tower_2" },
]);

const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  pageSize: PAGE_SIZE,
  totalCount: 0,
  totalPages: 0,
});

const EMPTY_SUMMARY = Object.freeze({
  awaitingCard: null,
  checkedIn: null,
  firstOpenCard: "",
  openIncidents: null,
  pending: null,
});

const dateTimeFormatter =
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  });

const overdueFormatter =
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: "Africa/Accra",
    year: "numeric",
  });

function formatWith(formatter, value) {
  const date = new Date(value || "");

  if (
    !value ||
    Number.isNaN(date.getTime())
  ) {
    return "Not available";
  }

  return formatter.format(date);
}

function formatStatus(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getDaysOverdue(value) {
  const time = new Date(value || "").getTime();

  if (Number.isNaN(time)) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - time) / DAY_MS),
  );
}

function normalizePagination(value) {
  return {
    page:
      Number.isInteger(value?.page) &&
      value.page > 0
        ? value.page
        : 1,
    pageSize:
      Number.isInteger(value?.pageSize) &&
      value.pageSize > 0
        ? value.pageSize
        : PAGE_SIZE,
    totalCount:
      Number.isInteger(value?.totalCount) &&
      value.totalCount >= 0
        ? value.totalCount
        : 0,
    totalPages:
      Number.isInteger(value?.totalPages) &&
      value.totalPages >= 0
        ? value.totalPages
        : 0,
  };
}

function getTotalCount(result) {
  return normalizePagination(
    result?.pagination,
  ).totalCount;
}

// Card records use their own field names; the shared table expects these.
function toVisitorRow(record) {
  return {
    email: record.email || "",
    fullName:
      record.fullName || "Unknown visitor",
    organization: record.organization || "",
    phone: record.phone || "",
    purpose: record.purpose || "",
    reference: record.referenceCode || "",
    visitorType: record.visitorType || null,
  };
}

function toCheckedInRow(record) {
  return {
    ...toVisitorRow(record),
    canCheckout: record.canCheckout === true,
    cardNumber: record.cardNumber || null,
    cardStatus:
      record.assignmentStatus || null,
    checkedInAt: record.checkedInAt,
    checkoutBlockedReason: `${record.cardNumber || "This card"} requires incident action`,
    destinationAgency:
      record.destinationAgency || "",
    destinationDetail:
      record.destinationDivision ||
      record.personVisiting ||
      "",
    id: record.visitId,
    source: record,
    tower: record.tower,
  };
}

const PILL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed";

const FILLED_BUTTON = `${PILL_BUTTON} bg-brand-800 text-white hover:bg-brand-900 disabled:bg-slate-200 disabled:text-slate-500`;

function StatusPill({
  children,
  icon: Icon,
  tone,
}) {
  const tones = {
    amber:
      "bg-amber-50 text-amber-800 ring-amber-300",
    green:
      "bg-emerald-50 text-emerald-800 ring-emerald-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${tones[tone]}`}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          className="size-3.5"
        />
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

function IncidentStatusPill({ status }) {
  if (status === "resolved") {
    return (
      <StatusPill
        icon={CircleCheck}
        tone="green"
      >
        Resolved
      </StatusPill>
    );
  }

  return (
    <StatusPill
      tone={
        status === "investigating"
          ? "amber"
          : "red"
      }
    >
      {formatStatus(status) || "Open"}
    </StatusPill>
  );
}

function OfficerPill({ officer }) {
  if (!officer?.fullName) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full border border-dashed border-slate-400 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Not assigned
      </span>
    );
  }

  return (
    <span className="font-semibold text-slate-900">
      {officer.fullName}
    </span>
  );
}

function OverdueSince({ value }) {
  const days = getDaysOverdue(value);

  return (
    <div className="whitespace-nowrap">
      <p className="font-bold text-red-700">
        {formatWith(
          overdueFormatter,
          value,
        )}
      </p>
      {days !== null ? (
        <p className="text-xs font-semibold text-slate-600">
          {days === 1
            ? "1 day overdue"
            : `${days} days overdue`}
        </p>
      ) : null}
    </div>
  );
}

function CardNumberStack({ record }) {
  return (
    <div className="grid justify-items-center gap-1">
      <span className="inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-bold text-brand-800 ring-1 ring-brand-300">
        {record.cardNumber}
      </span>
      {record.openedReason ? (
        <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
          {formatStatus(record.openedReason)}
        </span>
      ) : null}
    </div>
  );
}

function getIncidentAction(
  record,
  canManage,
) {
  if (!canManage) {
    return {
      disabled: true,
      label: "Investigate",
      title:
        "Incident management requires Client Service Head or Super Administrator access",
    };
  }

  if (record.canStartInvestigation) {
    return {
      disabled: false,
      label: "Investigate",
      title: `Investigate incident for ${record.cardNumber}`,
    };
  }

  if (record.canResolve) {
    return {
      disabled: false,
      label: "Resolve",
      title: `Resolve incident for ${record.cardNumber}`,
    };
  }

  if (record.canReprint) {
    return {
      disabled: false,
      label: "Reprint card",
      title: `Reprint ${record.cardNumber}`,
    };
  }

  return {
    disabled: true,
    label: "Resolved",
    title: `Incident for ${record.cardNumber} is resolved`,
  };
}

function IncidentActionButton({
  canManage,
  fullWidth = false,
  onManage,
  record,
}) {
  const action = getIncidentAction(
    record,
    canManage,
  );

  return (
    <button
      aria-label={action.title}
      className={`${FILLED_BUTTON} ${fullWidth ? "w-full" : ""}`}
      disabled={action.disabled}
      onClick={() => onManage(record)}
      title={action.title}
      type="button"
    >
      <ShieldCheck
        aria-hidden="true"
        className="size-4"
      />
      {action.label}
    </button>
  );
}

function AssignButton({
  fullWidth = false,
  onAssign,
  record,
}) {
  return (
    <button
      aria-label={`Assign card to ${record.fullName}`}
      className={`${FILLED_BUTTON} ${fullWidth ? "w-full" : ""}`}
      onClick={() => onAssign(record)}
      type="button"
    >
      <CreditCard
        aria-hidden="true"
        className="size-4"
      />
      Assign card
    </button>
  );
}

function TableHead({ columns }) {
  return (
    <thead className="border-y border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
      <tr>
        {columns.map((label) => (
          <th
            className="whitespace-nowrap px-4 py-3 font-bold"
            key={label}
            scope="col"
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function MobileCardHeader({ row }) {
  return (
    <div className="flex items-start gap-3">
      <InitialsAvatar fullName={row.fullName} />

      <div className="min-w-0 flex-1">
        <h3 className="wrap-break-word">
          <VisitorName row={row} />
        </h3>
        {row.organization ? (
          <p className="text-sm text-slate-600">
            {row.organization}
          </p>
        ) : null}
      </div>

      {row.reference ? (
        <ReferencePill
          reference={row.reference}
        />
      ) : null}
    </div>
  );
}

function MobileDetail({
  children,
  label,
  wide = false,
}) {
  return (
    <div
      className={`min-w-0 ${wide ? "col-span-2" : ""}`}
    >
      <dt className="text-xs font-semibold text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-slate-950">
        {children}
      </dd>
    </div>
  );
}

function PendingAdmissionsTable({
  onAssign,
  records,
}) {
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

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <MobileDetail label="Destination">
                  <Destination
                    agency={record.destinationAgency}
                    detail={
                      record.destinationDivision ||
                      record.personVisiting
                    }
                  />
                </MobileDetail>
                <MobileDetail label="Submitted">
                  <TimeStack
                    value={record.submittedAt}
                  />
                </MobileDetail>
                <MobileDetail label="Tower">
                  <TowerPill tower={record.tower} />
                </MobileDetail>
                <MobileDetail label="Purpose">
                  <PurposePill
                    purpose={row.purpose}
                  />
                </MobileDetail>
              </dl>

              <div className="mb-4 mt-4">
                <StatusPill
                  icon={Clock}
                  tone="amber"
                >
                  Pending admission
                </StatusPill>
              </div>

              <div className="mt-auto">
                <AssignButton
                  fullWidth
                  onAssign={onAssign}
                  record={record}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-300 border-collapse text-center">
          <TableHead
            columns={[
              "Reference",
              "Visitor",
              "Contact details",
              "Purpose",
              "Destination",
              "Tower",
              "Submitted",
              "Status",
              "Action",
            ]}
          />

          <tbody className="divide-y divide-slate-200 bg-white text-sm">
            {records.map((record) => {
              const row = toVisitorRow(record);

              return (
                <tr
                  className="align-middle transition hover:bg-slate-50"
                  key={record.visitId}
                >
                  <td className="whitespace-nowrap px-4 py-4">
                    <ReferencePill
                      reference={row.reference}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <VisitorName row={row} />
                  </td>
                  <td className="min-w-60 px-4 py-4">
                    <ContactDetails
                      email={row.email}
                      organization={row.organization}
                      phone={row.phone}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <PurposePill
                      purpose={row.purpose}
                    />
                  </td>
                  <td className="min-w-40 px-4 py-4">
                    <Destination
                      agency={record.destinationAgency}
                      detail={
                        record.destinationDivision ||
                        record.personVisiting
                      }
                    />
                  </td>
                  <td className="px-4 py-4">
                    <TowerPill tower={record.tower} />
                  </td>
                  <td className="px-4 py-4">
                    <TimeStack
                      value={record.submittedAt}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill
                      icon={Clock}
                      tone="amber"
                    >
                      Pending admission
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4">
                    <AssignButton
                      onAssign={onAssign}
                      record={record}
                    />
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

function CardIncidentsTable({
  canManage,
  onManage,
  records,
}) {
  return (
    <>
      <div className="grid gap-4 p-4 md:grid-cols-2 lg:hidden">
        {records.map((record) => {
          const row = toVisitorRow(record);

          return (
            <article
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              key={record.incidentId}
            >
              <MobileCardHeader
                row={{ ...row, reference: "" }}
              />

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <MobileDetail label="Card">
                  <span className="flex flex-wrap gap-1.5">
                    <span className="inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-bold text-brand-800 ring-1 ring-brand-300">
                      {record.cardNumber}
                    </span>
                    <TowerPill tower={record.tower} />
                  </span>
                </MobileDetail>
                <MobileDetail label="Overdue since">
                  <OverdueSince
                    value={record.overdueSince}
                  />
                </MobileDetail>
                <MobileDetail label="Assigned officer">
                  <OfficerPill
                    officer={record.assignedOfficer}
                  />
                </MobileDetail>
                <MobileDetail label="Purpose">
                  <PurposePill
                    purpose={row.purpose}
                  />
                </MobileDetail>
                {row.phone || row.email ? (
                  <MobileDetail
                    label="Contact"
                    wide
                  >
                    {[row.phone, row.email]
                      .filter(Boolean)
                      .map((value) => (
                        <span
                          className="block break-all"
                          key={value}
                        >
                          {value}
                        </span>
                      ))}
                  </MobileDetail>
                ) : null}
              </dl>

              <div className="mb-4 mt-4">
                <IncidentStatusPill
                  status={record.incidentStatus}
                />
              </div>

              <div className="mt-auto">
                <IncidentActionButton
                  canManage={canManage}
                  fullWidth
                  onManage={onManage}
                  record={record}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-300 border-collapse text-center">
          <TableHead
            columns={[
              "Card",
              "Visitor",
              "Contact details",
              "Purpose",
              "Tower",
              "Overdue since",
              "Incident status",
              "Assigned officer",
              "Action",
            ]}
          />

          <tbody className="divide-y divide-slate-200 bg-white text-sm">
            {records.map((record) => {
              const row = toVisitorRow(record);

              return (
                <tr
                  className="align-middle transition hover:bg-slate-50"
                  key={record.incidentId}
                >
                  <td className="whitespace-nowrap px-4 py-4">
                    <CardNumberStack record={record} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <VisitorName row={row} />
                  </td>
                  <td className="min-w-60 px-4 py-4">
                    <ContactDetails
                      email={row.email}
                      organization={row.organization}
                      phone={row.phone}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <PurposePill
                      purpose={row.purpose}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <TowerPill tower={record.tower} />
                  </td>
                  <td className="px-4 py-4">
                    <OverdueSince
                      value={record.overdueSince}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <IncidentStatusPill
                      status={record.incidentStatus}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <OfficerPill
                      officer={record.assignedOfficer}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <IncidentActionButton
                      canManage={canManage}
                      onManage={onManage}
                      record={record}
                    />
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

function TableEmptyState({ activeTab }) {
  const message = {
    "checked-in":
      "There are no checked-in visitors matching these filters.",
    incidents:
      "There are no visitor-card incidents matching these filters.",
    pending:
      "There are no pending admissions matching this search.",
  }[activeTab];

  return (
    <div className="grid min-h-56 place-items-center px-6 py-12 text-center">
      <div>
        <CreditCard aria-hidden="true" className="mx-auto size-9 text-slate-300" />

        <p className="mt-3 font-bold text-slate-800">
          No records found
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {message}
        </p>
      </div>
    </div>
  );
}

function Pagination({
  onPageChange,
  pagination,
}) {
  if (
    pagination.totalPages <= 1
  ) {
    return (
      <p className="text-sm text-slate-600">
        {pagination.totalCount}{" "}
        {pagination.totalCount === 1
          ? "entry"
          : "entries"}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm text-slate-600">
        Page {pagination.page} of{" "}
        {pagination.totalPages} ·{" "}
        {pagination.totalCount} entries
      </p>

      <div className="flex items-center gap-2">
        <button aria-label="Previous page" className="inline-flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} type="button">
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>

        <span className="grid min-w-10 place-items-center rounded-full bg-brand-800 px-3 py-2 text-sm font-bold text-white">
          {pagination.page}
        </span>

        <button aria-label="Next page" className="inline-flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)} type="button">
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

function StatCard({
  count,
  featured = false,
  icon: Icon,
  note,
  noteTone = "neutral",
  onOpen,
  title,
}) {
  const noteClasses = featured
    ? "bg-[#ffffff26] text-[#ffffff]"
    : {
        amber: "bg-amber-50 text-amber-800",
        neutral: "bg-slate-100 text-slate-700",
        red: "bg-red-50 text-red-700",
      }[noteTone];

  return (
    <article
      className={`relative overflow-hidden rounded-3xl p-5 shadow-sm sm:p-6 ${
        featured
          ? "bg-brand-800 text-[#ffffff]"
          : "border border-slate-200 bg-white text-slate-950"
      }`}
    >
      {featured ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-14 size-52 rounded-full border-14 border-[#ffffff14]"
        >
          <span className="absolute inset-6 rounded-full border-10 border-[#ffffff14]" />
        </span>
      ) : null}

      <div className="relative flex items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
            featured
              ? "bg-[#ffffff26]"
              : noteTone === "red"
                ? "bg-red-50 text-red-700"
                : "bg-brand-50 text-brand-800"
          }`}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>

        <h2 className="flex-1 font-bold">
          {title}
        </h2>

        <button
          aria-label={`Show ${title.toLowerCase()}`}
          className={`grid size-10 shrink-0 place-items-center rounded-full transition focus-visible:ring-4 focus-visible:ring-brand-200 ${
            featured
              ? "bg-[#ffffff] text-[#115e59] hover:bg-[#f0fdfa]"
              : "border border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50"
          }`}
          onClick={onOpen}
          type="button"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </button>
      </div>

      <p className="relative mt-5 text-5xl font-black">
        {count ?? "—"}
      </p>

      <p
        className={`relative mt-4 inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${noteClasses}`}
      >
        {note}
      </p>
    </article>
  );
}

function SegmentedButton({
  active,
  children,
  onClick,
  ...props
}) {
  return (
    <button
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm transition ${
        active
          ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
          : "font-semibold text-slate-600 hover:text-slate-900"
      }`}
      onClick={onClick}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export default function StaffVisitorCardsPage() {
  const {
    profile,
    session,
    signOut,
    tower,
  } = useAuth();

  const administrator =
    profile?.role === "admin";

  const clientServiceHead =
    profile?.role ===
    "client_service_head";

  const receptionist =
    profile?.role === "receptionist";

  const canManageIncidents =
    clientServiceHead ||
    administrator;

  const tabs = useMemo(() => {
    if (clientServiceHead) {
      return INCIDENT_TABS;
    }

    if (administrator) {
      return ADMIN_TABS;
    }

    return RECEPTION_TABS;
  }, [
    administrator,
    clientServiceHead,
  ]);

  const [activeTab, setActiveTab] =
    useState(
      clientServiceHead
        ? "incidents"
        : "pending",
    );

  const [rows, setRows] =
    useState([]);

  const [pagination, setPagination] =
    useState(INITIAL_PAGINATION);

  const [page, setPage] =
    useState(1);

  const [searchDraft, setSearchDraft] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [towerFilter, setTowerFilter] =
    useState(
      clientServiceHead ? "" : tower,
    );

  const [cardStatus, setCardStatus] =
    useState("all");

  const [
    incidentStatus,
    setIncidentStatus,
  ] = useState("all");

  const [resolution, setResolution] =
    useState("all");

  const [summary, setSummary] =
    useState(EMPTY_SUMMARY);

  const [updatedAt, setUpdatedAt] =
    useState(null);

  const [requestStatus, setRequestStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [actionTarget, setActionTarget] =
    useState(null);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const accessToken =
    session?.access_token || "";

  const requestTower =
    receptionist
      ? tower
      : towerFilter;

  // Totals for the stat cards and tab badges, independent of the
  // search and filters applied to the visible table.
  useEffect(() => {
    const controller =
      new AbortController();

    const signal = controller.signal;
    const showsReception =
      !clientServiceHead;

    async function settle(promise) {
      try {
        return await promise;
      } catch {
        return null;
      }
    }

    async function loadSummary() {
      const [
        pendingResult,
        checkedInResult,
        incidentResult,
        dashboardResult,
      ] = await Promise.all([
        showsReception
          ? settle(
              getPendingAdmissions({
                accessToken,
                page: 1,
                pageSize: 1,
                search: "",
                signal,
                tower: requestTower,
              }),
            )
          : null,
        showsReception
          ? settle(
              getCheckedInCardVisitors({
                accessToken,
                cardStatus: "all",
                page: 1,
                pageSize: 1,
                search: "",
                signal,
                tower: requestTower,
              }),
            )
          : null,
        canManageIncidents
          ? settle(
              getVisitorCardIncidents({
                accessToken,
                page: 1,
                pageSize: 1,
                resolution: "all",
                search: "",
                signal,
                status: "open",
                tower: requestTower,
              }),
            )
          : null,
        showsReception
          ? settle(
              apiRequest(
                "/api/staff/dashboard",
                {
                  body: JSON.stringify({
                    agency: "",
                    division: "",
                    page: 1,
                    query: "",
                    tower: requestTower || "",
                  }),
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                  method: "POST",
                  signal,
                },
              ),
            )
          : null,
      ]);

      if (signal.aborted) {
        return;
      }

      const notAssigned =
        dashboardResult?.cardAssignment
          ?.notAssigned;

      setSummary({
        awaitingCard: Number.isInteger(
          notAssigned,
        )
          ? notAssigned
          : null,
        checkedIn: checkedInResult
          ? getTotalCount(checkedInResult)
          : null,
        firstOpenCard:
          incidentResult?.incidents?.[0]
            ?.cardNumber || "",
        openIncidents: incidentResult
          ? getTotalCount(incidentResult)
          : null,
        pending: pendingResult
          ? getTotalCount(pendingResult)
          : null,
      });
    }

    void loadSummary();

    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    canManageIncidents,
    clientServiceHead,
    refreshKey,
    requestTower,
  ]);

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadRecords() {
      setRequestStatus("loading");
      setRequestError("");

      try {
        let result;
        let nextRows;

        if (activeTab === "pending") {
          result =
            await getPendingAdmissions({
              accessToken,
              page,
              pageSize: PAGE_SIZE,
              search,
              signal: controller.signal,
              tower: requestTower,
            });

          nextRows = Array.isArray(
            result?.admissions,
          )
            ? result.admissions
            : [];
        } else if (
          activeTab === "checked-in"
        ) {
          result =
            await getCheckedInCardVisitors({
              accessToken,
              cardStatus,
              page,
              pageSize: PAGE_SIZE,
              search,
              signal: controller.signal,
              tower: requestTower,
            });

          nextRows = Array.isArray(
            result?.visitors,
          )
            ? result.visitors
            : [];
        } else {
          result =
            await getVisitorCardIncidents({
              accessToken,
              page,
              pageSize: PAGE_SIZE,
              resolution,
              search,
              signal: controller.signal,
              status: incidentStatus,
              tower: requestTower,
            });

          nextRows = Array.isArray(
            result?.incidents,
          )
            ? result.incidents
            : [];
        }

        if (controller.signal.aborted) {
          return;
        }

        setRows(nextRows);
        setPagination(
          normalizePagination(
            result?.pagination,
          ),
        );
        setUpdatedAt(new Date());
        setRequestStatus("ready");
      } catch (error) {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          await signOut().catch(
            () => undefined,
          );

          return;
        }

        setRows([]);
        setPagination(
          INITIAL_PAGINATION,
        );

        setRequestError(
          error instanceof Error &&
            error.message
            ? error.message
            : "Visitor-card records could not be loaded. Please try again.",
        );

        setRequestStatus("error");
      }
    }

    void loadRecords();

    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    activeTab,
    cardStatus,
    incidentStatus,
    page,
    refreshKey,
    requestTower,
    resolution,
    search,
    signOut,
  ]);

  function changeTab(tabId) {
    if (tabId === activeTab) {
      return;
    }

    setActiveTab(tabId);
    setPage(1);
    setRows([]);
    setPagination(
      INITIAL_PAGINATION,
    );
    setRequestError("");
  }

  function submitSearch(event) {
    event.preventDefault();

    setPage(1);
    setSearch(
      searchDraft.trim(),
    );
  }

  function clearSearch() {
    setSearchDraft("");
    setSearch("");
    setPage(1);
  }

  function reload() {
    setRows([]);
    setRequestStatus("loading");
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function refreshRecords() {
    setSuccessMessage("");
    reload();
  }

  function openAction(type, record) {
    setSuccessMessage("");
    setActionTarget({
      record,
      type,
    });
  }

  function closeAction() {
    setActionTarget(null);
  }

  function completeAction(message) {
    setActionTarget(null);
    setSuccessMessage(message);
    reload();
  }

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  const tabCounts = {
    "checked-in": summary.checkedIn,
    incidents: summary.openIncidents,
    pending: summary.pending,
  };

  const statCards = [
    tabs.some((tab) => tab.id === "pending")
      ? {
          count: summary.pending,
          icon: UserPlus,
          id: "pending",
          note: "Waiting at reception",
          title: "Pending admissions",
        }
      : null,
    tabs.some(
      (tab) => tab.id === "checked-in",
    )
      ? {
          count: summary.checkedIn,
          icon: UserCheck,
          id: "checked-in",
          note:
            summary.awaitingCard > 0
              ? `${summary.awaitingCard} awaiting a card`
              : "All visitors have cards",
          noteTone:
            summary.awaitingCard > 0
              ? "amber"
              : "neutral",
          title: "Checked-in visitors",
        }
      : null,
    canManageIncidents
      ? {
          count: summary.openIncidents,
          icon: TriangleAlert,
          id: "incidents",
          note:
            summary.openIncidents === 1 &&
            summary.firstOpenCard
              ? `${summary.firstOpenCard} overdue`
              : summary.openIncidents > 0
                ? `${summary.openIncidents} overdue`
                : "No open incidents",
          noteTone:
            summary.openIncidents > 0
              ? "red"
              : "neutral",
          title: "Open card incidents",
        }
      : null,
  ].filter(Boolean);

  const filterLabelClass =
    "sr-only";

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col gap-4 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Visitor access control
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Visitor cards
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Review visitor entries, assign physical
            access cards and manage card-return
            incidents.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {updatedAt ? (
            <p className="text-sm text-slate-600">
              Updated{" "}
              {dateTimeFormatter.format(
                updatedAt,
              )}
            </p>
          ) : null}

          <button
            className={`${PILL_BUTTON} border border-brand-600 bg-white text-brand-800 hover:bg-brand-50 disabled:opacity-60`}
            disabled={requestStatus === "loading"}
            onClick={refreshRecords}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${requestStatus === "loading" ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </header>

      <div
        className={`mt-6 grid gap-4 ${
          statCards.length > 1
            ? "md:grid-cols-2 xl:grid-cols-3"
            : ""
        }`}
      >
        {statCards.map((card, index) => (
          <StatCard
            count={card.count}
            featured={index === 0}
            icon={card.icon}
            key={card.id}
            note={card.note}
            noteTone={card.noteTone}
            onOpen={() => changeTab(card.id)}
            title={card.title}
          />
        ))}
      </div>

      <section
        aria-label="Visitor-card records"
        className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div
              aria-label="Visitor-card views"
              className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1"
              role="tablist"
            >
              {tabs.map((tab) => {
                const active =
                  activeTab === tab.id;

                const count =
                  tabCounts[tab.id];

                const alert =
                  tab.id === "incidents" &&
                  count > 0;

                return (
                  <SegmentedButton
                    active={active}
                    aria-selected={active}
                    key={tab.id}
                    onClick={() =>
                      changeTab(tab.id)
                    }
                    role="tab"
                  >
                    {tab.label}

                    {count !== null &&
                    count !== undefined ? (
                      <span
                        className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-black ${
                          alert
                            ? "bg-red-600 text-[#ffffff]"
                            : active
                              ? "bg-brand-800 text-[#ffffff]"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </SegmentedButton>
                );
              })}
            </div>

            {receptionist ? (
              <span className="self-start rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 xl:self-auto">
                {getTowerLabel(tower)}
              </span>
            ) : (
              <div
                aria-label="Tower"
                className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1 xl:self-auto"
                role="group"
              >
                {TOWER_SEGMENTS.map((segment) => (
                  <SegmentedButton
                    active={
                      towerFilter ===
                      segment.value
                    }
                    aria-pressed={
                      towerFilter ===
                      segment.value
                    }
                    key={segment.value || "all"}
                    onClick={() =>
                      updateFilter(setTowerFilter)(
                        segment.value,
                      )
                    }
                  >
                    {segment.label}
                  </SegmentedButton>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <form
              className="relative w-full min-w-0 lg:max-w-xl lg:flex-1"
              onSubmit={submitSearch}
              role="search"
            >
              <label
                className="sr-only"
                htmlFor="visitor-card-search"
              >
                Search visitor-card records
              </label>

              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              />

              <input
                className="min-h-12 w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-12 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                id="visitor-card-search"
                maxLength={80}
                onChange={(event) =>
                  setSearchDraft(
                    event.target.value,
                  )
                }
                placeholder="Search visitor, reference or card"
                type="search"
                value={searchDraft}
              />

              {search ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                  onClick={clearSearch}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </form>

            {activeTab === "checked-in" ? (
              <div className="w-full shrink-0 sm:w-60">
                <AppSelect
                  id="cards-filter-card-status"
                  label="Card status"
                  labelClassName={filterLabelClass}
                  onChange={updateFilter(setCardStatus)}
                  options={[
                    { label: "All card statuses", value: "all" },
                    { label: "Assigned", value: "assigned" },
                    { label: "Not returned", value: "not_returned" },
                  ]}
                  size="2xl"
                  value={cardStatus}
                />
              </div>
            ) : null}

            {activeTab === "incidents" ? (
              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                <div className="shrink-0 sm:w-60">
                  <AppSelect
                    id="cards-filter-incident-status"
                    label="Incident status"
                    labelClassName={filterLabelClass}
                    onChange={updateFilter(setIncidentStatus)}
                    options={[
                      { label: "All incident statuses", value: "all" },
                      { label: "Open", value: "open" },
                      { label: "Investigating", value: "investigating" },
                      { label: "Resolved", value: "resolved" },
                    ]}
                    size="2xl"
                    value={incidentStatus}
                  />
                </div>

                <div className="shrink-0 sm:w-60">
                  <AppSelect
                    id="cards-filter-resolution"
                    label="Resolution"
                    labelClassName={filterLabelClass}
                    onChange={updateFilter(setResolution)}
                    options={[
                      { label: "All resolutions", value: "all" },
                      { label: "Late return", value: "late_return" },
                      { label: "Lost", value: "lost" },
                      { label: "Damaged", value: "damaged" },
                      { label: "Unusable", value: "unusable" },
                    ]}
                    size="2xl"
                    value={resolution}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {successMessage ? (
          <div className="flex items-center gap-3 border-t border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800" role="status">
            <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
            {successMessage}
          </div>
        ) : null}

        {requestError ? (
          <div className="border-t border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800" role="alert">
            {requestError}
          </div>
        ) : null}

        {requestStatus === "loading" ? (
          <div aria-live="polite" className="grid min-h-72 place-items-center border-t border-slate-200 px-6 py-12" role="status">
            <div className="text-center">
              <RefreshCw aria-hidden="true" className="mx-auto size-7 animate-spin text-brand-800" />

              <p className="mt-3 font-bold text-slate-700">
                Loading visitor-card records…
              </p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="border-t border-slate-200">
            <TableEmptyState
              activeTab={activeTab}
            />
          </div>
        ) : (
          <>
            {activeTab === "pending" ? (
              <PendingAdmissionsTable
                onAssign={(record) =>
                  openAction("assign", record)
                }
                records={rows}
              />
            ) : null}

            {activeTab === "checked-in" ? (
              <CheckedInVisitorsTable
                onCheckout={(record) =>
                  openAction("checkout", record)
                }
                rows={rows.map(toCheckedInRow)}
              />
            ) : null}

            {activeTab === "incidents" ? (
              <CardIncidentsTable
                canManage={
                  canManageIncidents
                }
                onManage={(record) =>
                  openAction("incident", record)
                }
                records={rows}
              />
            ) : null}
          </>
        )}

        <div className="border-t border-slate-200 px-4 py-4 sm:px-6">
          <Pagination
            onPageChange={setPage}
            pagination={pagination}
          />
        </div>
      </section>

      <aside className="mt-4 flex items-start gap-4 rounded-3xl border border-brand-200 bg-brand-50 p-5 sm:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-800">
          <ShieldAlert aria-hidden="true" className="size-5" />
        </span>

        <div>
          <h2 className="font-bold text-slate-950">
            Reception rules
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Physical visitor cards must be confirmed at
            reception before admission or check-out.
            Incident investigation actions are available
            only to authorised Client Service personnel
            and Super Administrators.
          </p>
        </div>
      </aside>

      {actionTarget?.type === "assign" ? (
        <AssignVisitorCardModal accessToken={accessToken} onClose={closeAction} onSuccess={completeAction} visitor={actionTarget.record} />
      ) : null}

      {actionTarget?.type === "checkout" ? (
        <CheckoutVisitorModal accessToken={accessToken} onClose={closeAction} onSuccess={completeAction} visitor={actionTarget.record} />
      ) : null}

      {actionTarget?.type === "incident" ? (
        <IncidentManagementModal accessToken={accessToken} incident={actionTarget.record} onClose={closeAction} onSuccess={completeAction} />
      ) : null}
    </div>
  );
}
