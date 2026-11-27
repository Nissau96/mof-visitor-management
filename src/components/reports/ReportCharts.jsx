import { useMemo } from "react";
import EChart from "./EChart.jsx";
import { getTowerLabel, TOWER_1, TOWER_2 } from "../../constants/visitorOptions.js";
import useChartColors from "../../hooks/useChartColors.js";
import {
  agencyOption,
  mixOption,
  purposeOption,
  trendOption,
} from "../../lib/chartOptions.js";
import { formatShortDate, shortAgency } from "../../lib/reportPeriods.js";

// Charts are drawn with Apache ECharts (see lib/chartOptions.js). Their
// colours come from the --chart-* tokens, so they follow the theme.

export function ReportCard({ action, children, className = "", subtitle, title, titleId }) {
  return (
    <section
      aria-labelledby={titleId}
      className={`min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-slate-950" id={titleId}>
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-sm leading-5 text-slate-600">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>

      {children}
    </section>
  );
}

// Screen readers get the numbers as a table instead of the drawing.
function DataTable({ caption, columns, rows }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyChart({ children = "No visits in this period." }) {
  return (
    <p className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-200 text-sm font-semibold text-slate-500">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------- trend

export function VisitsTrendCard({ badge, daily, total }) {
  const peak = daily.reduce(
    (best, day) => (day.visits > (best?.visits ?? -1) ? day : best),
    null,
  );
  const hasVisits = daily.some((day) => day.visits > 0 || day.previous > 0);
  const colors = useChartColors();
  const option = useMemo(() => trendOption(colors, daily), [colors, daily]);

  return (
    <ReportCard
      action={
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {badge}
        </span>
      }
      className="lg:col-span-2"
      subtitle="Visits per day, with the same number of days just before as a dashed line."
      title="Visits over time"
      titleId="report-trend-heading"
    >
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-black tabular-nums text-slate-950">{total}</span>
        <span className="text-sm font-semibold text-slate-600">
          visits
          {peak && peak.visits > 0
            ? ` · peak ${formatShortDate(peak.date)} with ${peak.visits}`
            : ""}
        </span>
      </p>

      <div className="mt-4 h-64">
        {hasVisits ? <EChart className="size-full" option={option} /> : <EmptyChart />}
      </div>

      <DataTable
        caption="Visits per day"
        columns={["Date", "Visits", "Previous period"]}
        rows={daily.map((day) => [formatShortDate(day.date), day.visits, day.previous])}
      />
    </ReportCard>
  );
}

// ---------------------------------------------------------------- towers

function VisitorMix({ newVisitors, returningVisitors }) {
  const colors = useChartColors();
  const data = useMemo(
    () => [
      { colorKey: "primary", fill: "var(--chart-primary)", name: "Returning", value: returningVisitors },
      { colorKey: "secondary", fill: "var(--chart-secondary)", name: "First-time", value: newVisitors },
    ],
    [newVisitors, returningVisitors],
  );
  const option = useMemo(() => mixOption(colors, data), [colors, data]);
  const total = newVisitors + returningVisitors;

  return (
    <div className="@container mt-6 border-t border-slate-200 pt-5">
      <h3 className="text-sm font-black text-slate-950">First-time vs returning</h3>

      <div className="mt-4 flex flex-col items-center gap-5 @sm:flex-row @sm:gap-6">
        {/* The total sits under the chart, so the chart's tooltip
            draws over it rather than behind it. */}
        <div aria-hidden="true" className="relative size-40 shrink-0">
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="text-2xl font-black leading-none tabular-nums text-slate-950">{total}</span>
            <span className="mt-1 text-[11px] font-semibold text-slate-500">
              {total === 1 ? "visitor" : "visitors"}
            </span>
          </div>
          {total > 0 ? (
            <EChart className="absolute inset-0" option={option} />
          ) : (
            <div className="absolute inset-[3%] rounded-full border-[18px] border-slate-100" />
          )}
        </div>

        <ul className="grid w-full min-w-0 flex-1 gap-4 text-sm">
          {data.map((slice) => {
            const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;

            return (
              <li key={slice.name}>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: slice.fill }} />
                  <span className="font-semibold text-slate-700">{slice.name}</span>
                  <span className="ml-auto font-black tabular-nums text-slate-950">{slice.value}</span>
                  <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-500">
                    {percent}%
                  </span>
                </div>
                <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ background: slice.fill, width: `${percent}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function TowerCard({ busiestDay, totals, towerScope, towers }) {
  const towerOne = towers.find((row) => row.tower === TOWER_1)?.visits || 0;
  const towerTwo = towers.find((row) => row.tower === TOWER_2)?.visits || 0;
  const both = towerOne + towerTwo;
  const share = both ? Math.round((towerOne / both) * 100) : 50;

  return (
    <ReportCard
      subtitle={
        towerScope
          ? "Visits in this tower for the period."
          : "Share of visits in this period."
      }
      title={towerScope ? `${getTowerLabel(towerScope)} visitors` : "Tower 1 vs Tower 2"}
      titleId="report-tower-heading"
    >
      {towerScope ? (
        <div className="mt-4 rounded-2xl bg-brand-50 p-4 dark:bg-[#0b2b29]">
          <p className="text-3xl font-black tabular-nums text-slate-950">{totals.visits ?? 0}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {Number(totals.visits) === 1 ? "visit" : "visits"} in this period
            {busiestDay ? ` · busiest ${formatShortDate(busiestDay.date)}` : ""}
          </p>
        </div>
      ) : (
        <>
          <div
            aria-label={`Tower 1 ${share}%, Tower 2 ${both ? 100 - share : 50}%`}
            className="mt-4 flex h-9 overflow-hidden rounded-xl text-xs font-black"
            role="img"
          >
            <div
              className="flex items-center bg-(--chart-primary) px-3 text-[#ffffff] dark:text-[#0b1220]"
              style={{ width: `${Math.max(share, 12)}%` }}
            >
              {both ? `${share}%` : "—"}
            </div>
            <div className="flex flex-1 items-center justify-end bg-(--chart-secondary) px-3 text-[#134e4a] dark:text-[#ccfbf1]">
              {both ? `${100 - share}%` : "—"}
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3">
            {[
              { color: "bg-(--chart-primary)", label: "Tower 1", value: towerOne },
              { color: "bg-(--chart-secondary)", label: "Tower 2", value: towerTwo },
            ].map((tower) => (
              <div className="rounded-2xl bg-slate-50 p-3" key={tower.label}>
                <dt className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <span aria-hidden="true" className={`size-2.5 rounded-sm ${tower.color}`} />
                  {tower.label}
                </dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-slate-950">
                  {tower.value}
                  <span className="ml-1 text-xs font-semibold text-slate-500">visits</span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <VisitorMix
        newVisitors={Number(totals.newVisitors) || 0}
        returningVisitors={Number(totals.returningVisitors) || 0}
      />
    </ReportCard>
  );
}

// ---------------------------------------------------------------- agencies

export function AgencyCard({ agencies }) {
  const colors = useChartColors();
  const data = useMemo(
    () => agencies.map((row) => ({ ...row, label: shortAgency(row.agency) })),
    [agencies],
  );
  const option = useMemo(() => agencyOption(colors, data), [colors, data]);

  return (
    <ReportCard
      subtitle={`${agencies.length} ${agencies.length === 1 ? "agency" : "agencies"}, most visited first.`}
      title="Visits by agency"
      titleId="report-agency-heading"
    >
      <div className="mt-4" style={{ height: Math.max(160, data.length * 30 + 8) }}>
        {data.length ? <EChart className="size-full" option={option} /> : <EmptyChart />}
      </div>

      <DataTable
        caption="Visits by agency"
        columns={["Agency", "Visits"]}
        rows={agencies.map((row) => [row.agency, row.visits])}
      />
    </ReportCard>
  );
}

// ---------------------------------------------------------------- purposes

export function PurposeCard({ purposes }) {
  const colors = useChartColors();
  const option = useMemo(() => purposeOption(colors, purposes), [colors, purposes]);

  return (
    <ReportCard
      subtitle="Why people came in this period."
      title="Purpose of visit"
      titleId="report-purpose-heading"
    >
      <div className="mt-4 h-64">
        {purposes.length ? <EChart className="size-full" option={option} /> : <EmptyChart />}
      </div>

      <DataTable
        caption="Visits by purpose"
        columns={["Purpose", "Visits"]}
        rows={purposes.map((row) => [row.purpose, row.visits])}
      />
    </ReportCard>
  );
}
