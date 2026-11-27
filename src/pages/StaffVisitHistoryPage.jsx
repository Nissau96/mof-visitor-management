import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "../styles/visit-history.css";

import { CalendarX2, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import HistoryFilterBar, { FilterChip } from "../components/history/HistoryFilterBar.jsx";
import VisitDetailDrawer from "../components/history/VisitDetailDrawer.jsx";
import VisitHistoryTable from "../components/history/VisitHistoryTable.jsx";
import { MINISTRY_OF_FINANCE_AGENCY, VISIT_TOWER_VALUES, getTowerLabel } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError, apiRequest } from "../lib/api.js";
import { downloadCsv } from "../lib/reportExport.js";
import { toast } from "../lib/toast.js";
import {
  DATE_PRESETS,
  DEFAULT_PRESET,
  VISIT_STATES,
  accraToday,
  agencyShortName,
  csvFileName,
  formatRange,
  formatUpdated,
  isDatePreset,
  presetForRange,
  presetRange,
  rangeError,
  toCsvTable,
} from "../lib/visitHistory.js";
import { HISTORY_EXPORT_LIMIT, visitHistorySchema } from "../validation/staffVisits.js";

const PAGE_SIZE = 10;

const VISIT_STATUSES = new Set(["checked_in", "checked_out", "cancelled"]);

// Filters that live in the URL (search text never does: it can hold a
// visitor's name or phone number).
const PARAM_KEYS = ["range", "from", "to", "agency", "division", "purpose", "status", "sort", "dir", "page", "visit"];

const STATUS_LABELS = {
  cancelled: VISIT_STATES.cancelled.label,
  checked_in: VISIT_STATES.checked_in.label,
  checked_out: VISIT_STATES.checked_out.label,
};

function normalizeHistoryResult(result) {
  if (
    !result ||
    typeof result !== "object" ||
    !result.pagination ||
    typeof result.pagination !== "object" ||
    !Array.isArray(result.visits)
  ) {
    throw new Error("Visit history returned an invalid response.");
  }

  const pagination = {
    page: Number(result.pagination.page),
    pageSize: Number(result.pagination.pageSize),
    totalCount: Number(result.pagination.totalCount),
    totalPages: Number(result.pagination.totalPages),
  };

  const validPagination = Object.values(pagination).every(
    (value) => Number.isInteger(value) && value >= 0,
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
      // A visit cancelled before admission never checked in.
      (typeof visit.checkedInAt === "string" ||
        (visit.checkedInAt === null && visit.status === "cancelled")) &&
      VISIT_TOWER_VALUES.includes(visit.tower) &&
      VISIT_STATUSES.has(visit.status) &&
      (visit.checkedOutAt === null || typeof visit.checkedOutAt === "string"),
  );

  if (!validPagination || !validVisits) {
    throw new Error("Visit history returned an invalid response.");
  }

  return {
    generatedAt: typeof result.generatedAt === "string" ? result.generatedAt : "",
    pagination,
    visits: result.visits,
  };
}

function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.min(Math.max(currentPage - 2, 1), totalPages - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

/** URL params for filters handed over in router state by other pages. */
function presetParams(preset, today) {
  const params = new URLSearchParams();
  const text = (key) => (typeof preset[key] === "string" ? preset[key].trim() : "");

  const from = text("dateFrom");
  const to = text("dateTo");

  if (from || to) {
    const range = from && to ? presetForRange(from, to, today) : "custom";
    params.set("range", range);

    if (range === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
  } else {
    // No dates (a top-bar search, "currently checked in"): all dates.
    params.set("range", "custom");
  }

  for (const key of ["agency", "division", "purpose"]) {
    if (text(key)) {
      params.set(key, text(key));
    }
  }

  if (VISIT_STATUSES.has(text("status"))) {
    params.set("status", text("status"));
  }

  return { params, search: text("search") };
}

export default function StaffVisitHistoryPage() {
  const { profile, session, setTowerScope, signOut, tower } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const accessToken = session?.access_token || "";
  const loadMessages = useCallback(
    (reference) =>
      apiRequest("/api/staff/history/messages", {
        body: JSON.stringify({ reference, tower }),
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "POST",
      }).then((response) => (Array.isArray(response?.messages) ? response.messages : [])),
    [accessToken, tower],
  );
  const administrator = profile.role === "admin";
  const today = accraToday();

  // ---- Filters -------------------------------------------------------

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const preset = isDatePreset(searchParams.get("range")) ? searchParams.get("range") : DEFAULT_PRESET;
  const customFrom = searchParams.get("from") || "";
  const customTo = searchParams.get("to") || "";
  const agency = searchParams.get("agency") || "";
  const division = agency === MINISTRY_OF_FINANCE_AGENCY ? searchParams.get("division") || "" : "";
  const purpose = searchParams.get("purpose") || "";
  const status = VISIT_STATUSES.has(searchParams.get("status")) ? searchParams.get("status") : "";
  const sort = searchParams.get("sort") === "visitor" ? "visitor" : "date";
  const direction =
    searchParams.get("dir") === "asc" || searchParams.get("dir") === "desc"
      ? searchParams.get("dir")
      : sort === "visitor"
        ? "asc"
        : "desc";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const openVisitId = searchParams.get("visit") || "";

  const range = presetRange(preset, today, { from: customFrom, to: customTo });
  const dateError = preset === "custom" ? rangeError(range.from, range.to) : "";

  // Other pages hand filters over in router state. The search text is
  // taken during render; the rest becomes URL params, and the state is
  // dropped so a refresh keeps the URL only.
  const handed =
    location.state?.historyFilters && typeof location.state.historyFilters === "object"
      ? location.state.historyFilters
      : null;
  const [handedKey, setHandedKey] = useState("");

  if (handed && handedKey !== location.key) {
    const handedSearch = typeof handed.search === "string" ? handed.search.trim() : "";
    setHandedKey(location.key);
    setSearchDraft(handedSearch);
    setSearch(handedSearch);
  }

  useEffect(() => {
    if (!handed) {
      return;
    }

    const next = presetParams(handed, today);
    navigate({ pathname: location.pathname, search: `?${next.params}` }, { replace: true, state: null });
  }, [handed, location.pathname, navigate, today]);

  // Search applies after a short pause in typing.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = searchDraft.trim();

      if (next !== search) {
        setSearch(next);
        updateParams({ page: "", visit: "" });
      }
    }, 400);

    return () => window.clearTimeout(timeout);
    // updateParams is stable enough: it reads the latest params when called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // Reads the live URL rather than the router's copy: a delayed call
  // (the search pause) must not undo a filter changed in the meantime.
  function updateParams(changes) {
    const next = new URLSearchParams(window.location.search);

    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value === null || value === undefined) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }

    setSearchParams(next, { replace: true });
  }

  function changeFilter(field, value) {
    switch (field) {
      case "search":
        setSearchDraft(value);
        return;
      case "preset":
        updateParams({
          from: value === "custom" ? range.from : "",
          page: "",
          range: value === DEFAULT_PRESET ? "" : value,
          to: value === "custom" ? range.to : "",
          visit: "",
        });
        return;
      case "tower":
        if (administrator && value !== tower) {
          try {
            setTowerScope(value);
            updateParams({ page: "", visit: "" });
          } catch (error) {
            toast.error(
              "Tower not changed",
              error instanceof Error ? error.message : "The tower filter could not be changed.",
            );
          }
        }
        return;
      case "agency":
        // Division only exists for MoF; drop it with any other agency.
        updateParams({ agency: value, division: "", page: "", visit: "" });
        return;
      default:
        updateParams({ [field]: value, page: "", visit: "" });
    }
  }

  function resetFilters() {
    setSearchDraft("");
    setSearch("");
    updateParams(
      Object.fromEntries(PARAM_KEYS.filter((key) => key !== "sort" && key !== "dir").map((key) => [key, ""])),
    );
  }

  function changeSort(key) {
    const nextDirection =
      sort === key ? (direction === "asc" ? "desc" : "asc") : key === "visitor" ? "asc" : "desc";

    updateParams({
      dir: key === "date" && nextDirection === "desc" ? "" : nextDirection,
      page: "",
      sort: key === "date" ? "" : key,
    });
  }

  // ---- Request -------------------------------------------------------

  const request = useMemo(() => {
    if (dateError) {
      return { error: dateError };
    }

    const parsed = visitHistorySchema.safeParse({
      agency,
      dateFrom: range.from || null,
      dateTo: range.to || null,
      direction,
      division,
      page,
      pageSize: PAGE_SIZE,
      purpose,
      search,
      sort,
      status,
      tower,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message || "Check the history filters and try again." };
    }

    return { body: parsed.data };
  }, [agency, dateError, direction, division, page, purpose, range.from, range.to, search, sort, status, tower]);

  const requestKey = JSON.stringify(request);

  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Loading is derived: the last result belongs to an older request.
  const fetchKey = `${requestKey}|${refreshKey}|${accessToken}`;
  const [result, setResult] = useState({ error: "", history: null, key: "" });
  const history = result.history;
  const loadState = result.key !== fetchKey ? "loading" : result.error ? "error" : "ready";
  const loadError = result.error;

  useEffect(() => {
    if (!request.body) {
      return undefined;
    }

    const controller = new AbortController();

    apiRequest("/api/staff/history", {
      body: JSON.stringify(request.body),
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setResult({ error: "", history: normalizeHistoryResult(response), key: fetchKey });
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          void signOut().catch(() => undefined);
          return;
        }

        setResult((current) => ({
          error:
            error instanceof Error && error.message
              ? error.message
              : "Visit history could not be loaded. Please try again.",
          history: current.history,
          key: fetchKey,
        }));
      });

    return () => controller.abort();
    // fetchKey stands in for request.body, refreshKey and the token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, signOut]);

  async function exportCsv() {
    if (!request.body || exporting) {
      return;
    }

    setExporting(true);

    try {
      const exported = normalizeHistoryResult(
        await apiRequest("/api/staff/history/export", {
          body: JSON.stringify({ ...request.body, page: 1, pageSize: PAGE_SIZE }),
          headers: { Authorization: `Bearer ${accessToken}` },
          method: "POST",
        }),
      );

      const { columns, rows } = toCsvTable(exported.visits);
      downloadCsv(csvFileName(range.from, range.to), columns, rows);

      if (exported.pagination.totalCount > exported.visits.length) {
        toast.warning(
          "Export shortened",
          `Only the first ${HISTORY_EXPORT_LIMIT.toLocaleString("en-GB")} of ${exported.pagination.totalCount.toLocaleString("en-GB")} visits were exported. Narrow the dates to export the rest.`,
        );
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        void signOut().catch(() => undefined);
        return;
      }

      toast.error(
        "Export failed",
        error instanceof Error && error.message ? error.message : "The CSV could not be created. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  // ---- Drawer --------------------------------------------------------

  const returnFocus = useRef(null);
  const visits = request.error ? [] : history?.visits || [];
  const openVisit = visits.find((visit) => visit.visitId === openVisitId) || null;

  function openDrawer(visit, trigger) {
    returnFocus.current = trigger || null;
    updateParams({ visit: visit.visitId });
  }

  function closeDrawer() {
    const target = returnFocus.current;
    updateParams({ visit: "" });

    window.setTimeout(() => {
      (target?.isConnected ? target : document.getElementById("visit-history-heading"))?.focus();
    }, 0);
  }

  function goToPage(nextPage) {
    updateParams({ page: nextPage === 1 ? "" : nextPage, visit: "" });
    document.getElementById("visit-history-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- Display -------------------------------------------------------

  const loading = loadState === "loading" && !request.error;
  const totalCount = request.error ? 0 : history?.pagination.totalCount ?? 0;
  const totalPages = request.error ? 0 : history?.pagination.totalPages ?? 0;
  const towerHeading = tower ? getTowerLabel(tower) : "All towers";
  const presetLabel = DATE_PRESETS.find((option) => option.value === preset)?.label;
  const rangeText = `${towerHeading} · ${
    request.error ? "Check the dates" : `${presetLabel}, ${formatRange(range.from, range.to)}`
  }`;

  const chips = [
    search ? { key: "search", label: `“${search}”`, remove: () => (setSearchDraft(""), setSearch("")) } : null,
    status ? { key: "status", label: STATUS_LABELS[status], remove: () => changeFilter("status", "") } : null,
    agency ? { key: "agency", label: agencyShortName(agency), remove: () => changeFilter("agency", "") } : null,
    division ? { key: "division", label: division, remove: () => changeFilter("division", "") } : null,
    purpose ? { key: "purpose", label: purpose, remove: () => changeFilter("purpose", "") } : null,
  ].filter(Boolean);

  const changedFromDefaults = chips.length > 0 || preset !== DEFAULT_PRESET;
  const firstShown = totalCount ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = totalCount ? firstShown + visits.length - 1 : 0;

  return (
    <div className="vh mx-auto w-full max-w-440 px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="vh-titlerow">
        <div className="vh-titlecopy">
          <h1 className="vh-h1">Visit history</h1>
          <p className="vh-lede">
            Every authorised visit, newest first. Pick a row to see contact details, tags and the full
            visit record.
          </p>
        </div>

        <div className="vh-actions">
          {history?.generatedAt ? (
            <span className="vh-updated">Updated {formatUpdated(history.generatedAt)}</span>
          ) : null}
          <button
            className="vh-btn vh-btn-outline"
            disabled={loading}
            onClick={() => setRefreshKey((key) => key + 1)}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={loading ? "vh-spin" : undefined} size={16} />
            Refresh
          </button>
          <button
            className="vh-btn vh-btn-solid"
            disabled={exporting || Boolean(request.error) || totalCount === 0}
            onClick={exportCsv}
            type="button"
          >
            <Download aria-hidden="true" size={16} />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </header>

      <section aria-busy={loading} aria-labelledby="visit-history-heading" className="vh-panel">
        <HistoryFilterBar
          administrator={administrator}
          onChange={changeFilter}
          rangeError={dateError}
          tower={tower || ""}
          values={{
            agency,
            division,
            from: customFrom,
            preset,
            purpose,
            search: searchDraft,
            to: customTo,
          }}
        />

        <div className="vh-summary">
          <h2 className="vh-h2" id="visit-history-heading" tabIndex={-1}>
            Visit records
          </h2>
          <span aria-live="polite" className="vh-countpill">
            {totalCount} {totalCount === 1 ? "visit" : "visits"}
          </span>
          <span className="vh-rangetext">{rangeText}</span>
          <span className="vh-spacer" />
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.remove} />
          ))}
          {changedFromDefaults ? (
            <button className="vh-textbtn" onClick={resetFilters} type="button">
              Reset filters
            </button>
          ) : null}
        </div>

        {request.error && !dateError ? (
          <p className="vh-error" role="alert" style={{ padding: "0 20px 14px" }}>
            {request.error}
          </p>
        ) : null}

        {loading && !history ? (
          <div className="p-4 sm:p-6">
            <LoadingState message={`Loading visit history for ${towerHeading}…`} />
          </div>
        ) : loadState === "error" && !request.error ? (
          <div className="p-4 sm:p-6">
            <ErrorMessage
              message={loadError}
              onRetry={() => setRefreshKey((key) => key + 1)}
              title="Visit history unavailable"
            />
          </div>
        ) : visits.length === 0 ? (
          <div className="vh-empty" role="status">
            <CalendarX2 aria-hidden="true" className="vh-empty-icon" size={44} strokeWidth={1.6} />
            <p className="vh-empty-title">No visits match these filters</p>
            <span>Try a wider date range or reset the filters.</span>
            <button className="vh-btn vh-btn-outline" onClick={resetFilters} type="button">
              Reset filters
            </button>
          </div>
        ) : (
          <div className={loading ? "vh-busy" : undefined}>
            <VisitHistoryTable
              direction={direction}
              onOpen={openDrawer}
              onSort={changeSort}
              selectedId={openVisitId}
              sort={sort}
              visits={visits}
            />
          </div>
        )}

        <div className="vh-footer">
          <span className="vh-pageinfo">
            {totalCount
              ? `Showing ${firstShown}–${lastShown} of ${totalCount} ${totalCount === 1 ? "visit" : "visits"}`
              : "No visits"}
          </span>

          {totalPages > 1 ? (
            <nav aria-label="Visit history pages" className="vh-pager">
              <button
                aria-label="Previous page"
                className="vh-pagebtn"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.2} />
              </button>
              {getVisiblePages(page, totalPages).map((number) => (
                <button
                  aria-current={number === page ? "page" : undefined}
                  aria-label={`Page ${number} of ${totalPages}`}
                  className="vh-pagebtn"
                  disabled={loading && number !== page}
                  key={number}
                  onClick={() => goToPage(number)}
                  type="button"
                >
                  {number}
                </button>
              ))}
              <button
                aria-label="Next page"
                className="vh-pagebtn"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2.2} />
              </button>
            </nav>
          ) : null}
        </div>
      </section>

      {openVisit ? <VisitDetailDrawer loadMessages={loadMessages} onClose={closeDrawer} visit={openVisit} /> : null}
    </div>
  );
}
