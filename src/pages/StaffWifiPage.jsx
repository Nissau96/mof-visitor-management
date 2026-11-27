import {
  CircleCheck,
  CircleX,
  Clock,
  RefreshCw,
  Wifi,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { OUTLINE_BUTTON } from "../components/AdminRecords.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SegmentedButton from "../components/SegmentedButton.jsx";
import StatCard from "../components/StatCard.jsx";
import WifiGrantDialog from "../components/WifiGrantDialog.jsx";
import WifiRequestRow from "../components/WifiRequestRow.jsx";
import useAuth from "../hooks/useAuth.js";
import { ApiError } from "../lib/api.js";
import { toast } from "../lib/toast.js";
import {
  getWifiPassword,
  getWifiRequests,
  grantWifiAccess,
  resendWifiDetails,
  updateWifiRequest,
  WIFI_CHANGED_EVENT,
} from "../lib/wifiApi.js";

const POLL_INTERVAL_MS = 60_000;

const VIEWS = Object.freeze([
  Object.freeze({
    empty: "No one has asked for WiFi today.",
    label: "Today",
    value: "today",
  }),
  Object.freeze({
    empty: "No upcoming meetings have asked for WiFi.",
    label: "Upcoming",
    value: "upcoming",
  }),
  Object.freeze({
    empty: "No WiFi requests in the last 30 days.",
    label: "History (30 days)",
    value: "history",
  }),
]);

const FILTERS = Object.freeze([
  Object.freeze({ dot: null, label: "All", value: "all" }),
  Object.freeze({ dot: "bg-[#f59e0b]", label: "Waiting", value: "waiting" }),
  Object.freeze({ dot: "bg-[#10b981]", label: "Access given", value: "given" }),
  Object.freeze({ dot: "bg-[#ef4444]", label: "Not given", value: "not_given" }),
]);

const DECISION_TOASTS = Object.freeze({
  given: "Recorded as access given",
  not_given: "Recorded as not given",
  waiting: "Moved back to waiting",
});

const slipFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "long",
  timeZone: "Africa/Accra",
  weekday: "long",
});

function countBy(entries, status) {
  return entries.filter((entry) => entry.status === status).length;
}

function plural(count, one, many) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function nameOf(entry) {
  return entry.type === "meeting" ? entry.title : entry.fullName;
}

// Printed on the IT computer's printer and handed to the visitor. Only
// the slip prints; the page around it is hidden from print.
function WifiSlip({ slip }) {
  if (!slip) {
    return null;
  }

  return (
    <section aria-hidden="true" className="hidden text-[#0f172a] print:block">
      <div className="mx-auto max-w-md rounded-2xl border-2 border-[#0f766e] p-8">
        <p className="text-xs font-bold tracking-[0.12em] text-[#0f766e]">MINISTRY OF FINANCE</p>
        <h1 className="mt-2 text-2xl font-black">Guest WiFi</h1>
        <p className="mt-1 text-sm">For {slip.name}</p>
        <dl className="mt-6 grid gap-4">
          <div>
            <dt className="text-xs font-semibold text-[#475569]">Network</dt>
            <dd className="text-xl font-bold">{slip.networkName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#475569]">Password</dt>
            <dd className="font-mono text-2xl font-bold tracking-wide">{slip.password}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#475569]">Valid until</dt>
            <dd className="font-bold">{slipFormat.format(new Date(slip.expiresAt))}</dd>
          </div>
        </dl>
        <p className="mt-6 text-xs text-[#475569]">Please do not share this password.</p>
      </div>
    </section>
  );
}

export default function StaffWifiPage() {
  const { session, signOut } = useAuth();
  const accessToken = session?.access_token || "";

  const [view, setView] = useState("today");
  const [filter, setFilter] = useState("all");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [savingId, setSavingId] = useState("");
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const [slip, setSlip] = useState(null);

  const endExpiredSession = useCallback(() => {
    void signOut().catch(() => undefined);
  }, [signOut]);

  // Loads the view now, then every minute while the tab is visible, so
  // new walk-in requests appear without a manual refresh.
  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    let controller = null;
    let timer = null;

    function load(showLoading) {
      controller?.abort();
      controller = new AbortController();

      if (showLoading) {
        setStatus("loading");
      }

      getWifiRequests({ accessToken, signal: controller.signal, view })
        .then((data) => {
          if (!Array.isArray(data?.entries)) {
            throw new Error("WiFi requests could not be loaded. Please try again.");
          }

          setResult(data);
          setStatus("ready");
          setLoadError("");
        })
        .catch((error) => {
          if (error?.name === "AbortError") {
            return;
          }

          if (error instanceof ApiError && error.status === 401) {
            endExpiredSession();
            return;
          }

          setStatus("error");
          setLoadError(
            error?.message || "WiFi requests could not be loaded. Please try again.",
          );
        });
    }

    function sync() {
      window.clearInterval(timer);
      timer = null;

      if (document.visibilityState === "visible") {
        timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);
      }
    }

    load(true);
    sync();
    document.addEventListener("visibilitychange", sync);

    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [accessToken, endExpiredSession, reloadKey, view]);

  // Print once the slip is on the page.
  useEffect(() => {
    if (!slip) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => window.print());
    return () => window.cancelAnimationFrame(frame);
  }, [slip]);

  const currentView = VIEWS.find((option) => option.value === view);
  const entries = useMemo(
    () => (result?.view === view ? result.entries : []),
    [result, view],
  );
  const shown = filter === "all"
    ? entries
    : entries.filter((entry) => entry.status === filter);

  const waiting = countBy(entries, "waiting");
  const given = countBy(entries, "given");
  const notGiven = countBy(entries, "not_given");
  const cancelled = countBy(entries, "cancelled");
  const loaded = status === "ready" && result?.view === view;
  const settings = result?.settings;

  function updateEntry(entry, changes) {
    setResult((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((item) =>
              item.id === entry.id && item.type === entry.type
                ? { ...item, ...changes }
                : item,
            ),
          }
        : current,
    );
  }

  function handleError(error, title, fallback) {
    if (error instanceof ApiError && error.status === 401) {
      endExpiredSession();
      return;
    }

    toast.error(title, error?.message || fallback);

    if (error instanceof ApiError && error.status === 404) {
      setReloadKey((key) => key + 1);
    }
  }

  async function decide(entry, nextStatus, note) {
    setSavingId(entry.id);

    try {
      const saved = await updateWifiRequest({
        accessToken,
        id: entry.id,
        note,
        status: nextStatus,
        type: entry.type,
      });

      updateEntry(entry, {
        decidedAt: saved.decidedAt ?? null,
        decidedByName: saved.decidedByName ?? null,
        note: saved.note ?? null,
        status: saved.status,
        ...(saved.status === "given"
          ? {}
          : { expiresAt: null, hasPassword: false, sentBy: [] }),
      });

      window.dispatchEvent(new Event(WIFI_CHANGED_EVENT));
      toast.success(
        nextStatus === entry.status ? "Note saved" : DECISION_TOASTS[nextStatus],
        nameOf(entry),
      );

      return true;
    } catch (error) {
      handleError(error, "Not saved", "The WiFi request could not be updated. Please try again.");
      return false;
    } finally {
      setSavingId("");
    }
  }

  function printSlip(entry, { expiresAt, networkName, password }) {
    setSlip({
      expiresAt,
      name: nameOf(entry),
      networkName: networkName || settings?.networkNames?.[entry.tower] || "MoF-Guest",
      password,
    });
  }

  function reportProblems(problems = []) {
    if (problems.length) {
      toast.warning("Not everything was sent", problems.join(" "));
    }
  }

  async function submitDialog({ channels, duration, password }) {
    const { entry, mode } = dialog;

    setSavingId(entry.id);
    setDialogError("");

    try {
      if (mode === "resend") {
        const sent = await resendWifiDetails({
          accessToken,
          channels,
          id: entry.id,
          tower: entry.tower || "",
          type: entry.type,
        });

        updateEntry(entry, { sentBy: sent.sentBy || entry.sentBy });

        if (channels.includes("print") && sent.password) {
          printSlip(entry, sent);
        }

        setDialog(null);
        toast.success("WiFi details sent again", nameOf(entry));
        reportProblems(sent.problems);
        return;
      }

      const granted = await grantWifiAccess({
        accessToken,
        channels,
        date: entry.date,
        duration,
        id: entry.id,
        note: "",
        password,
        tower: entry.tower || "",
        type: entry.type,
      });

      // The Waiting card's "today and ahead" note drops by one.
      if (entry.status === "waiting") {
        setResult((current) =>
          current && Number.isInteger(current.waitingCount)
            ? { ...current, waitingCount: Math.max(0, current.waitingCount - 1) }
            : current,
        );
      }

      updateEntry(entry, {
        decidedAt: granted.decidedAt ?? null,
        decidedByName: granted.decidedByName ?? null,
        expiresAt: granted.expiresAt,
        hasPassword: true,
        note: granted.note ?? null,
        sentBy: granted.sentBy || [],
        status: "given",
      });

      if (channels.includes("print")) {
        printSlip(entry, { ...granted, password });
      }

      setDialog(null);
      window.dispatchEvent(new Event(WIFI_CHANGED_EVENT));
      toast.success("WiFi access granted", nameOf(entry));
      reportProblems(granted.problems);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        endExpiredSession();
        return;
      }

      setDialogError(error?.message || "WiFi access could not be granted. Please try again.");
    } finally {
      setSavingId("");
    }
  }

  async function showPassword(entry) {
    try {
      const secret = await getWifiPassword({ accessToken, id: entry.id, tower: entry.tower || "", type: entry.type });
      return secret.password || "";
    } catch (error) {
      handleError(error, "Password unavailable", "The password could not be shown.");

      if (error instanceof ApiError && error.status === 404) {
        updateEntry(entry, { hasPassword: false });
      }

      return "";
    }
  }

  const statCards = [
    {
      count: loaded ? waiting.toLocaleString() : undefined,
      featured: true,
      icon: Clock,
      id: "waiting",
      note: Number.isInteger(result?.waitingCount)
        ? `${plural(result.waitingCount, "request", "requests")} waiting today and ahead`
        : "Today and ahead",
      shortTitle: "Waiting",
      title: "Waiting",
    },
    {
      count: loaded ? given.toLocaleString() : undefined,
      icon: CircleCheck,
      id: "given",
      note: currentView.label,
      noteTone: "brand",
      shortTitle: "Given",
      title: "Access given",
    },
    {
      count: loaded ? notGiven.toLocaleString() : undefined,
      icon: CircleX,
      id: "not-given",
      note: cancelled
        ? plural(cancelled, "cancelled by organiser", "cancelled by organiser")
        : currentView.label,
      noteTone: cancelled ? "red" : "neutral",
      shortTitle: "Not given",
      title: "Not given",
    },
  ];

  return (
    <>
      <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0 print:hidden">
        <header className="flex flex-col gap-4 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              WiFi Access
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">
              Grant guest WiFi to visitors who ask at reception. Paste the
              password from the WiFi system, choose how long it lasts, and send
              it by SMS, email or a printed slip.
            </p>
          </div>

          <button
            className={OUTLINE_BUTTON}
            disabled={status === "loading"}
            onClick={() => setReloadKey((key) => key + 1)}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${status === "loading" ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </header>

        <section
          aria-label="WiFi request totals"
          className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {statCards.map((card, index) => (
            <StatCard
              className={index === 2 ? "md:col-span-2 lg:col-span-1" : ""}
              count={card.count}
              featured={card.featured}
              icon={card.icon}
              key={card.id}
              note={card.note}
              noteTone={card.noteTone}
              shortTitle={card.shortTitle}
              title={card.title}
            />
          ))}
        </section>

        <section
          aria-busy={status === "loading"}
          aria-labelledby="wifi-requests-heading"
          className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-[#f0fdfa] text-[#0f766e] dark:bg-[#0b2b29]! dark:text-[#5eead4]!">
                  <Wifi className="size-5" />
                </span>
                <h2 className="text-xl font-black text-slate-950" id="wifi-requests-heading">
                  Requests
                </h2>
                {loaded ? (
                  <p aria-live="polite" className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">
                    {plural(entries.length, "request", "requests")}
                  </p>
                ) : null}
              </div>

              <div
                aria-label="Requests to show"
                className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1"
                role="group"
              >
                {VIEWS.map((option) => (
                  <SegmentedButton
                    active={view === option.value}
                    aria-pressed={view === option.value}
                    key={option.value}
                    onClick={() => {
                      setView(option.value);
                      setFilter("all");
                    }}
                  >
                    {option.label}
                  </SegmentedButton>
                ))}
              </div>
            </div>

            <div aria-label="Filter by status" className="flex flex-wrap gap-2" role="group">
              {FILTERS.map((option) => {
                const active = filter === option.value;
                const count =
                  option.value === "all"
                    ? entries.length
                    : countBy(entries, option.value);

                return (
                  <button
                    aria-pressed={active}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:ring-4 focus-visible:ring-brand-200 ${
                      active
                        ? "border-[#115e59] bg-[#115e59] text-[#ffffff]"
                        : "border-slate-200 bg-white text-slate-800 hover:border-brand-200 hover:bg-brand-50"
                    }`}
                    key={option.value}
                    onClick={() => setFilter(option.value)}
                    type="button"
                  >
                    {option.dot ? (
                      <span aria-hidden="true" className={`size-2 rounded-full ${option.dot}`} />
                    ) : null}
                    {option.label}
                    {loaded ? (
                      <span
                        className={`grid min-w-6 place-items-center rounded-full px-1.5 text-xs tabular-nums ${
                          active
                            ? "bg-[#ffffff] text-[#115e59]"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {status === "loading" && !loaded ? (
            <div className="p-6">
              <LoadingState message="Loading WiFi requests…" />
            </div>
          ) : null}

          {status === "error" ? (
            <div className="p-6">
              <ErrorMessage
                message={loadError}
                onRetry={() => setReloadKey((key) => key + 1)}
                title="WiFi requests unavailable"
              />
            </div>
          ) : null}

          {loaded && shown.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-800">
                <Wifi className="size-6" />
              </span>
              <p className="font-black text-slate-950">
                {filter === "all" ? currentView.empty : "Nothing matches this filter."}
              </p>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                {filter === "all"
                  ? "New requests appear here when visitors register or a meeting asks for WiFi. The list refreshes every minute."
                  : "Choose All to see every request in this view."}
              </p>
            </div>
          ) : null}

          {loaded && shown.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {shown.map((entry) => (
                <WifiRequestRow
                  busy={savingId === entry.id}
                  entry={entry}
                  key={`${entry.type}-${entry.id}`}
                  onDecide={decide}
                  onGrant={(target) => {
                    setDialogError("");
                    setDialog({ entry: target, mode: "grant" });
                  }}
                  onResend={(target) => {
                    setDialogError("");
                    setDialog({ entry: target, mode: "resend" });
                  }}
                  onShowPassword={showPassword}
                />
              ))}
            </ul>
          ) : null}
        </section>

        {dialog ? (
          <WifiGrantDialog
            busy={savingId === dialog.entry.id}
            entry={dialog.entry}
            error={dialogError}
            mode={dialog.mode}
            onCancel={() => setDialog(null)}
            onSubmit={(values) => void submitDialog(values)}
            settings={settings}
          />
        ) : null}
      </div>

      <WifiSlip slip={slip} />
    </>
  );
}
