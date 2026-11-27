import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CreditCard,
  Info,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { IncidentManagementModal } from "../components/VisitorCardActions.jsx";
import AppSelect from "../components/AppSelect.jsx";
import SegmentedButton from "../components/SegmentedButton.jsx";
import StatCard from "../components/StatCard.jsx";
import VisitHistoryTable from "../components/history/VisitHistoryTable.jsx";
import {
  CardPill,
  CheckedInCard,
  CheckedInStatus,
} from "../components/history/HistoryPills.jsx";
import "../styles/visit-history.css";
import { StatusPill } from "../components/PendingAdmissionsTable.jsx";
import { getTowerLabel } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError, apiRequest } from "../lib/api.js";
import {
  getCheckedInCardVisitors,
  getCheckedInVisitorCount,
  getCheckedOutVisitors,
  getVisitorCardIncidents,
} from "../lib/visitorCardApi.js";
import { accraToday } from "../lib/visitHistory.js";
import { toast } from "../lib/toast.js";
import { ADMISSIONS_CHANGED_EVENT } from "../components/FindBookingDialog.jsx";

const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;

// Pending admissions live on the Dashboard only; this page follows a
// card from check-in to check-out, and to an incident if it is kept.
const RECEPTION_TABS = Object.freeze([
  Object.freeze({
    id: "checked-in",
    label: "Checked-in visitors",
    shortLabel: "Checked-in",
  }),
  Object.freeze({
    id: "checked-out",
    label: "Checked-out visitors",
    shortLabel: "Checked-out",
  }),
  Object.freeze({
    id: "incidents",
    label: "Card incidents",
    shortLabel: "Incidents",
  }),
]);

const ADMIN_TABS = RECEPTION_TABS;

const INCIDENT_TABS = Object.freeze([
  Object.freeze({
    id: "incidents",
    label: "Card incidents",
    shortLabel: "Incidents",
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
  checkedOut: null,
  checkedOutTotal: null,
  openIncidents: null,
});

const dateTimeFormatter =
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  });

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

// Checked-in visitors use the Visit History columns. The API adds the
// visit's meeting title, agency and division to each row.
function toCheckedInVisit(record) {
  return {
    agency: record.agency || record.destinationAgency || "",
    bookedGuest: Boolean(record.bookedGuest),
    bookedVisit: Boolean(record.bookedVisit),
    cardNumber: record.cardNumber || null,
    cardStatus: record.assignmentStatus || null,
    checkedInAt: record.checkedInAt || null,
    checkedOutAt: null,
    division: record.division || record.destinationDivision || "",
    email: record.email || "",
    fullName: record.fullName || "Unknown visitor",
    meetingTitle: record.meetingTitle || "",
    organization: record.organization || "",
    personVisiting: record.personVisiting || "",
    phone: record.phone || "",
    purpose: record.purpose || "",
    reference: record.referenceCode || "",
    status: "checked_in",
    tower: record.tower,
    visitId: record.visitId,
    visitorType: record.visitorType || null,
  };
}

const PILL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed";

const FILLED_BUTTON = `${PILL_BUTTON} bg-brand-800 text-white hover:bg-brand-900 disabled:bg-slate-200 disabled:text-slate-500`;

const COMPACT_BUTTON =
  "inline-flex min-h-10 max-w-full items-center justify-center whitespace-nowrap rounded-full bg-brand-800 px-3.5 text-[13px] font-bold text-white transition hover:bg-brand-900 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";

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

function getIncidentAction(
  record,
  canManage,
) {
  if (!canManage) {
    return {
      disabled: true,
      label: "Investigate",
      title:
        "Incident management requires Unit Head or Super Administrator access",
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

// `compact` fits the table's Action column: smaller, no icon.
function IncidentActionButton({
  canManage,
  compact = false,
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
      className={
        compact
          ? COMPACT_BUTTON
          : `${FILLED_BUTTON} ${fullWidth ? "w-full" : ""}`
      }
      disabled={action.disabled}
      onClick={() => onManage(record)}
      title={action.title}
      type="button"
    >
      {compact ? null : (
        <ShieldCheck
          aria-hidden="true"
          className="size-4"
        />
      )}
      {action.label}
    </button>
  );
}

// Incidents use the Visit History columns, plus Action. Each incident is
// shaped like a visit row; the API adds the visit's purpose, destination
// and times.
function toIncidentVisit(record) {
  return {
    agency: record.agency || record.destinationAgency || "",
    cardNumber: record.cardNumber || null,
    cardStatus: record.assignmentStatus || record.cardStatus || "not_returned",
    checkedInAt: record.checkedInAt || null,
    checkedOutAt: record.checkedOutAt || null,
    division: record.division || "",
    email: record.email || "",
    fullName: record.fullName,
    meetingTitle: record.meetingTitle || "",
    organization: record.organization || "",
    personVisiting: record.personVisiting || "",
    phone: record.phone || "",
    purpose: record.purpose || "",
    record,
    reference: record.referenceCode || record.reference || record.cardNumber || "",
    status: "checked_out",
    tower: record.tower,
    // Incidents are listed by incident, so the incident id keys the row.
    visitId: record.incidentId,
    visitorType: record.visitorType || null,
  };
}

function IncidentState({ record }) {
  const days = getDaysOverdue(record.overdueSince);

  return (
    <span className="vh-namestack vh-stack-start">
      <IncidentStatusPill status={record.incidentStatus} />
      {record.incidentStatus !== "resolved" && days !== null ? (
        <span className="vh-subline">
          {days === 1 ? "1 day overdue" : `${days} days overdue`}
        </span>
      ) : null}
      {record.assignedOfficer?.fullName ? (
        <span className="vh-subline" title={`Officer: ${record.assignedOfficer.fullName}`}>
          {record.assignedOfficer.fullName}
        </span>
      ) : null}
    </span>
  );
}

function CardIncidentsTable({
  canManage,
  onManage,
  records,
}) {
  return (
    <div className="vh">
      <VisitHistoryTable
        label="Card incidents"
        renderAction={(visit, { fullWidth }) => (
          <IncidentActionButton
            canManage={canManage}
            compact={!fullWidth}
            fullWidth={fullWidth}
            onManage={onManage}
            record={visit.record}
          />
        )}
        renderCard={(visit) => (
          <CardPill
            kept={visit.record.incidentStatus !== "resolved"}
            visit={visit}
          />
        )}
        renderStatus={(visit) => <IncidentState record={visit.record} />}
        visits={records.map(toIncidentVisit)}
      />
    </div>
  );
}

function TableEmptyState({ activeTab }) {
  const message = {
    "checked-in":
      "There are no checked-in visitors matching these filters.",
    "checked-out":
      "Nobody has checked out today, or no one matches this search.",
    incidents:
      "There are no visitor-card incidents matching these filters.",
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

// `noun` names what is counted ("entries" by default); `note` adds a
// second figure after it, such as every check-out ever.
function Pagination({
  noun,
  note,
  onPageChange,
  pagination,
}) {
  const counted = noun
    ? `${pagination.totalCount} ${noun}`
    : `${pagination.totalCount} ${pagination.totalCount === 1 ? "entry" : "entries"}`;

  const summary = (
    <p className="text-sm tabular-nums text-slate-600">
      {pagination.totalPages > 1
        ? `Page ${pagination.page} of ${pagination.totalPages} · `
        : ""}
      {counted}
      {note ? (
        <>
          {" · "}
          <span className="font-semibold text-slate-800">{note}</span>
        </>
      ) : null}
    </p>
  );

  if (
    pagination.totalPages <= 1
  ) {
    return summary;
  }

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      {summary}

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

  // Reception always opens on Checked-in; Unit Heads only have
  // Card incidents.
  const [activeTab, setActiveTab] =
    useState(
      clientServiceHead
        ? "incidents"
        : "checked-in",
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
        checkedOutResult,
        checkedOutTotalResult,
        checkedInResult,
        incidentResult,
        dashboardResult,
      ] = await Promise.all([
        showsReception
          ? settle(
              getCheckedOutVisitors({
                accessToken,
                date: accraToday(),
                page: 1,
                pageSize: 1,
                signal,
                tower: requestTower,
              }),
            )
          : null,
        showsReception
          ? settle(
              getCheckedOutVisitors({
                accessToken,
                page: 1,
                pageSize: 1,
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
          : settle(
              getCheckedInVisitorCount({
                accessToken,
                signal,
                tower: requestTower,
              }),
            ),
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
        checkedOut: checkedOutResult
          ? getTotalCount(checkedOutResult)
          : null,
        checkedOutTotal: checkedOutTotalResult
          ? getTotalCount(checkedOutTotalResult)
          : null,
        checkedIn: !checkedInResult
          ? null
          : showsReception
            ? getTotalCount(checkedInResult)
            : Number.isInteger(
                  Number(checkedInResult.checkedIn),
                )
              ? Number(checkedInResult.checkedIn)
              : null,
        firstOpenCard:
          incidentResult?.incidents?.[0]
            ?.cardNumber || "",
        openIncidents: incidentResult
          ? getTotalCount(incidentResult)
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
      if (!activeTab) {
        return;
      }

      setRequestStatus("loading");
      setRequestError("");

      try {
        let result;
        let nextRows;

        if (activeTab === "checked-out") {
          result =
            await getCheckedOutVisitors({
              accessToken,
              date: accraToday(),
              page,
              pageSize: PAGE_SIZE,
              search,
              signal: controller.signal,
              tower: requestTower,
            });

          nextRows = Array.isArray(
            result?.visits,
          )
            ? result.visits
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

  // A card assigned from Find booking changes the lists here.
  useEffect(() => {
    function bump() {
      setRefreshKey((currentKey) => currentKey + 1);
    }

    window.addEventListener(ADMISSIONS_CHANGED_EVENT, bump);

    return () => window.removeEventListener(ADMISSIONS_CHANGED_EVENT, bump);
  }, []);

  function reload() {
    setRows([]);
    setRequestStatus("loading");
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function refreshRecords() {
    reload();
  }

  function openAction(type, record) {
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
    toast.success("Visitor card updated", message);
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
    "checked-out": summary.checkedOut,
    incidents: summary.openIncidents,
  };

  const statCards = [
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
          shortTitle: "Checked-in",
          title: "Checked-in visitors",
        }
      : clientServiceHead
        ? {
            // Count only: there is no checked-in tab to open.
            count: summary.checkedIn,
            icon: UserCheck,
            id: "checked-in",
            note: "In the building",
            readOnly: true,
            shortTitle: "Checked-in",
            title: "Checked-in visitors",
          }
        : null,
    tabs.some((tab) => tab.id === "checked-out")
      ? {
          count: summary.checkedOut,
          icon: LogOut,
          id: "checked-out",
          note: "Checked out today",
          shortTitle: "Checked-out",
          title: "Checked-out visitors",
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
          shortTitle: "Incidents",
          title: "Open card incidents",
          tone:
            summary.openIncidents > 0
              ? "alert"
              : undefined,
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
            Follow each visitor card from check-in
            to check-out, and manage cards that were
            not returned. Admit waiting visitors from
            the Dashboard.
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

      <section
        aria-label="Visitor-card statistics"
        className={`mt-6 grid gap-2 sm:gap-4 ${
          {
            1: "grid-cols-1",
            2: "grid-cols-2",
            3: "grid-cols-3 md:grid-cols-2 lg:grid-cols-3",
          }[statCards.length] || ""
        }`}
      >
        {statCards.map((card, index) => (
          <StatCard
            // Two columns leave the third card alone on its row, so it
            // spans the full width there.
            className={
              statCards.length === 3 && index === 2
                ? "md:col-span-2 lg:col-span-1"
                : ""
            }
            count={card.count}
            featured={index === 0}
            icon={card.icon}
            key={card.id}
            note={card.note}
            noteTone={card.noteTone}
            onOpen={
              card.readOnly
                ? undefined
                : () => changeTab(card.id)
            }
            shortTitle={card.shortTitle}
            title={card.title}
            tone={card.tone}
          />
        ))}
      </section>

      <section
        aria-label="Visitor-card records"
        className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div
              aria-label="Visitor-card views"
              className="flex w-full max-w-full gap-1 self-start overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1 sm:w-auto"
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
                    className="max-sm:flex-1 max-sm:justify-center max-sm:gap-1.5 max-sm:px-2"
                    key={tab.id}
                    onClick={() =>
                      changeTab(tab.id)
                    }
                    role="tab"
                  >
                    {/* Phones show the short name; screen readers always get the full one. */}
                    <span
                      aria-hidden="true"
                      className="sm:hidden"
                    >
                      {tab.shortLabel}
                    </span>
                    <span className="max-sm:sr-only">
                      {tab.label}
                    </span>

                    {count !== null &&
                    count !== undefined ? (
                      <span
                        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1 py-0.5 text-xs font-black sm:min-w-6 sm:px-1.5 ${
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
                    { label: "Not assigned", value: "unassigned" },
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

        {activeTab === "checked-in" ? (
          <p className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:px-6">
            <Info aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
            Cards not returned within 24 hours of check-in move to Card incidents.
          </p>
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
            {/* Checked-in and checked-out use the Visit History columns,
                with no action column; check-out happens on the Dashboard. */}
            {activeTab === "checked-out" ? (
              <div className="vh">
                <VisitHistoryTable
                  label="Checked-out visitors"
                  visits={rows}
                />
              </div>
            ) : null}

            {activeTab === "checked-in" ? (
              <div className="vh">
                <VisitHistoryTable
                  label="Checked-in visitors"
                  noteMissingEmail={false}
                  renderCard={(visit) => <CheckedInCard visit={visit} />}
                  renderStatus={(visit) => <CheckedInStatus visit={visit} />}
                  visits={rows.map(toCheckedInVisit)}
                />
              </div>
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
            noun={
              activeTab === "checked-out"
                ? "checked out today"
                : ""
            }
            note={
              activeTab === "checked-out" &&
              Number.isInteger(summary.checkedOutTotal)
                ? `${summary.checkedOutTotal.toLocaleString("en-GB")} checked out in total`
                : ""
            }
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

      {actionTarget?.type === "incident" ? (
        <IncidentManagementModal accessToken={accessToken} incident={actionTarget.record} onClose={closeAction} onSuccess={completeAction} />
      ) : null}
    </div>
  );
}
