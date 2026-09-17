import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Filter,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
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
import { getTowerLabel } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError } from "../lib/api.js";
import {
  getCheckedInCardVisitors,
  getPendingAdmissions,
  getVisitorCardIncidents,
} from "../lib/visitorCardApi.js";

const PAGE_SIZE = 10;

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

const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  pageSize: PAGE_SIZE,
  totalCount: 0,
  totalPages: 0,
});

const dateTimeFormatter =
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  });

function formatDateTime(value) {
  const date = new Date(value || "");

  if (
    !value ||
    Number.isNaN(date.getTime())
  ) {
    return "Not available";
  }

  return dateTimeFormatter.format(date);
}

function formatStatus(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getInitials(fullName) {
  const names = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (names.length === 0) {
    return "VI";
  }

  if (names.length === 1) {
    return names[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${names[0][0]}${names.at(-1)[0]}`.toUpperCase();
}

function getAvatarClass(fullName) {
  const palettes = [
    "bg-blue-50 text-blue-700",
    "bg-emerald-50 text-emerald-700",
    "bg-amber-50 text-amber-700",
    "bg-violet-50 text-violet-700",
    "bg-rose-50 text-rose-700",
    "bg-cyan-50 text-cyan-700",
  ];

  const index = Array.from(
    String(fullName || ""),
  ).reduce(
    (total, character) =>
      total + character.charCodeAt(0),
    0,
  ) % palettes.length;

  return palettes[index];
}

function getStatusClass(status) {
  const classes = {
    assigned:
      "bg-blue-50 text-blue-700 ring-blue-200",
    checked_in:
      "bg-emerald-50 text-emerald-700 ring-emerald-200",
    investigating:
      "bg-amber-50 text-amber-800 ring-amber-200",
    not_returned:
      "bg-red-50 text-red-700 ring-red-200",
    open:
      "bg-red-50 text-red-700 ring-red-200",
    pending_admission:
      "bg-amber-50 text-amber-800 ring-amber-200",
    resolved:
      "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };

  return (
    classes[status] ||
    "bg-slate-100 text-slate-700 ring-slate-200"
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

function VisitorIdentity({ visitor }) {
  const secondary =
    visitor.email ||
    visitor.phone ||
    visitor.organization ||
    "No additional contact information";

  return (
    <div className="flex min-w-56 items-center gap-3">
      <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold ${getAvatarClass(visitor.fullName)}`}>
        {getInitials(visitor.fullName)}
      </span>

      <span className="min-w-0">
        <span className="block truncate font-bold text-slate-950">
          {visitor.fullName ||
            "Unknown visitor"}
        </span>

        <span className="block truncate text-xs text-slate-500">
          {secondary}
        </span>
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ring-inset ${getStatusClass(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function Destination({ record }) {
  const destination =
    record.destinationDivision ||
    record.destinationAgency ||
    "Not provided";

  const person =
    record.personVisiting
      ? `Visiting ${record.personVisiting}`
      : record.purpose || "";

  return (
    <span className="block min-w-52">
      <span className="block font-semibold text-slate-900">
        {destination}
      </span>

      {person ? (
        <span className="mt-1 block text-xs text-slate-500">
          {person}
        </span>
      ) : null}
    </span>
  );
}

function ActionIcon({
  children,
  disabled = false,
  label,
  onClick,
}) {
  const unavailable =
    disabled ||
    typeof onClick !== "function";

  return (
    <button aria-label={label} className="inline-flex size-9 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-brand-800 transition-colors hover:border-brand-200 hover:bg-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400" disabled={unavailable} onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

function PendingAdmissionsTable({
  onAssign,
  records,
}) {
  return (
    <table className="w-full min-w-[1120px] border-collapse text-left">
      <thead className="bg-slate-50">
        <tr className="border-y border-slate-200 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
          <th className="px-5 py-4">
            Reference
          </th>
          <th className="px-5 py-4">
            Visitor
          </th>
          <th className="px-5 py-4">
            Destination
          </th>
          <th className="px-5 py-4">
            Tower
          </th>
          <th className="px-5 py-4">
            Submitted
          </th>
          <th className="px-5 py-4">
            Status
          </th>
          <th className="px-5 py-4 text-center">
            Action
          </th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-200 bg-white">
        {records.map((record) => (
          <tr className="transition-colors hover:bg-slate-50/80" key={record.visitId}>
            <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-brand-800">
              {record.referenceCode}
            </td>

            <td className="px-5 py-4">
              <VisitorIdentity
                visitor={record}
              />
            </td>

            <td className="px-5 py-4 text-sm">
              <Destination record={record} />
            </td>

            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
              {getTowerLabel(record.tower)}
            </td>

            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
              {formatDateTime(
                record.submittedAt,
              )}
            </td>

            <td className="px-5 py-4">
              <StatusBadge
                status={record.status}
              />
            </td>

            <td className="px-5 py-4">
              <div className="flex justify-center">
                <ActionIcon label={`Assign card to ${record.fullName}`} onClick={() => onAssign(record)}>
                  <CreditCard aria-hidden="true" className="size-4" />
                </ActionIcon>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CheckedInVisitorsTable({
  onCheckout,
  records,
}) {
  return (
    <table className="w-full min-w-[1180px] border-collapse text-left">
      <thead className="bg-slate-50">
        <tr className="border-y border-slate-200 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
          <th className="px-5 py-4">
            Reference
          </th>
          <th className="px-5 py-4">
            Visitor
          </th>
          <th className="px-5 py-4">
            Card
          </th>
          <th className="px-5 py-4">
            Destination
          </th>
          <th className="px-5 py-4">
            Checked in
          </th>
          <th className="px-5 py-4">
            Status
          </th>
          <th className="px-5 py-4 text-center">
            Action
          </th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-200 bg-white">
        {records.map((record) => (
          <tr className="transition-colors hover:bg-slate-50/80" key={record.visitId}>
            <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-brand-800">
              {record.referenceCode}
            </td>

            <td className="px-5 py-4">
              <VisitorIdentity
                visitor={record}
              />
            </td>

            <td className="whitespace-nowrap px-5 py-4">
              <span className="font-extrabold text-slate-950">
                {record.cardNumber}
              </span>

              <span className="mt-1 block text-xs text-slate-500">
                {getTowerLabel(record.tower)}
              </span>
            </td>

            <td className="px-5 py-4 text-sm">
              <Destination record={record} />
            </td>

            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
              {formatDateTime(
                record.checkedInAt,
              )}
            </td>

            <td className="px-5 py-4">
              <StatusBadge
                status={
                  record.assignmentStatus
                }
              />
            </td>

            <td className="px-5 py-4">
              <div className="flex justify-center">
                <ActionIcon disabled={record.canCheckout !== true} label={record.canCheckout === true ? `Check out ${record.fullName}` : `${record.cardNumber} requires incident action`} onClick={() => onCheckout(record)}>
                  <LogOut aria-hidden="true" className="size-4" />
                </ActionIcon>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardIncidentsTable({
  canManage,
  onManage,
  records,
}) {
  return (
    <table className="w-full min-w-[1220px] border-collapse text-left">
      <thead className="bg-slate-50">
        <tr className="border-y border-slate-200 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
          <th className="px-5 py-4">
            Card
          </th>
          <th className="px-5 py-4">
            Visitor
          </th>
          <th className="px-5 py-4">
            Tower
          </th>
          <th className="px-5 py-4">
            Overdue since
          </th>
          <th className="px-5 py-4">
            Incident status
          </th>
          <th className="px-5 py-4">
            Assigned officer
          </th>
          <th className="px-5 py-4 text-center">
            Action
          </th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-200 bg-white">
        {records.map((record) => (
          <tr className="transition-colors hover:bg-slate-50/80" key={record.incidentId}>
            <td className="whitespace-nowrap px-5 py-4">
              <span className="font-extrabold text-slate-950">
                {record.cardNumber}
              </span>

              <span className="mt-1 block text-xs text-slate-500">
                {formatStatus(
                  record.openedReason,
                )}
              </span>
            </td>

            <td className="px-5 py-4">
              <VisitorIdentity
                visitor={record}
              />
            </td>

            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
              {getTowerLabel(record.tower)}
            </td>

            <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-red-700">
              {formatDateTime(
                record.overdueSince,
              )}
            </td>

            <td className="px-5 py-4">
              <StatusBadge
                status={
                  record.incidentStatus
                }
              />
            </td>

            <td className="px-5 py-4 text-sm text-slate-700">
              {record.assignedOfficer
                ?.fullName ||
                "Not assigned"}
            </td>

            <td className="px-5 py-4">
              <div className="flex justify-center">
                <ActionIcon disabled={!canManage} label={canManage ? `Manage incident for ${record.cardNumber}` : "Incident management requires Client Service Head or Super Administrator access"} onClick={() => onManage(record)}>
                  <ShieldAlert aria-hidden="true" className="size-4" />
                </ActionIcon>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
      <p className="text-sm text-slate-500">
        {pagination.totalCount}{" "}
        {pagination.totalCount === 1
          ? "entry"
          : "entries"}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm text-slate-500">
        Page {pagination.page} of{" "}
        {pagination.totalPages} ·{" "}
        {pagination.totalCount} entries
      </p>

      <div className="flex items-center gap-2">
        <button aria-label="Previous page" className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} type="button">
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>

        <span className="grid min-w-10 place-items-center rounded-xl bg-brand-800 px-3 py-2 text-sm font-bold text-white">
          {pagination.page}
        </span>

        <button aria-label="Next page" className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)} type="button">
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
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

  const [showFilters, setShowFilters] =
    useState(false);

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

  const [pendingCount, setPendingCount] =
    useState(null);

  const [incidentCount, setIncidentCount] =
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
    profile?.role === "receptionist"
      ? tower
      : towerFilter;

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

        const nextPagination =
          normalizePagination(
            result?.pagination,
          );

        setRows(nextRows);
        setPagination(nextPagination);

        if (activeTab === "pending") {
          setPendingCount(
            nextPagination.totalCount,
          );
        }

        if (activeTab === "incidents") {
          setIncidentCount(
            nextPagination.totalCount,
          );
        }

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

  function refreshRecords() {
    setSuccessMessage("");
    setRows([]);
    setRequestStatus("loading");
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function openAssignment(record) {
    setSuccessMessage("");
    setActionTarget({
      record,
      type: "assign",
    });
  }

  function openCheckout(record) {
    setSuccessMessage("");
    setActionTarget({
      record,
      type: "checkout",
    });
  }

  function openIncident(record) {
    setSuccessMessage("");
    setActionTarget({
      record,
      type: "incident",
    });
  }

  function closeAction() {
    setActionTarget(null);
  }

  function completeAction(message) {
    setActionTarget(null);
    setSuccessMessage(message);
    setRows([]);
    setRequestStatus("loading");
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function updateTowerFilter(event) {
    setTowerFilter(
      event.target.value,
    );
    setPage(1);
  }

  function updateCardStatus(event) {
    setCardStatus(
      event.target.value,
    );
    setPage(1);
  }

  function updateIncidentStatus(event) {
    setIncidentStatus(
      event.target.value,
    );
    setPage(1);
  }

  function updateResolution(event) {
    setResolution(
      event.target.value,
    );
    setPage(1);
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-brand-800">
            Visitor access control
          </p>

          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Visitor cards
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Review visitor entries, assign physical
            access cards and manage card-return
            incidents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            {requestTower
              ? getTowerLabel(requestTower)
              : "All towers"}
          </span>

          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60" disabled={requestStatus === "loading"} onClick={refreshRecords} type="button">
            <RefreshCw aria-hidden="true" className={`size-4 ${requestStatus === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
          <div aria-label="Visitor-card views" className="flex gap-2 overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
              const active =
                activeTab === tab.id;

              const count =
                tab.id === "pending"
                  ? pendingCount
                  : tab.id ===
                      "incidents"
                    ? incidentCount
                    : null;

              return (
                <button aria-selected={active} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-t-xl border-b-2 px-4 text-sm font-extrabold transition-colors ${active ? "border-brand-800 bg-brand-50 text-brand-900" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`} key={tab.id} onClick={() => changeTab(tab.id)} role="tab" type="button">
                  {tab.label}

                  {count !== null ? (
                    <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-black ${active ? "bg-brand-800 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <form className="flex w-full max-w-xl items-center gap-2" onSubmit={submitSearch}>
            <label className="relative flex-1">
              <span className="sr-only">
                Search visitor-card records
              </span>

              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

              <input className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-100" maxLength={80} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search visitor, reference or card…" type="search" value={searchDraft} />
            </label>

            <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-800 px-4 text-sm font-bold text-white hover:bg-brand-900" type="submit">
              Search
            </button>
          </form>

          <div className="flex items-center gap-2">
            {search ? (
              <button className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={clearSearch} type="button">
                Clear
              </button>
            ) : null}

            <button aria-expanded={showFilters} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold ${showFilters ? "border-brand-700 bg-brand-50 text-brand-900" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`} onClick={() => setShowFilters((currentValue) => !currentValue)} type="button">
              <Filter aria-hidden="true" className="size-4" />
              Filter
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {profile?.role !==
            "receptionist" ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-600">
                  Tower
                </span>

                <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100" onChange={updateTowerFilter} value={towerFilter}>
                  <option value="">
                    All towers
                  </option>
                  <option value="tower_1">
                    Tower 1
                  </option>
                  <option value="tower_2">
                    Tower 2
                  </option>
                </select>
              </label>
            ) : (
              <div>
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-600">
                  Working tower
                </span>

                <p className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                  {getTowerLabel(tower)}
                </p>
              </div>
            )}

            {activeTab ===
            "checked-in" ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-600">
                  Card status
                </span>

                <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100" onChange={updateCardStatus} value={cardStatus}>
                  <option value="all">
                    All statuses
                  </option>
                  <option value="assigned">
                    Assigned
                  </option>
                  <option value="not_returned">
                    Not returned
                  </option>
                </select>
              </label>
            ) : null}

            {activeTab === "incidents" ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-600">
                    Incident status
                  </span>

                  <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100" onChange={updateIncidentStatus} value={incidentStatus}>
                    <option value="all">
                      All statuses
                    </option>
                    <option value="open">
                      Open
                    </option>
                    <option value="investigating">
                      Investigating
                    </option>
                    <option value="resolved">
                      Resolved
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-600">
                    Resolution
                  </span>

                  <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100" onChange={updateResolution} value={resolution}>
                    <option value="all">
                      All resolutions
                    </option>
                    <option value="late_return">
                      Late return
                    </option>
                    <option value="lost">
                      Lost
                    </option>
                    <option value="damaged">
                      Damaged
                    </option>
                    <option value="unusable">
                      Unusable
                    </option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
        ) : null}

        {successMessage ? (
          <div className="flex items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800" role="status">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs font-black text-white">
              ✓
            </span>

            {successMessage}
          </div>
        ) : null}

        {requestError ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800" role="alert">
            {requestError}
          </div>
        ) : null}

        {requestStatus === "loading" ? (
          <div aria-live="polite" className="grid min-h-72 place-items-center px-6 py-12" role="status">
            <div className="text-center">
              <RefreshCw aria-hidden="true" className="mx-auto size-7 animate-spin text-brand-800" />

              <p className="mt-3 font-bold text-slate-700">
                Loading visitor-card records…
              </p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <TableEmptyState
            activeTab={activeTab}
          />
        ) : (
          <div className="overflow-x-auto">
            {activeTab === "pending" ? (
              <PendingAdmissionsTable
                onAssign={openAssignment}
                records={rows}
              />
            ) : null}

            {activeTab ===
            "checked-in" ? (
              <CheckedInVisitorsTable
                onCheckout={openCheckout}
                records={rows}
              />
            ) : null}

            {activeTab ===
            "incidents" ? (
              <CardIncidentsTable
                canManage={
                  canManageIncidents
                }
                onManage={openIncident}
                records={rows}
              />
            ) : null}
          </div>
        )}

        <div className="border-t border-slate-200 px-4 py-4 sm:px-6">
          <Pagination
            onPageChange={setPage}
            pagination={pagination}
          />
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Physical visitor cards must be confirmed at reception before admission or check-out. Incident investigation actions are available only to authorised Client Service personnel and Super Administrators.
      </p>

      {actionTarget?.type === "assign" ? (
        <AssignVisitorCardModal accessToken={accessToken} onClose={closeAction} onSuccess={completeAction} visitor={actionTarget.record} />
      ) : null}

      {actionTarget?.type === "checkout" ? (
        <CheckoutVisitorModal accessToken={accessToken} onClose={closeAction} onSuccess={completeAction} visitor={actionTarget.record} />
      ) : null}

      {actionTarget?.type === "incident" ? (
        <IncidentManagementModal accessToken={accessToken} incident={actionTarget.record} onClose={closeAction} onSuccess={completeAction} />
      ) : null}
    </section>
  );
}