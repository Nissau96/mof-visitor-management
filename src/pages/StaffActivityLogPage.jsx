import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "../styles/visit-history.css";

import { Activity, ChevronLeft, ChevronRight, CircleX, Download, ShieldAlert, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatCard from "../components/StatCard.jsx";
import ActivityDrawer from "../components/activity/ActivityDrawer.jsx";
import ActivityFilterBar from "../components/activity/ActivityFilterBar.jsx";
import ActivityTable from "../components/activity/ActivityTable.jsx";
import { FilterChip } from "../components/history/HistoryFilterBar.jsx";
import useAuth from "../hooks/useAuth.js";
import { ApiError, apiRequest } from "../lib/api.js";
import { CATEGORY_OPTIONS, RESULT_OPTIONS, ROLE_OPTIONS, TOWER_OPTIONS, toActivityCsvTable } from "../lib/activityLog.js";
import { downloadCsv } from "../lib/reportExport.js";
import { toast } from "../lib/toast.js";
import {
  DATE_PRESETS,
  accraToday,
  formatRange,
  formatTime,
  formatUpdated,
  isDatePreset,
  presetRange,
  rangeError,
} from "../lib/visitHistory.js";
import { ACTIVITY_EXPORT_LIMIT, activityLogSchema } from "../validation/activityLog.js";

const PAGE_SIZE = 10;
const DEFAULT_PRESET = "today";
const LIVE_REFRESH_MS = 30_000;

// Filters kept in the URL; search text is not (it can hold a name).
const PARAM_KEYS = ["range", "from", "to", "user", "role", "tower", "category", "result", "page", "event"];

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}

function getVisiblePages(current, total) {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const start = Math.min(Math.max(current - 2, 1), total - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default function StaffActivityLogPage() {
  const { session, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const accessToken = session?.access_token || "";
  const today = accraToday();

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const preset = isDatePreset(searchParams.get("range")) ? searchParams.get("range") : DEFAULT_PRESET;
  const customFrom = searchParams.get("from") || "";
  const customTo = searchParams.get("to") || "";
  const userId = searchParams.get("user") || "";
  const role = searchParams.get("role") || "";
  const tower = searchParams.get("tower") || "";
  const category = searchParams.get("category") || "";
  const result = searchParams.get("result") || "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const openEventId = searchParams.get("event") || "";

  const range = presetRange(preset, today, { from: customFrom, to: customTo });
  const dateError = preset === "custom" ? rangeError(range.from, range.to) : "";

  // Reads the live URL so a delayed call never undoes a newer change.
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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = searchDraft.trim();

      if (next !== search) {
        setSearch(next);
        updateParams({ event: "", page: "" });
      }
    }, 400);

    return () => window.clearTimeout(timeout);
    // updateParams reads the live URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  function changeFilter(field, value) {
    if (field === "search") {
      setSearchDraft(value);
      return;
    }

    if (field === "preset") {
      updateParams({
        event: "",
        from: value === "custom" ? range.from : "",
        page: "",
        range: value === DEFAULT_PRESET ? "" : value,
        to: value === "custom" ? range.to : "",
      });
      return;
    }

    updateParams({ [field]: value, event: "", page: "" });
  }

  function resetFilters() {
    setSearchDraft("");
    setSearch("");
    updateParams(Object.fromEntries(PARAM_KEYS.map((key) => [key, ""])));
  }

  // ---- Request -------------------------------------------------------

  const request = useMemo(() => {
    if (dateError) {
      return { error: dateError };
    }

    const parsed = activityLogSchema.safeParse({
      category,
      dateFrom: range.from || null,
      dateTo: range.to || null,
      page,
      pageSize: PAGE_SIZE,
      result,
      role,
      search,
      tower,
      userId,
    });

    return parsed.success
      ? { body: parsed.data }
      : { error: parsed.error.issues[0]?.message || "Check the filters and try again." };
  }, [category, dateError, page, range.from, range.to, result, role, search, tower, userId]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const fetchKey = `${JSON.stringify(request)}|${refreshKey}|${accessToken}`;
  const [loaded, setLoaded] = useState({ data: null, error: "", key: "" });
  const data = loaded.data;
  const loadState = loaded.key !== fetchKey ? "loading" : loaded.error ? "error" : "ready";

  useEffect(() => {
    if (!request.body) {
      return undefined;
    }

    const controller = new AbortController();

    apiRequest("/api/admin/activity/list", {
      body: JSON.stringify(request.body),
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setLoaded({ data: response, error: "", key: fetchKey });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          void signOut().catch(() => undefined);
          return;
        }

        setLoaded((current) => ({
          data: current.data,
          error: error instanceof Error && error.message ? error.message : "The activity log could not be loaded.",
          key: fetchKey,
        }));
      });

    return () => controller.abort();
    // fetchKey covers the request body, refresh and token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, signOut]);

  // Live: refresh every 30 seconds while the tab is in view.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshKey((key) => key + 1);
      }
    }, LIVE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  async function exportCsv() {
    if (!request.body || exporting) {
      return;
    }

    setExporting(true);

    try {
      const exported = await apiRequest("/api/admin/activity/export", {
        body: JSON.stringify({ ...request.body, page: 1, pageSize: PAGE_SIZE }),
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "POST",
      });
      const events = Array.isArray(exported?.events) ? exported.events : [];
      const { columns, rows } = toActivityCsvTable(events);

      downloadCsv(`activity-log-${range.from || "start"}-to-${range.to || "today"}.csv`, columns, rows);

      if ((exported?.pagination?.totalCount || 0) > events.length) {
        toast.warning(
          "Export shortened",
          `Only the first ${ACTIVITY_EXPORT_LIMIT.toLocaleString("en-GB")} events were exported. Narrow the dates to export the rest.`,
        );
      }

      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error("Export failed", error instanceof Error && error.message ? error.message : "The CSV could not be created.");
    } finally {
      setExporting(false);
    }
  }

  // ---- Drawer --------------------------------------------------------

  const returnFocus = useRef(null);
  const events = request.error ? [] : data?.events || [];
  const openEvent = events.find((event) => String(event.id) === openEventId) || null;

  function openDrawer(event, trigger) {
    returnFocus.current = trigger || null;
    updateParams({ event: event.id });
  }

  function closeDrawer() {
    const target = returnFocus.current;
    updateParams({ event: "" });
    window.setTimeout(() => {
      (target?.isConnected ? target : document.getElementById("activity-heading"))?.focus();
    }, 0);
  }

  // ---- Display -------------------------------------------------------

  const loading = loadState === "loading" && !request.error;
  const stats = data?.stats || {};
  const totalCount = request.error ? 0 : data?.pagination?.totalCount ?? 0;
  const totalPages = request.error ? 0 : data?.pagination?.totalPages ?? 0;
  const firstShown = totalCount ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = totalCount ? firstShown + events.length - 1 : 0;
  const presetLabel = DATE_PRESETS.find((option) => option.value === preset)?.label;
  const users = Array.isArray(data?.users) ? data.users : [];
  const activeNames = Array.isArray(stats.activeUsers) ? stats.activeUsers : [];

  const chips = [
    search ? { key: "search", label: `“${search}”`, remove: () => (setSearchDraft(""), setSearch("")) } : null,
    userId ? { key: "user", label: users.find((user) => user.id === userId)?.name || "One user", remove: () => changeFilter("user", "") } : null,
    role ? { key: "role", label: optionLabel(ROLE_OPTIONS, role), remove: () => changeFilter("role", "") } : null,
    tower ? { key: "tower", label: optionLabel(TOWER_OPTIONS, tower), remove: () => changeFilter("tower", "") } : null,
    category ? { key: "category", label: optionLabel(CATEGORY_OPTIONS, category), remove: () => changeFilter("category", "") } : null,
    result ? { key: "result", label: optionLabel(RESULT_OPTIONS, result), remove: () => changeFilter("result", "") } : null,
  ].filter(Boolean);

  const changed = chips.length > 0 || preset !== DEFAULT_PRESET;

  const statCards = [
    {
      count: stats.eventsToday ?? null,
      icon: Activity,
      id: "events",
      note: stats.firstEventAt ? `Since ${formatTime(stats.firstEventAt)}` : "No events yet today",
      onOpen: () => updateParams({ ...Object.fromEntries(PARAM_KEYS.map((key) => [key, ""])) }),
      shortTitle: "Events",
      title: "Events today",
    },
    {
      count: stats.activeUserCount ?? null,
      icon: Users,
      id: "users",
      note: activeNames.length ? activeNames.slice(0, 4).join(", ") + (activeNames.length > 4 ? ` +${activeNames.length - 4}` : "") : "Nobody yet",
      shortTitle: "Users",
      title: "Active users today",
    },
    {
      count: stats.failedToday ?? null,
      icon: CircleX,
      id: "failed",
      note: stats.failedToday ? "Show failed today" : "None today",
      noteTone: stats.failedToday ? "red" : "neutral",
      onOpen: () => updateParams({ category: "", event: "", page: "", range: "", result: "failed" }),
      shortTitle: "Failed",
      title: "Failed actions",
      tone: stats.failedToday ? "alert" : undefined,
    },
    {
      count: stats.sensitiveToday ?? null,
      icon: ShieldAlert,
      id: "sensitive",
      note: "Settings, roles and exports",
      noteTone: stats.sensitiveToday ? "amber" : "neutral",
      onOpen: () => updateParams({ category: "sensitive", event: "", page: "", range: "", result: "" }),
      shortTitle: "Sensitive",
      title: "Sensitive changes",
    },
  ];

  return (
    <div className="vh mx-auto w-full max-w-440 px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="vh-titlerow">
        <div className="vh-titlecopy">
          <h1 className="vh-h1">Activity log</h1>
          <p className="vh-lede">
            Every action staff take in the portal, with who did it, when, from which device, and what changed.
            Entries cannot be edited or deleted.
          </p>
        </div>

        <div className="vh-actions">
          {data?.generatedAt ? (
            <span className="vh-updated al-live">
              <span aria-hidden="true" className="al-live-dot" />
              Live · updated {formatUpdated(data.generatedAt)}
            </span>
          ) : null}
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

      <section aria-label="Activity statistics" className="mb-4 grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {statCards.map((card, index) => (
          <StatCard
            count={card.count}
            featured={index === 0}
            icon={card.icon}
            key={card.id}
            note={card.note}
            noteTone={card.noteTone}
            onOpen={card.onOpen}
            shortTitle={card.shortTitle}
            title={card.title}
            tone={card.tone}
          />
        ))}
      </section>

      <section aria-busy={loading} aria-labelledby="activity-heading" className="vh-panel">
        <ActivityFilterBar
          onChange={changeFilter}
          rangeError={dateError}
          users={users}
          values={{ category, from: customFrom, preset, result, role, search: searchDraft, to: customTo, tower, user: userId }}
        />

        <div className="vh-summary">
          <h2 className="vh-h2" id="activity-heading" tabIndex={-1}>
            Events
          </h2>
          <span aria-live="polite" className="vh-countpill">
            {totalCount} {totalCount === 1 ? "event" : "events"}
          </span>
          <span className="vh-rangetext">
            {optionLabel(TOWER_OPTIONS, tower)} · {request.error ? "Check the dates" : `${presetLabel}, ${formatRange(range.from, range.to)}`}
          </span>
          <span className="vh-spacer" />
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.remove} />
          ))}
          {changed ? (
            <button className="vh-textbtn" onClick={resetFilters} type="button">
              Reset filters
            </button>
          ) : null}
        </div>

        {loading && !data ? (
          <div className="p-4 sm:p-6">
            <LoadingState message="Loading the activity log…" />
          </div>
        ) : loadState === "error" && !request.error ? (
          <div className="p-4 sm:p-6">
            <ErrorMessage message={loaded.error} onRetry={() => setRefreshKey((key) => key + 1)} title="Activity log unavailable" />
          </div>
        ) : events.length === 0 ? (
          <div className="vh-empty" role="status">
            <Activity aria-hidden="true" className="vh-empty-icon" size={44} strokeWidth={1.6} />
            <p className="vh-empty-title">No events match these filters</p>
            <span>Try a wider date range or reset the filters.</span>
            <button className="vh-btn vh-btn-outline" onClick={resetFilters} type="button">
              Reset filters
            </button>
          </div>
        ) : (
          <div className={loading ? "vh-busy" : undefined}>
            <ActivityTable events={events} onOpen={openDrawer} selectedId={openEventId} />
          </div>
        )}

        <div className="vh-footer">
          <span className="vh-pageinfo">
            {totalCount ? `Showing ${firstShown}–${lastShown} of ${totalCount} ${totalCount === 1 ? "event" : "events"}` : "No events"}
          </span>

          {totalPages > 1 ? (
            <nav aria-label="Activity log pages" className="vh-pager">
              <button aria-label="Previous page" className="vh-pagebtn" disabled={page <= 1 || loading} onClick={() => updateParams({ event: "", page: page - 1 === 1 ? "" : page - 1 })} type="button">
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.2} />
              </button>
              {getVisiblePages(page, totalPages).map((number) => (
                <button
                  aria-current={number === page ? "page" : undefined}
                  aria-label={`Page ${number} of ${totalPages}`}
                  className="vh-pagebtn"
                  disabled={loading && number !== page}
                  key={number}
                  onClick={() => updateParams({ event: "", page: number === 1 ? "" : number })}
                  type="button"
                >
                  {number}
                </button>
              ))}
              <button aria-label="Next page" className="vh-pagebtn" disabled={page >= totalPages || loading} onClick={() => updateParams({ event: "", page: page + 1 })} type="button">
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2.2} />
              </button>
            </nav>
          ) : null}
        </div>
      </section>

      {openEvent ? <ActivityDrawer event={openEvent} onClose={closeDrawer} /> : null}
    </div>
  );
}
