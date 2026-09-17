import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  TOWER_OPTIONS,
  VISIT_AGENCIES,
  VISIT_TOWER_VALUES,
  getTowerLabel,
} from "../constants/visitorOptions.js";
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

const VISIT_STATUSES = new Set([
  "checked_in",
  "checked_out",
  "cancelled",
]);

const dateTimeFormatter = new Intl.DateTimeFormat("en-GH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Accra",
});

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
    cancelled: "bg-red-100 text-red-800",
    checked_in: "bg-emerald-100 text-emerald-800",
    checked_out: "bg-slate-200 text-slate-800",
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

export default function StaffVisitHistoryPage() {
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
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [drafts, setDrafts] = useState(EMPTY_DRAFTS);
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

  function updateDraft(field, value) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [field]: value,
    }));
  }

  function changeAgency(event) {
    const nextAgency = event.target.value;

    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      agency: nextAgency,
      division:
        nextAgency ===
        MINISTRY_OF_FINANCE_AGENCY
          ? currentDrafts.division
          : "",
    }));
  }

  function changeTower(event) {
    if (!administrator) {
      return;
    }

    try {
      setTowerScope(event.target.value);
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

  function submitFilters(event) {
    event.preventDefault();
    setFilterError("");

    const parsed =
      visitHistorySchema.safeParse({
        ...drafts,
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

    setHistory(null);
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

  function clearFilters() {
    setDrafts(EMPTY_DRAFTS);
    setFilters(EMPTY_FILTERS);
    setFilterError("");
    setRequestError("");
    setHistory(null);
    setStatus("loading");
    setPage(1);
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
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

    setHistory(null);
    setRequestError("");
    setStatus("loading");
    setPage(nextPage);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  const loading = status === "loading";

  const filtersApplied = Boolean(
    filters.agency ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.division ||
      filters.search ||
      filters.status,
  );

  const visiblePages = getVisiblePages(
    page,
    history?.pagination.totalPages || 0,
  );

  const towerHeading = tower
    ? getTowerLabel(tower)
    : "All towers";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Reception records
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Visit history
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            Review authorised visit records for{" "}
            <strong>{towerHeading}</strong> using status,
            destination and Ghana-date filters.
          </p>
        </div>

        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={refreshHistory} type="button">
          <RefreshCw aria-hidden="true" className={`size-5 ${loading ? "animate-spin" : ""}`} />
          Refresh history
        </button>
      </header>

      <section aria-labelledby="history-tower-heading" className="mt-6 rounded-3xl border border-brand-100 bg-brand-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-800 text-white">
              <MapPin aria-hidden="true" className="size-5" />
            </span>

            <div>
              <h2 className="font-black text-brand-950" id="history-tower-heading">
                Reception tower
              </h2>

              <p className="mt-1 text-sm leading-6 text-brand-900">
                {administrator
                  ? "Administrators may review all towers or filter the history to one tower."
                  : "Your visit history is restricted to the tower selected when you signed in."}
              </p>
            </div>
          </div>

          {administrator ? (
            <div className="grid w-full gap-2 sm:w-64">
              <label className="font-bold text-brand-950" htmlFor="history-tower">
                Tower filter
              </label>

              <select className="min-h-12 w-full rounded-xl border border-brand-200 bg-white px-4 text-base font-bold text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100" id="history-tower" onChange={changeTower} value={tower}>
                <option value="">All towers</option>

                {TOWER_OPTIONS.map((towerOption) => (
                  <option key={towerOption.value} value={towerOption.value}>
                    {towerOption.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <TowerBadge tower={tower} />
          )}
        </div>
      </section>

      <section aria-labelledby="history-filters-heading" className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-xl font-black text-slate-950" id="history-filters-heading">
            Search and filter
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Search values are submitted in the request body
            and are not added to the browser URL.
          </p>
        </div>

        <form className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3" noValidate onSubmit={submitFilters}>
          <div className="grid gap-2">
            <label className="font-bold text-slate-800" htmlFor="history-search">
              Name or reference
            </label>

            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

              <input
                aria-describedby={filterError ? "history-filter-error" : undefined}
                autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pl-12 text-base text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100"
                id="history-search"
                maxLength="80"
                onChange={(event) => updateDraft("search", event.target.value)}
                placeholder="Name or VIS-reference"
                type="search"
                value={drafts.search}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="font-bold text-slate-800" htmlFor="history-status">
              Visit status
            </label>

            <select className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100" id="history-status" onChange={(event) => updateDraft("status", event.target.value)} value={drafts.status}>
              <option value="">All statuses</option>
              <option value="checked_in">Checked in</option>
              <option value="checked_out">Checked out</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="font-bold text-slate-800" htmlFor="history-agency">
              Agency
            </label>

            <select className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100" id="history-agency" onChange={changeAgency} value={drafts.agency}>
              <option value="">All agencies</option>

              {VISIT_AGENCIES.map((agency) => (
                <option key={agency} value={agency}>
                  {agency}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="font-bold text-slate-800" htmlFor="history-division">
              Ministry division
            </label>

            <select
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              disabled={drafts.agency !== MINISTRY_OF_FINANCE_AGENCY}
              id="history-division"
              onChange={(event) => updateDraft("division", event.target.value)}
              value={drafts.division}
            >
              <option value="">All Ministry divisions</option>

              {MOF_DIVISIONS.map((division) => (
                <option key={division} value={division}>
                  {division}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="font-bold text-slate-800" htmlFor="history-date-from">
              Check-in date from
            </label>

            <div className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

              <input className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pl-12 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100" id="history-date-from" onChange={(event) => updateDraft("dateFrom", event.target.value)} type="date" value={drafts.dateFrom} />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="font-bold text-slate-800" htmlFor="history-date-to">
              Check-in date to
            </label>

            <div className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

              <input className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pl-12 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100" id="history-date-to" onChange={(event) => updateDraft("dateTo", event.target.value)} type="date" value={drafts.dateTo} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 md:col-span-2 lg:col-span-3">
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">
              <Search aria-hidden="true" className="size-5" />
              Apply filters
            </button>

            {filtersApplied ? (
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={clearFilters} type="button">
                <X aria-hidden="true" className="size-5" />
                Clear filters
              </button>
            ) : null}
          </div>
        </form>

        {filterError ? (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" id="history-filter-error" role="alert">
            {filterError}
          </p>
        ) : null}
      </section>

      {loading && !history ? (
        <div className="mt-6">
          <LoadingState message={`Loading visit history for ${towerHeading}…`} />
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6">
          <ErrorMessage message={requestError} onRetry={refreshHistory} title="Visit history unavailable" />
        </div>
      ) : null}

      {history && status !== "error" ? (
        <section aria-busy={loading} aria-labelledby="visit-history-heading" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h2 className="text-xl font-black text-slate-950" id="visit-history-heading">
                Visit records
              </h2>

              <p aria-live="polite" className="mt-2 text-sm text-slate-600">
                {history.pagination.totalCount}{" "}
                {history.pagination.totalCount === 1
                  ? "matching visit"
                  : "matching visits"}{" "}
                in {towerHeading}
              </p>
            </div>

            {history.generatedAt ? (
              <p className="text-sm text-slate-500">
                Updated {formatDateTime(history.generatedAt)}
              </p>
            ) : null}
          </div>

          {history.visits.length === 0 ? (
            <div className="p-5 sm:p-8">
              <div className="rounded-2xl bg-slate-50 p-6 text-center">
                <History aria-hidden="true" className="mx-auto size-10 text-slate-400" />

                <h3 className="mt-4 font-black text-slate-950">
                  No visit records found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No visit matches the current tower, search
                  and filters.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 p-4 lg:hidden">
                {history.visits.map((visit) => (
                  <HistoryCard key={visit.visitId} visit={visit} />
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-50 text-sm text-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-bold" scope="col">
                        Visitor
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Status and time
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Visit
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Destination
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Tower
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {history.visits.map((visit) => (
                      <HistoryRow key={visit.visitId} visit={visit} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {history.pagination.totalPages > 1 ? (
            <Pagination
              currentPage={page}
              goToPage={goToPage}
              totalPages={history.pagination.totalPages}
              visiblePages={visiblePages}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function TowerBadge({ tower }) {
  const towerOne = tower === "tower_1";

  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${towerOne ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900"}`}>
      <MapPin aria-hidden="true" className="size-4" />
      {getTowerLabel(tower)}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${getStatusClasses(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function HistoryCard({ visit }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="wrap-break-word text-lg font-black text-slate-950">
            {visit.fullName}
          </h3>

          <p className="mt-1 font-mono text-sm font-bold text-brand-800">
            {visit.reference}
          </p>
        </div>

        <StatusBadge status={visit.status} />
      </div>

      <div className="mt-4">
        <TowerBadge tower={visit.tower} />
      </div>

      <dl className="mt-5 grid text-sm">
        <HistoryDetail icon={Phone} label="Phone" value={visit.phone || "Not provided"} />

        <HistoryDetail
          icon={Building2}
          label="Destination"
          value={[
            visit.agency,
            visit.division,
          ]
            .filter(Boolean)
            .join(" — ")}
        />

        <HistoryDetail icon={Users} label="Purpose" value={`${visit.purpose} — ${getVisitContact(visit)}`} />
        <HistoryDetail icon={Clock} label="Checked in" value={formatDateTime(visit.checkedInAt)} />

        {visit.status === "checked_out" ? (
          <HistoryDetail icon={Clock} label="Checked out" value={formatDateTime(visit.checkedOutAt)} />
        ) : null}
      </dl>
    </article>
  );
}

function HistoryDetail({
  icon: Icon,
  label,
  value,
}) {
  return (
    <>
      <dt className="mt-4 flex items-start gap-3 font-semibold text-slate-600 first:mt-0">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-800" />
        <span>{label}</span>
      </dt>

      <dd className="ml-8 mt-1 wrap-break-word font-bold text-slate-950">
        {value}
      </dd>
    </>
  );
}

function HistoryRow({ visit }) {
  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="px-6 py-5">
        <p className="font-black text-slate-950">
          {visit.fullName}
        </p>

        <p className="mt-1 font-mono text-sm font-bold text-brand-800">
          {visit.reference}
        </p>

        <p className="mt-2 text-sm text-slate-600">
          {visit.phone || "No phone provided"}
        </p>

        {visit.organization ? (
          <p className="mt-1 text-sm text-slate-500">
            {visit.organization}
          </p>
        ) : null}
      </td>

      <td className="px-6 py-5">
        <StatusBadge status={visit.status} />

        <p className="mt-3 whitespace-nowrap text-sm text-slate-700">
          In: {formatDateTime(visit.checkedInAt)}
        </p>

        {visit.checkedOutAt ? (
          <p className="mt-1 whitespace-nowrap text-sm text-slate-700">
            Out: {formatDateTime(visit.checkedOutAt)}
          </p>
        ) : null}
      </td>

      <td className="px-6 py-5">
        <p className="font-bold text-slate-950">
          {visit.purpose}
        </p>

        <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
          {getVisitContact(visit)}
        </p>
      </td>

      <td className="px-6 py-5">
        <p className="font-bold text-slate-950">
          {visit.agency}
        </p>

        {visit.division ? (
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
            {visit.division}
          </p>
        ) : null}
      </td>

      <td className="px-6 py-5">
        <TowerBadge tower={visit.tower} />
      </td>
    </tr>
  );
}

function Pagination({
  currentPage,
  goToPage,
  totalPages,
  visiblePages,
}) {
  return (
    <nav aria-label="Visit history pages" className="flex flex-col gap-4 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <p aria-live="polite" className="text-center text-sm font-semibold text-slate-600 sm:text-left">
        Page {currentPage} of {totalPages}
      </p>

      <div className="flex items-center justify-center gap-2">
        <button aria-label="Previous page" className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} type="button">
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          {visiblePages.map((pageNumber) => (
            <button
              aria-current={pageNumber === currentPage ? "page" : undefined}
              aria-label={`Page ${pageNumber}`}
              className={`grid size-11 place-items-center rounded-xl border text-sm font-black ${
                pageNumber === currentPage
                  ? "border-brand-800 bg-brand-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              key={pageNumber}
              onClick={() => goToPage(pageNumber)}
              type="button"
            >
              {pageNumber}
            </button>
          ))}
        </div>

        <button aria-label="Next page" className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)} type="button">
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
    </nav>
  );
}