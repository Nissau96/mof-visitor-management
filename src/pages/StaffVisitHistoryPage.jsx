import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import AppSelect from "../components/AppSelect.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  TOWER_OPTIONS,
  VISIT_TOWER_VALUES,
  getTowerLabel,
} from "../constants/visitorOptions.js";
import {
  AGENCY_FILTER_OPTIONS,
  DIVISION_FILTER_OPTIONS,
} from "../constants/selectOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError, apiRequest } from "../lib/api.js";
import { visitHistorySchema } from "../validation/staffVisits.js";

const EMPTY_FILTERS = {
  agency: "",
  dateFrom: null,
  dateTo: null,
  division: "",
  search: "",
  status: "",
};

const EMPTY_DRAFTS = {
  agency: "",
  dateFrom: "",
  dateTo: "",
  division: "",
  search: "",
  status: "",
};

const STATUS_FILTER_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Checked in", value: "checked_in" },
  { label: "Checked out", value: "checked_out" },
  { label: "Cancelled", value: "cancelled" },
];

const VISIT_STATUSES = new Set([
  "checked_in",
  "checked_out",
  "cancelled",
]);

// "16 Aug 2026, 2:27 pm"
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
  year: "numeric",
});

const isoDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function formatIsoDate(isoDate) {
  return isoDateFormatter.format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

// "5d 0h 24m", "1h 5m" or "8m".
function formatDuration(checkedInAt, checkedOutAt) {
  if (!checkedOutAt) {
    return "";
  }

  const minutes = Math.floor(
    (new Date(checkedOutAt).getTime() -
      new Date(checkedInAt).getTime()) /
      60_000,
  );

  if (!Number.isFinite(minutes) || minutes < 0) {
    return "";
  }

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;

  if (days) {
    return `${days}d ${hours}h ${rest}m`;
  }

  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function getInitials(fullName) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// "Ministry of Finance (MoF)" -> "MoF"
function getAgencyShortName(agency) {
  return agency.match(/\(([^)]+)\)\s*$/)?.[1] || agency;
}

function formatDateTime(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return dateTimeFormatter.format(date);
}

function getVisitContact(visit) {
  if (visit.purpose === "Meeting") {
    return visit.meetingTitle || "Meeting";
  }

  return visit.personVisiting || "Not provided";
}

function getStatusLabel(status) {
  const labels = {
    cancelled: "Cancelled",
    checked_in: "Checked in",
    checked_out: "Checked out",
  };

  return labels[status] || "Unknown";
}

function getStatusClasses(status) {
  const classes = {
    cancelled: "bg-red-50 text-red-800",
    checked_in: "bg-emerald-50 text-emerald-800",
    checked_out: "bg-slate-100 text-slate-700",
  };

  return (
    classes[status] ||
    "bg-slate-100 text-slate-700"
  );
}

function normalizeHistoryResult(result) {
  if (
    !result ||
    typeof result !== "object" ||
    !result.pagination ||
    typeof result.pagination !== "object" ||
    !Array.isArray(result.visits)
  ) {
    throw new Error(
      "Visit history returned an invalid response.",
    );
  }

  const pagination = {
    page: Number(result.pagination.page),
    pageSize: Number(result.pagination.pageSize),
    totalCount: Number(result.pagination.totalCount),
    totalPages: Number(result.pagination.totalPages),
  };

  const validPagination = Object.values(
    pagination,
  ).every(
    (value) =>
      Number.isInteger(value) && value >= 0,
  );

  const validVisits = result.visits.every(
    (visit) =>
      visit &&
      typeof visit === "object" &&
      typeof visit.visitId === "string" &&
      typeof visit.reference === "string" &&
      typeof visit.fullName === "string" &&
      typeof visit.agency === "string" &&
      typeof visit.purpose === "string" &&
      typeof visit.checkedInAt === "string" &&
      VISIT_TOWER_VALUES.includes(visit.tower) &&
      VISIT_STATUSES.has(visit.status) &&
      (visit.checkedOutAt === null ||
        typeof visit.checkedOutAt ===
          "string"),
  );

  const validTowerScope =
    result.towerScope === null ||
    result.towerScope === "" ||
    VISIT_TOWER_VALUES.includes(
      result.towerScope,
    );

  if (
    !validPagination ||
    !validVisits ||
    !validTowerScope
  ) {
    throw new Error(
      "Visit history returned an invalid response.",
    );
  }

  return {
    generatedAt:
      typeof result.generatedAt === "string"
        ? result.generatedAt
        : "",
    pagination,
    staffRole:
      typeof result.staffRole === "string"
        ? result.staffRole
        : "",
    towerScope: result.towerScope || "",
    visits: result.visits,
  };
}

function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= 5) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const start = Math.min(
    Math.max(currentPage - 2, 1),
    totalPages - 4,
  );

  return Array.from(
    { length: 5 },
    (_, index) => start + index,
  );
}

function sameFilters(first, second) {
  return (
    first.agency === second.agency &&
    first.dateFrom === second.dateFrom &&
    first.dateTo === second.dateTo &&
    first.division === second.division &&
    first.search === second.search &&
    first.status === second.status
  );
}

// Other pages (the top-bar search, dashboard KPI links) open this page
// with filters in router state, so search text never reaches the URL.
function readPreset(preset, tower) {
  if (!preset || typeof preset !== "object") {
    return null;
  }

  const drafts = {
    ...EMPTY_DRAFTS,
    ...Object.fromEntries(
      Object.entries(preset).filter(
        ([key, value]) =>
          key in EMPTY_DRAFTS &&
          typeof value === "string",
      ),
    ),
  };

  const parsed =
    visitHistorySchema.safeParse({
      ...drafts,
      page: 1,
      pageSize: 10,
      tower,
    });

  if (!parsed.success) {
    return null;
  }

  return {
    drafts,
    filters: {
      agency: parsed.data.agency,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      division: parsed.data.division,
      search: parsed.data.search,
      status: parsed.data.status,
    },
  };
}

export default function StaffVisitHistoryPage() {
  const location = useLocation();

  // Remount on each navigation so a new preset replaces the old filters.
  return (
    <VisitHistory
      key={location.key}
      preset={location.state?.historyFilters}
    />
  );
}

function VisitHistory({ preset }) {
  const {
    profile,
    session,
    setTowerScope,
    signOut,
    tower,
  } = useAuth();

  const [history, setHistory] = useState(null);
  const [status, setStatus] = useState("loading");
  const [requestError, setRequestError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [initialPreset] = useState(() =>
    readPreset(preset, tower),
  );
  const [filters, setFilters] = useState(
    initialPreset?.filters || EMPTY_FILTERS,
  );
  const [drafts, setDrafts] = useState(
    initialPreset?.drafts || EMPTY_DRAFTS,
  );
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const accessToken = session?.access_token || "";
  const administrator = profile.role === "admin";

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/api/staff/history", {
      body: JSON.stringify({
        ...filters,
        page,
        pageSize: 10,
        tower,
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        const normalized =
          normalizeHistoryResult(result);

        setHistory(normalized);
        setRequestError("");
        setStatus("ready");
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          (error.status === 401 ||
            error.status === 403)
        ) {
          void signOut().catch(() => undefined);
          return;
        }

        setRequestError(
          error instanceof Error && error.message
            ? error.message
            : "Visit history could not be loaded. Please try again.",
        );

        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    filters,
    page,
    refreshKey,
    signOut,
    tower,
  ]);

  // Filters apply as soon as they change (search after a short pause).
  // Results stay on screen, dimmed, while the next page loads.
  function applyFilters(
    nextDrafts,
    { forceRefresh = false } = {},
  ) {
    setFilterError("");

    const parsed =
      visitHistorySchema.safeParse({
        ...nextDrafts,
        page: 1,
        pageSize: 10,
        tower,
      });

    if (!parsed.success) {
      setFilterError(
        parsed.error.issues[0]?.message ||
          "Check the history filters and try again.",
      );

      return;
    }

    const nextFilters = {
      agency: parsed.data.agency,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      division: parsed.data.division,
      search: parsed.data.search,
      status: parsed.data.status,
    };

    const unchanged =
      page === 1 &&
      sameFilters(filters, nextFilters);

    if (unchanged && !forceRefresh) {
      return;
    }

    setRequestError("");
    setStatus("loading");
    setPage(1);
    setFilters(nextFilters);

    if (unchanged) {
      setRefreshKey(
        (currentKey) => currentKey + 1,
      );
    }
  }

  function updateDraft(field, value) {
    const nextDrafts = {
      ...drafts,
      [field]: value,
    };

    setDrafts(nextDrafts);
    applyFilters(nextDrafts);
  }

  const applySearchDraft = useEffectEvent(() => {
    applyFilters(drafts);
  });

  useEffect(() => {
    const timeout = window.setTimeout(
      applySearchDraft,
      400,
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [drafts.search]);

  function submitSearch(event) {
    event.preventDefault();
    applyFilters(drafts, {
      forceRefresh: true,
    });
  }

  function changeAgency(nextAgency) {

    // Division only exists for MoF; clear it so a hidden select can
    // never narrow the results.
    const nextDrafts = {
      ...drafts,
      agency: nextAgency,
      division:
        nextAgency ===
        MINISTRY_OF_FINANCE_AGENCY
          ? drafts.division
          : "",
    };

    setDrafts(nextDrafts);
    applyFilters(nextDrafts);
  }

  function removeFilter(fields) {
    const nextDrafts = { ...drafts };

    for (const field of fields) {
      nextDrafts[field] = "";
    }

    if (fields.includes("agency")) {
      nextDrafts.division = "";
    }

    setDrafts(nextDrafts);
    applyFilters(nextDrafts);
  }

  function changeTower(nextTower) {
    if (
      !administrator ||
      nextTower === tower
    ) {
      return;
    }

    try {
      setTowerScope(nextTower);
      setHistory(null);
      setRequestError("");
      setFilterError("");
      setStatus("loading");
      setPage(1);
    } catch (error) {
      setRequestError(
        error instanceof Error && error.message
          ? error.message
          : "The tower filter could not be changed.",
      );

      setStatus("error");
    }
  }

  function clearFilters() {
    setDrafts(EMPTY_DRAFTS);
    applyFilters(EMPTY_DRAFTS, {
      forceRefresh: true,
    });
  }

  function refreshHistory() {
    setRequestError("");
    setStatus("loading");
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  function goToPage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage === page ||
      nextPage >
        (history?.pagination.totalPages || 1)
    ) {
      return;
    }

    setRequestError("");
    setStatus("loading");
    setPage(nextPage);

    document
      .getElementById("visit-history-heading")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  const loading = status === "loading";

  const activeFilters = describeActiveFilters(
    filters,
  );

  const visiblePages = getVisiblePages(
    page,
    history?.pagination.totalPages || 0,
  );

  const towerHeading = tower
    ? getTowerLabel(tower)
    : "All towers";

  const totalCount =
    history?.pagination.totalCount ?? 0;

  const pageSize =
    history?.pagination.pageSize || 10;

  const firstShown = totalCount
    ? (page - 1) * pageSize + 1
    : 0;

  const lastShown = totalCount
    ? firstShown +
      (history?.visits.length || 0) -
      1
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col items-center gap-4 px-1 pt-2 text-center md:flex-row md:items-end md:justify-between md:text-left">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Reception records
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Visit history
          </h1>

          <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-600 md:mx-0">
            Review authorised visit records for{" "}
            <strong className="text-slate-950">
              {towerHeading}
            </strong>{" "}
            using status, destination and Ghana-date
            filters.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-end">
          {history?.generatedAt ? (
            <p className="text-sm text-slate-600">
              Updated {formatDateTime(history.generatedAt)}
            </p>
          ) : null}

          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-600 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={refreshHistory}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh history
          </button>
        </div>
      </header>

      <section
        aria-busy={loading}
        aria-labelledby="visit-history-heading"
        className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="grid gap-4 border-b border-slate-200 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className="text-xl font-black text-slate-950"
                id="visit-history-heading"
              >
                Visit records
              </h2>

              {history ? (
                <p
                  aria-live="polite"
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800"
                >
                  {`${totalCount} ${
                    totalCount === 1
                      ? "matching visit"
                      : "matching visits"
                  } in ${towerHeading}`}
                </p>
              ) : null}
            </div>

            {administrator ? (
              <TowerTabs
                onChange={changeTower}
                tower={tower}
              />
            ) : (
              <TowerBadge tower={tower} />
            )}
          </div>

          <form
            className="grid grid-cols-2 gap-3 xl:flex xl:flex-wrap xl:items-center"
            noValidate
            onSubmit={submitSearch}
            role="search"
          >
            <div className="relative col-span-2 xl:min-w-64 xl:flex-1">
              <label
                className="sr-only"
                htmlFor="history-search"
              >
                Name or reference
              </label>

              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              />

              <input
                aria-describedby={
                  filterError
                    ? "history-filter-error"
                    : undefined
                }
                autoComplete="off"
                className="min-h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-950 shadow-none outline-none placeholder:text-slate-500 focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                id="history-search"
                maxLength="80"
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder="Name or VIS reference"
                type="search"
                value={drafts.search}
              />
            </div>

            <AppSelect
              appearance="filter"
              className="min-w-0 xl:w-44"
              id="history-status"
              label="Visit status"
              labelHidden
              onChange={(value) =>
                updateDraft("status", value)
              }
              options={STATUS_FILTER_OPTIONS}
              size="3xl"
              value={drafts.status}
            />

            <AppSelect
              appearance="filter"
              className="min-w-0 xl:w-56"
              id="history-agency"
              label="Agency"
              labelHidden
              onChange={changeAgency}
              options={AGENCY_FILTER_OPTIONS}
              size="3xl"
              value={drafts.agency}
            />

            {drafts.agency ===
            MINISTRY_OF_FINANCE_AGENCY ? (
              <AppSelect
                appearance="filter"
                className="col-span-2 min-w-0 md:col-span-1 xl:w-56"
                id="history-division"
                label="Ministry division"
                labelHidden
                onChange={(value) =>
                  updateDraft("division", value)
                }
                options={DIVISION_FILTER_OPTIONS}
                size="3xl"
                value={drafts.division}
              />
            ) : null}

            <div
              aria-label="Check-in date range"
              className="col-span-2 flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 xl:col-span-1"
              role="group"
            >

              <CalendarDays
                aria-hidden="true"
                className="size-4 shrink-0 text-slate-500"
              />

              <label
                className="sr-only"
                htmlFor="history-date-from"
              >
                Check-in date from
              </label>

              <input
                className="min-h-0 w-full min-w-0 border-0 bg-transparent p-0 text-sm text-slate-950 shadow-none outline-none focus:ring-0 xl:w-36"
                id="history-date-from"
                onChange={(event) =>
                  updateDraft(
                    "dateFrom",
                    event.target.value,
                  )
                }
                type="date"
                value={drafts.dateFrom}
              />

              <span
                aria-hidden="true"
                className="text-sm text-slate-500"
              >
                to
              </span>

              <label
                className="sr-only"
                htmlFor="history-date-to"
              >
                Check-in date to
              </label>

              <input
                className="min-h-0 w-full min-w-0 border-0 bg-transparent p-0 text-sm text-slate-950 shadow-none outline-none focus:ring-0 xl:w-36"
                id="history-date-to"
                onChange={(event) =>
                  updateDraft(
                    "dateTo",
                    event.target.value,
                  )
                }
                type="date"
                value={drafts.dateTo}
              />
            </div>
          </form>

          {filterError ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              id="history-filter-error"
              role="alert"
            >
              {filterError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-700">
              Active filters:
            </span>

            {activeFilters.length === 0 ? (
              <span className="text-slate-600">
                None. Showing every visit.
              </span>
            ) : (
              <>
                {activeFilters.map((filter) => (
                  <button
                    aria-label={`Remove filter: ${filter.label}`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-800 transition hover:bg-brand-100"
                    key={filter.key}
                    onClick={() =>
                      removeFilter(filter.fields)
                    }
                    type="button"
                  >
                    {filter.label}
                    <X
                      aria-hidden="true"
                      className="size-3.5"
                    />
                  </button>
                ))}

                <button
                  className="min-h-8 rounded-full px-2 text-xs font-bold text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>

        {loading && !history ? (
          <div className="p-4 sm:p-6">
            <LoadingState
              message={`Loading visit history for ${towerHeading}…`}
            />
          </div>
        ) : null}

        {status === "error" ? (
          <div className="p-4 sm:p-6">
            <ErrorMessage
              message={requestError}
              onRetry={refreshHistory}
              title="Visit history unavailable"
            />
          </div>
        ) : null}

        {history && status !== "error" ? (
          <div
            className={
              loading
                ? "pointer-events-none opacity-60 transition"
                : "transition"
            }
          >
            {history.visits.length === 0 ? (
              <div className="p-4 sm:p-8">
                <div className="rounded-2xl bg-slate-50 p-6 text-center">
                  <History
                    aria-hidden="true"
                    className="mx-auto size-10 text-slate-400"
                  />

                  <h3 className="mt-4 font-black text-slate-950">
                    No visit records found
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    No visit matches the current tower,
                    search and filters. Remove a filter to
                    widen the results.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 p-4 md:grid-cols-2 lg:hidden">
                  {history.visits.map((visit) => (
                    <HistoryCard
                      key={visit.visitId}
                      visit={visit}
                    />
                  ))}
                </div>

                {/* Focusable so keyboard users can scroll the wide table. */}
                <div
                  aria-label="Visit records table"
                  className="hidden overflow-x-auto focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200 lg:block"
                  role="region"
                  tabIndex={0}
                >
                  <table className="w-full min-w-275 border-collapse xl:min-w-0">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                      <tr>
                        {[
                          "Visitor",
                          "Contact details",
                          "Status and time",
                          "Visit",
                          "Destination",
                          "Card assigned",
                        ].map((label) => (
                          <th
                            className="whitespace-nowrap px-4 py-4 text-center font-bold"
                            key={label}
                            scope="col"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {history.visits.map((visit) => (
                        <HistoryRow
                          key={visit.visitId}
                          visit={visit}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <Pagination
              currentPage={page}
              goToPage={goToPage}
              summary={`Showing ${firstShown} to ${lastShown} of ${totalCount} ${
                totalCount === 1 ? "visit" : "visits"
              } · Page ${page} of ${Math.max(
                history.pagination.totalPages,
                1,
              )}`}
              totalPages={history.pagination.totalPages}
              visiblePages={visiblePages}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function describeActiveFilters(filters) {
  const active = [];

  if (filters.search) {
    active.push({
      fields: ["search"],
      key: "search",
      label: `“${filters.search}”`,
    });
  }

  if (filters.status) {
    active.push({
      fields: ["status"],
      key: "status",
      label: getStatusLabel(filters.status),
    });
  }

  if (filters.agency) {
    active.push({
      fields: ["agency"],
      key: "agency",
      label: getAgencyShortName(filters.agency),
    });
  }

  if (filters.division) {
    active.push({
      fields: ["division"],
      key: "division",
      label: filters.division,
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    active.push({
      fields: ["dateFrom", "dateTo"],
      key: "dates",
      label: `${
        filters.dateFrom
          ? formatIsoDate(filters.dateFrom)
          : "Any date"
      } – ${
        filters.dateTo
          ? formatIsoDate(filters.dateTo)
          : "today"
      }`,
    });
  }

  return active;
}

function TowerTabs({ onChange, tower }) {
  return (
    <div
      aria-label="Tower filter"
      className="flex gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 sm:inline-flex"
      role="group"
    >
      {[
        {
          label: "All Towers",
          value: "",
        },
        ...TOWER_OPTIONS,
      ].map((towerOption) => (
        <button
          aria-pressed={tower === towerOption.value}
          className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-2.5 text-sm transition sm:flex-none sm:px-5 ${
            tower === towerOption.value
              ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
              : "font-semibold text-slate-600 hover:text-slate-900"
          }`}
          key={towerOption.value || "all"}
          onClick={() => onChange(towerOption.value)}
          type="button"
        >
          {towerOption.label}
        </button>
      ))}
    </div>
  );
}

function TowerBadge({ tower }) {
  const towerOne = tower === "tower_1";

  return (
    <span className={`inline-flex min-h-9 items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-black sm:self-auto ${towerOne ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900"}`}>
      <MapPin aria-hidden="true" className="size-4" />
      {getTowerLabel(tower)}
    </span>
  );
}

function StatusChip({ status }) {
  const Icon =
    status === "checked_out"
      ? Check
      : status === "cancelled"
        ? X
        : null;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${getStatusClasses(status)}`}>
      {Icon ? (
        <Icon aria-hidden="true" className="size-3.5" />
      ) : (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
      )}
      {getStatusLabel(status)}
    </span>
  );
}

function VisitorTypeBadge({ type }) {
  if (type !== "vip" && type !== "regular") {
    return null;
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${
        type === "vip"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-brand-100 bg-brand-50 text-brand-800"
      }`}
    >
      {type === "vip" ? "VIP" : "Regular"}
    </span>
  );
}

function CardChip({ visit }) {
  if (visit.cardNumber) {
    return (
      <span className="inline-flex rounded-md border border-dashed border-slate-300 px-2 py-1 font-mono text-xs font-bold text-slate-700">
        {visit.cardNumber}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${
        visit.status === "checked_in"
          ? "bg-amber-50 text-amber-800"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      Not assigned
    </span>
  );
}

function VisitTimes({ visit }) {
  const duration = formatDuration(
    visit.checkedInAt,
    visit.checkedOutAt,
  );

  return (
    <>
      <p>
        In: {formatDateTime(visit.checkedInAt)}
      </p>

      {visit.checkedOutAt ? (
        <p>
          Out: {formatDateTime(visit.checkedOutAt)}
        </p>
      ) : null}

      {visit.status === "checked_in" ? (
        <p className="font-bold text-brand-700">
          Still in the building
        </p>
      ) : duration ? (
        <p className="font-semibold text-slate-700">
          Duration {duration}
        </p>
      ) : null}
    </>
  );
}

function HistoryCard({ visit }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800"
        >
          {getInitials(visit.fullName)}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="wrap-break-word font-bold text-slate-950">
            {visit.fullName}
          </h3>

          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-brand-100 bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-bold text-brand-800">
              {visit.reference}
            </span>
            <VisitorTypeBadge type={visit.visitorType} />
          </p>
        </div>

        <StatusChip status={visit.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2 text-slate-700">
          <dt className="text-xs font-semibold text-slate-500">
            Time
          </dt>
          <dd className="mt-0.5 grid gap-0.5">
            <VisitTimes visit={visit} />
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-xs font-semibold text-slate-500">
            Visit
          </dt>
          <dd className="mt-0.5 font-semibold text-slate-950">
            {visit.purpose}
          </dd>
          <dd className="text-xs text-slate-600">
            {getVisitContact(visit)}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-xs font-semibold text-slate-500">
            Destination
          </dt>
          <dd className="mt-0.5 font-semibold text-slate-950">
            {getAgencyShortName(visit.agency)}
            <span className="font-normal text-slate-600">
              {" · "}
              {getTowerLabel(visit.tower)}
            </span>
          </dd>
          {visit.division ? (
            <dd className="text-xs text-slate-600">
              {visit.division}
            </dd>
          ) : null}
        </div>

        {visit.organization || visit.phone ? (
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-slate-500">
              Contact
            </dt>
            {visit.organization ? (
              <dd className="mt-0.5 text-slate-950">
                {visit.organization}
              </dd>
            ) : null}
            {visit.phone ? (
              <dd className="text-slate-700">
                {visit.phone}
              </dd>
            ) : null}
          </div>
        ) : null}

        <div>
          <dt className="text-xs font-semibold text-slate-500">
            Card
          </dt>
          <dd className="mt-1">
            <CardChip visit={visit} />
          </dd>
        </div>
      </dl>
    </article>
  );
}

function HistoryRow({ visit }) {
  return (
    <tr className="text-center align-middle transition hover:bg-slate-50">
      <td className="px-4 py-4">
        <div className="flex items-center justify-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-black text-brand-800"
          >
            {getInitials(visit.fullName)}
          </span>

          <div className="grid justify-items-center gap-1">
            <p className="font-bold text-slate-950">
              {visit.fullName}
            </p>
            <span className="rounded-md border border-brand-100 bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-bold text-brand-800">
              {visit.reference}
            </span>
            <VisitorTypeBadge type={visit.visitorType} />
          </div>
        </div>
      </td>

      <td className="px-4 py-4 text-sm">
        {visit.organization ? (
          <p className="font-semibold text-slate-950">
            {visit.organization}
          </p>
        ) : null}
        {visit.phone ? (
          <p className="mt-0.5 inline-flex items-center gap-1.5 whitespace-nowrap text-slate-700">
            <Phone aria-hidden="true" className="size-3.5 text-slate-500" />
            {visit.phone}
          </p>
        ) : null}
      </td>

      <td className="min-w-52 px-4 py-4 text-sm text-slate-700">
        <StatusChip status={visit.status} />
        <div className="mt-1.5 grid gap-0.5">
          <VisitTimes visit={visit} />
        </div>
      </td>

      <td className="min-w-48 px-4 py-4 text-sm">
        <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
          {visit.purpose}
        </span>
        <p className="mt-1 text-slate-700">
          {getVisitContact(visit)}
        </p>
      </td>

      <td className="min-w-48 px-4 py-4 text-sm">
        <p className="font-bold text-slate-950">
          {visit.agency}
        </p>
        {visit.division ? (
          <span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {visit.division}
          </span>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          {getTowerLabel(visit.tower)}
        </p>
      </td>

      <td className="whitespace-nowrap px-4 py-4">
        <CardChip visit={visit} />
      </td>
    </tr>
  );
}

function Pagination({
  currentPage,
  goToPage,
  summary,
  totalPages,
  visiblePages,
}) {
  return (
    <nav
      aria-label="Visit history pages"
      className="flex flex-col gap-4 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <p
        aria-live="polite"
        className="text-center text-sm text-slate-600 sm:text-left"
      >
        {summary}
      </p>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <button
            aria-label="Previous page"
            className="grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            {visiblePages.map((pageNumber) => (
              <button
                aria-current={
                  pageNumber === currentPage
                    ? "page"
                    : undefined
                }
                aria-label={`Page ${pageNumber}`}
                className={`grid size-11 place-items-center rounded-full border text-sm font-black ${
                  pageNumber === currentPage
                    ? "border-brand-800 bg-brand-800 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                key={pageNumber}
                onClick={() => goToPage(pageNumber)}
                type="button"
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            aria-label="Next page"
            className="grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(currentPage + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
