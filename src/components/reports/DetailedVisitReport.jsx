import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ListPagination from "../ListPagination.jsx";
import { ReferencePill, TableHead } from "../CheckedInVisitorsTable.jsx";
import { getTowerLabel } from "../../constants/visitorOptions.js";
import useReportQuery from "../../hooks/useReportQuery.js";
import { apiRequest } from "../../lib/api.js";
import { formatTime, visitMinutes } from "../../lib/reportBuilders.js";
import { formatMinutes, shortAgency } from "../../lib/reportPeriods.js";

const COLUMNS = [
  "Reference",
  "Visitor",
  "Host / division",
  "Agency",
  "Tower",
  "Check-in",
  "Check-out",
  "Duration",
  "Card",
];

function CardStatus({ visit }) {
  const status = visit.cardStatus;
  const styles = {
    assigned: "bg-brand-50 text-brand-800 ring-brand-200",
    deactivated: "bg-slate-100 text-slate-700 ring-slate-200",
    not_returned: "bg-red-50 text-red-700 ring-red-200",
    returned: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  };
  const labels = {
    assigned: "Assigned",
    deactivated: "Deactivated",
    not_returned: "Not returned",
    returned: "Returned",
  };

  if (!status || !labels[status]) {
    return <span className="text-xs font-semibold text-slate-500">No card</span>;
  }

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// Visit records for the page's period, agency and tower, ten at a time.
// The full filters and record details live in Visit History.
export default function DetailedVisitReport({ accessToken, agency, onAuthError, range, tower }) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const scopeKey = [range.from, range.to, agency, tower].join("|");
  const [lastScope, setLastScope] = useState(scopeKey);

  // A new period, agency or tower starts again on page 1.
  if (lastScope !== scopeKey) {
    setLastScope(scopeKey);
    setPage(1);
  }

  const query = useReportQuery({
    key: accessToken ? [scopeKey, search, page].join("|") : "",
    onAuthError,
    request: (signal) =>
      apiRequest("/api/staff/history", {
        body: JSON.stringify({
          agency,
          dateFrom: range.from,
          dateTo: range.to,
          division: "",
          page,
          pageSize: 10,
          search,
          status: "",
          tower,
        }),
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "POST",
        signal,
      }),
  });

  const visits = Array.isArray(query.data?.visits) ? query.data.visits : [];
  const pagination = query.data?.pagination || { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 };

  return (
    <section
      aria-busy={query.status === "loading"}
      aria-labelledby="detailed-report-heading"
      className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-950" id="detailed-report-heading">
            Detailed visit report
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Visit records for the current filters, with check-in, check-out and duration.
          </p>
        </div>

        <form
          className="relative md:w-80"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
            setPage(1);
          }}
          role="search"
        >
          <label className="sr-only" htmlFor="detailed-report-search">
            Search name, host or reference
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            className="min-h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-950 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
            id="detailed-report-search"
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search name, host or reference"
            type="search"
            value={draft}
          />
        </form>
      </div>

      {query.status === "error" && !visits.length ? (
        <p className="border-t border-slate-200 p-6 text-sm font-semibold text-red-700" role="alert">
          {query.error}
        </p>
      ) : (
        <div
          aria-label="Visit records table"
          className={`relative overflow-x-auto focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200 ${query.status === "loading" ? "opacity-60 transition-opacity" : ""}`}
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">Visit records</caption>
            <TableHead columns={COLUMNS} />
            <tbody className="divide-y divide-slate-200">
              {visits.map((visit) => (
                <tr className="hover:bg-slate-50" key={visit.visitId}>
                  <td className="px-4 py-4">
                    <ReferencePill reference={visit.reference} />
                  </td>
                  <td className="px-4 py-4">
                    <span className="block font-bold text-slate-950">{visit.fullName}</span>
                    <span className="block text-xs text-slate-500">{visit.purpose}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="block font-semibold text-slate-800">{visit.personVisiting || "—"}</span>
                    {visit.division ? (
                      <span className="block text-xs text-slate-500">{visit.division}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    {visit.agency ? (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold text-brand-800 ring-1 ring-brand-600">
                        {shortAgency(visit.agency)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-700">{getTowerLabel(visit.tower)}</td>
                  <td className="whitespace-nowrap px-4 py-4 tabular-nums text-slate-700">
                    {visit.checkedInAt ? formatTime(visit.checkedInAt) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 tabular-nums text-slate-700">
                    {visit.checkedOutAt ? formatTime(visit.checkedOutAt) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 font-bold tabular-nums text-slate-950">
                    {visit.checkedOutAt
                      ? formatMinutes(visitMinutes(visit))
                      : visit.status === "checked_in"
                        ? "On site"
                        : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <CardStatus visit={visit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {query.data && !visits.length ? (
            <p className="border-t border-slate-200 p-6 text-center text-sm text-slate-500">
              No visit matches these filters.
            </p>
          ) : null}
        </div>
      )}

      {pagination.totalCount > 0 ? (
        <ListPagination
          goToPage={(next) => {
            if (next >= 1 && next <= pagination.totalPages) {
              setPage(next);
            }
          }}
          label="Detailed visit report pages"
          noun="visits"
          nounSingular="visit"
          pagination={pagination}
        />
      ) : null}

      <div className="flex justify-end border-t border-slate-200 px-5 py-3 sm:px-6">
        <Link
          className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          state={{ historyFilters: { agency, dateFrom: range.from, dateTo: range.to, search } }}
          to="/staff/history"
        >
          View all in Visit History
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
