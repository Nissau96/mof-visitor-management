import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "../styles/visit-history.css";

import { Download, MessageSquareHeart, Send, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AppSelect from "../components/AppSelect.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatCard from "../components/StatCard.jsx";
import { getTowerLabel } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { apiRequest } from "../lib/api.js";
import { downloadCsv } from "../lib/reportExport.js";
import {
  DATE_PRESETS,
  accraToday,
  formatFullDate,
  formatRange,
  formatTime,
  presetRange,
  rangeError,
} from "../lib/visitHistory.js";

// Visitor feedback for administrators and the client service head: what
// visitors said after check-out, from the feedback link sent by SMS.

const CSV_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "reference", label: "Reference" },
  { key: "tower", label: "Tower" },
  { key: "rating", label: "Rating" },
  { key: "comment", label: "Comment" },
];

function Stars({ rating }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating} of 5`}>
      <span className="sr-only">{rating} of 5 stars</span>
      {[1, 2, 3, 4, 5].map((stars) => (
        <Star
          aria-hidden="true"
          className={stars <= rating ? "fill-amber-400 text-amber-500" : "text-slate-300"}
          key={stars}
          size={16}
        />
      ))}
    </span>
  );
}

function Distribution({ summary }) {
  const largest = Math.max(1, ...summary.distribution.map((row) => row.count));

  return (
    <ul className="space-y-2" aria-label="Ratings by number of stars">
      {[...summary.distribution].reverse().map((row) => (
        <li className="flex items-center gap-3 text-sm" key={row.stars}>
          <span className="w-14 shrink-0 font-semibold text-slate-700">{row.stars} star</span>
          <span aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-amber-400"
              style={{ width: `${(row.count / largest) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right tabular-nums text-slate-700">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function StaffFeedbackPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token || "";
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState({ data: null, error: "", key: "" });

  const range = useMemo(() => presetRange(preset, accraToday(), custom), [custom, preset]);
  const dateError = preset === "custom" ? rangeError(range.from, range.to) : "";
  const requestKey = `${range.from}|${range.to}|${refreshKey}|${accessToken}`;
  const loading = !dateError && result.key !== requestKey;

  useEffect(() => {
    if (dateError || !range.from || !range.to) {
      return undefined;
    }

    let active = true;

    apiRequest("/api/staff/feedback", {
      body: JSON.stringify({ dateFrom: range.from, dateTo: range.to }),
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    })
      .then((data) => active && setResult({ data, error: "", key: requestKey }))
      .catch((error) => active && setResult({ data: null, error: error.message, key: requestKey }));

    return () => {
      active = false;
    };
  }, [accessToken, dateError, range.from, range.to, requestKey]);

  const data = result.data;
  const summary = data?.summary;
  const feedback = data?.feedback || [];
  const responseRate = data?.requested ? Math.round((summary.total / data.requested) * 100) : null;

  function exportCsv() {
    downloadCsv(
      `visitor-feedback-${range.from}-to-${range.to}.csv`,
      CSV_COLUMNS,
      feedback.map((row) => ({
        comment: row.comment,
        date: row.submittedAt.slice(0, 10),
        rating: row.rating,
        reference: row.reference,
        time: formatTime(row.submittedAt),
        tower: getTowerLabel(row.tower) || "",
      })),
    );
  }

  return (
    <div className="vh mx-auto w-full max-w-440 px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="vh-titlerow">
        <div className="vh-titlecopy">
          <h1 className="vh-h1">Visitor feedback</h1>
          <p className="vh-lede">
            Ratings and comments visitors sent from the text message link they get after check-out.
          </p>
        </div>
        <div className="vh-actions">
          <button className="vh-btn vh-btn-solid" disabled={!feedback.length} onClick={exportCsv} type="button">
            <Download aria-hidden="true" size={16} />
            Export CSV
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <AppSelect
          appearance="filter"
          className="vh-filter vh-filter-date"
          id="feedback-range"
          label="Date range"
          labelHidden
          listMinWidth={220}
          onChange={setPreset}
          options={DATE_PRESETS}
          value={preset}
        />
        {preset === "custom" ? (
          <>
            <label className="vh-datefield" htmlFor="feedback-from">
              <span>From</span>
              <input id="feedback-from" onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))} type="date" value={custom.from} />
            </label>
            <label className="vh-datefield" htmlFor="feedback-to">
              <span>To</span>
              <input id="feedback-to" onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))} type="date" value={custom.to} />
            </label>
            {dateError ? <span className="vh-error" role="alert">{dateError}</span> : null}
          </>
        ) : null}
        <span className="vh-rangetext">{range.from && range.to ? formatRange(range.from, range.to) : ""}</span>
      </div>

      {loading && !data ? (
        <LoadingState message="Loading visitor feedback…" />
      ) : result.error && result.key === requestKey ? (
        <ErrorMessage message={result.error} onRetry={() => setRefreshKey((key) => key + 1)} title="Feedback unavailable" />
      ) : summary ? (
        <>
          <section aria-label="Feedback summary" className="mb-4 grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3">
            <StatCard
              count={summary.average === null ? "–" : summary.average.toFixed(1)}
              featured
              icon={Star}
              note="Out of 5 stars"
              shortTitle="Average"
              title="Average rating"
            />
            <StatCard
              count={summary.total}
              icon={MessageSquareHeart}
              note={responseRate === null ? "No requests sent" : `${responseRate}% of requests answered`}
              shortTitle="Responses"
              title="Responses"
            />
            <StatCard
              className="max-xl:col-span-2"
              count={data.requested}
              icon={Send}
              note="Feedback links sent by SMS"
              shortTitle="Requests"
              title="Requests sent"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section aria-labelledby="feedback-stars" className="vh-panel p-4 sm:p-6">
              <h2 className="vh-h2 mb-4" id="feedback-stars">
                Ratings
              </h2>
              <Distribution summary={summary} />
            </section>

            <section aria-labelledby="feedback-list" className="vh-panel">
              <div className="vh-summary">
                <h2 className="vh-h2" id="feedback-list">
                  Responses
                </h2>
                <span aria-live="polite" className="vh-countpill">
                  {feedback.length} {feedback.length === 1 ? "response" : "responses"}
                </span>
              </div>
              {feedback.length === 0 ? (
                <div className="vh-empty" role="status">
                  <MessageSquareHeart aria-hidden="true" className="vh-empty-icon" size={44} strokeWidth={1.6} />
                  <p className="vh-empty-title">No feedback in this period</p>
                  <span>Visitors get the link by SMS when reception checks them out.</span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {feedback.map((row) => (
                    <li className="px-4 py-3 sm:px-6" key={row.id}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Stars rating={row.rating} />
                        <span className="text-sm font-semibold text-slate-900">{row.reference}</span>
                        <span className="text-sm text-slate-600">{getTowerLabel(row.tower)}</span>
                        <span className="ml-auto text-xs tabular-nums text-slate-600">
                          {formatFullDate(row.submittedAt)} · {formatTime(row.submittedAt)}
                        </span>
                      </div>
                      {row.comment ? (
                        <p className="mt-1 text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">{row.comment}</p>
                      ) : (
                        <p className="mt-1 text-sm italic text-slate-500">No comment</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
