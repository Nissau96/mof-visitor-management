import { CalendarRange, RotateCcw } from "lucide-react";
import AppSelect from "../AppSelect.jsx";
import ExportButtons from "./ExportButtons.jsx";
import { AGENCY_FILTER_OPTIONS } from "../../constants/selectOptions.js";
import { getTowerLabel } from "../../constants/visitorOptions.js";
import { buildCsuTable, monthLabel } from "../../lib/reportBuilders.js";
import { shortAgency } from "../../lib/reportPeriods.js";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  label: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, index, 1)),
  ),
  value: String(index + 1),
}));

function yearOptions(currentYear) {
  return Array.from({ length: currentYear - 2024 + 1 }, (_, index) => {
    const year = String(currentYear - index);

    return { label: year, value: year };
  });
}

// Client Service Unit monthly report: visits by purpose for each
// Monday-to-Friday week of a month, with the busiest week of each
// purpose highlighted.
export default function CsuMonthlyReport({
  busy,
  currentYear,
  filters,
  onChange,
  onExport,
  onReset,
  query,
  tower,
}) {
  const table = query.data ? buildCsuTable(query.data) : null;
  const loading = query.status === "loading";
  const label = monthLabel(Number(filters.year), Number(filters.month));
  const agencyLabel = filters.agency ? shortAgency(filters.agency) : "All agencies";

  return (
    <section
      aria-busy={loading}
      aria-labelledby="csu-report-heading"
      className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800"
          >
            <CalendarRange className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-slate-950" id="csu-report-heading">
              Client Service Unit monthly report
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Visits by purpose, broken down by week of the month.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
            {label} · {agencyLabel} · {tower ? getTowerLabel(tower) : "both towers"}
          </span>
          <ExportButtons
            busy={busy}
            id="csu-month"
            name="the Client Service Unit monthly report"
            onExport={onExport}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-y border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:px-6">
        <AppSelect
          className="sm:w-40"
          id="csu-month"
          label="Month"
          labelClassName="mb-1.5 block text-xs font-bold text-slate-700"
          onChange={(value) => onChange({ month: value })}
          options={MONTH_OPTIONS}
          size="xl"
          value={filters.month}
        />
        <AppSelect
          className="sm:w-32"
          id="csu-year"
          label="Year"
          labelClassName="mb-1.5 block text-xs font-bold text-slate-700"
          onChange={(value) => onChange({ year: value })}
          options={yearOptions(currentYear)}
          size="xl"
          value={filters.year}
        />
        <AppSelect
          className="sm:w-72"
          id="csu-agency"
          label="Agency"
          labelClassName="mb-1.5 block text-xs font-bold text-slate-700"
          onChange={(value) => onChange({ agency: value })}
          options={AGENCY_FILTER_OPTIONS}
          size="xl"
          value={filters.agency}
        />
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:ml-auto"
          onClick={onReset}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Reset
        </button>
      </div>

      {query.status === "error" && !table ? (
        <p className="p-6 text-sm font-semibold text-red-700" role="alert">
          {query.error}
        </p>
      ) : !table ? (
        <p className="p-6 text-sm text-slate-500">Loading the monthly report…</p>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          <dl className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
            <div className="flex items-baseline gap-2 rounded-2xl bg-brand-50 px-4 py-2 dark:bg-[#0b2b29]">
              <dt className="sr-only">Visits in the month</dt>
              <dd className="text-xl font-black tabular-nums text-slate-950">
                {table.total}
                <span aria-hidden="true" className="ml-2 text-xs font-semibold text-slate-600">
                  visits in the month
                </span>
              </dd>
            </div>
            {table.busiest ? (
              <div className="flex items-baseline gap-2 rounded-2xl bg-slate-100 px-4 py-2">
                <dt className="text-xs font-semibold text-slate-600 sm:order-2">busiest week</dt>
                <dd className="text-sm font-black text-slate-950 sm:order-1">
                  {table.busiest.label} ({table.busiest.count})
                </dd>
              </div>
            ) : null}
            {table.top && table.top.count > 0 ? (
              <div className="flex items-baseline gap-2 rounded-2xl bg-slate-100 px-4 py-2">
                <dt className="text-xs font-semibold text-slate-600 sm:order-2">top purpose</dt>
                <dd className="text-sm font-black text-slate-950 sm:order-1">
                  {table.top.purpose} ({table.top.count})
                </dd>
              </div>
            ) : null}
          </dl>

          <div
            aria-label="Visits by purpose and week"
            className="relative overflow-x-auto focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">
                Visits by purpose and week, {label}. The busiest week of each purpose is highlighted.
              </caption>
              <thead className="border-y border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left sm:px-6" scope="col">Purpose</th>
                  {table.weeks.map((week) => (
                    <th
                      className={`px-3 py-3 text-right ${
                        table.busiest?.label === week.label ? "bg-brand-50 text-brand-800 dark:bg-[#0b2b29]" : ""
                      }`}
                      key={week.week}
                      scope="col"
                    >
                      {week.label}
                      <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-500">
                        {week.range}
                      </span>
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right sm:px-6" scope="col" colSpan={2}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {table.rows.map((row) => (
                  <tr className="hover:bg-slate-50" key={row.purpose}>
                    <th className="px-5 py-3.5 text-left font-normal sm:px-6" scope="row">
                      <span className="block font-bold text-slate-950">{row.purpose}</span>
                      {row.line ? (
                        <span className="block text-xs text-slate-500">Report line: {row.line}</span>
                      ) : null}
                    </th>
                    {row.counts.map((count, index) => (
                      <td className="px-3 py-3.5 text-right tabular-nums" key={index}>
                        <span
                          className={
                            index === row.peakIndex
                              ? "inline-flex min-w-9 justify-end rounded-lg bg-[#ccfbf1] px-2 py-0.5 font-black text-[#115e59] dark:bg-[#134e4a] dark:text-[#ccfbf1]"
                              : count === 0
                                ? "text-slate-400"
                                : "text-slate-700"
                          }
                        >
                          {count}
                        </span>
                      </td>
                    ))}
                    <td className="py-3.5 pl-3 text-right">
                      <span className="inline-flex w-24 items-center justify-end gap-3">
                        <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-(--chart-primary)" style={{ width: `${row.share}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right sm:px-6">
                      <span className="font-black tabular-nums text-slate-950">{row.total}</span>
                      <span className="ml-2 inline-block w-8 text-xs tabular-nums text-slate-500">{row.share}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-brand-50 font-black text-slate-950 dark:bg-[#0b2b29]">
                <tr>
                  <th className="px-5 py-3.5 text-left sm:px-6" scope="row">Total</th>
                  {table.weekTotals.map((count, index) => (
                    <td className="px-3 py-3.5 text-right tabular-nums" key={index}>{count}</td>
                  ))}
                  <td />
                  <td className="px-5 py-3.5 text-right tabular-nums sm:px-6">{table.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:px-6">
            Weeks run Monday to Friday. A week belongs to the month its Monday falls in; weekend visits count in the week before.
          </p>
        </div>
      )}
    </section>
  );
}
