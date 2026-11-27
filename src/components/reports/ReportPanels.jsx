import { formatMinutes } from "../../lib/reportPeriods.js";
import { ReportCard } from "./ReportCharts.jsx";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const HEAT_LEVELS = [
  "bg-(--chart-heat-0)",
  "bg-(--chart-heat-1)",
  "bg-(--chart-heat-2)",
  "bg-(--chart-heat-3)",
  "bg-(--chart-heat-4)",
  "bg-(--chart-heat-5)",
];

function hourLabel(hour) {
  if (hour === 12) {
    return "12pm";
  }

  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function shortHour(hour) {
  if (hour === 8) {
    return "8am";
  }

  if (hour === 13) {
    return "1pm";
  }

  return String(hour > 12 ? hour - 12 : hour);
}

// ---------------------------------------------------------------- heatmap

// The weekday or hour with the most arrivals: { day|hour, visits }.
function peakOf(heatmap, key) {
  const totals = new Map();

  heatmap.forEach((cell) => {
    totals.set(cell[key], (totals.get(cell[key]) || 0) + cell.visits);
  });

  let best = null;

  totals.forEach((visits, value) => {
    if (visits > (best?.visits ?? 0)) {
      best = { [key]: value, visits };
    }
  });

  return best;
}

export function BusiestHoursCard({ heatmap }) {
  const lookup = new Map(heatmap.map((cell) => [`${cell.day}-${cell.hour}`, cell.visits]));
  const max = Math.max(0, ...heatmap.map((cell) => cell.visits));
  const busiest = heatmap.reduce(
    (best, cell) => (cell.visits > (best?.visits ?? 0) ? cell : best),
    null,
  );

  const total = heatmap.reduce((sum, cell) => sum + cell.visits, 0);
  const busiestDay = peakOf(heatmap, "day");
  const busiestHour = peakOf(heatmap, "hour");

  function level(visits) {
    if (!visits || !max) {
      return 0;
    }

    return Math.max(1, Math.ceil((visits / max) * 5));
  }

  return (
    <ReportCard
      action={
        <div aria-hidden="true" className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-500 sm:flex">
          Fewer
          {HEAT_LEVELS.slice(1).map((color) => (
            <span className={`size-3 rounded-[4px] ${color}`} key={color} />
          ))}
          More
        </div>
      }
      className="lg:col-span-2"
      subtitle={
        busiest
          ? `Arrivals by weekday and hour. Busiest slot: ${WEEKDAYS[busiest.day - 1]} ${hourLabel(busiest.hour)}.`
          : "Arrivals by weekday and hour, 8am to 6pm."
      }
      title="Busiest hours"
      titleId="report-hours-heading"
    >
      <div
        aria-label="Busiest hours table"
        className="relative mt-4 overflow-x-auto rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[30rem] table-fixed border-separate border-spacing-1 text-xs">
          <caption className="sr-only">
            Visitor arrivals by weekday (rows) and hour of the day (columns).
          </caption>
          <thead>
            <tr>
              <td className="w-12" />
              {HOURS.map((hour) => (
                <th className="pb-1 text-center font-semibold text-slate-500" key={hour} scope="col">
                  <span aria-hidden="true">{shortHour(hour)}</span>
                  <span className="sr-only">{hourLabel(hour)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day, dayIndex) => (
              <tr key={day}>
                <th className="pr-2 text-left font-bold text-slate-700" scope="row">
                  <span aria-hidden="true">{day}</span>
                  <span className="sr-only">{WEEKDAY_NAMES[dayIndex]}</span>
                </th>
                {HOURS.map((hour) => {
                  const visits = lookup.get(`${dayIndex + 1}-${hour}`) || 0;

                  return (
                    <td
                      className={`h-8 rounded-md text-center ${HEAT_LEVELS[level(visits)]}`}
                      key={hour}
                      title={`${WEEKDAY_NAMES[dayIndex]} ${hourLabel(hour)}: ${visits} ${visits === 1 ? "arrival" : "arrivals"}`}
                    >
                      <span className="sr-only">{visits}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 flex flex-wrap gap-2 text-sm">
        {[
          ["Busiest day", busiestDay ? `${WEEKDAY_NAMES[busiestDay.day - 1]} (${busiestDay.visits})` : "—"],
          ["Busiest hour", busiestHour ? `${hourLabel(busiestHour.hour)} (${busiestHour.visits})` : "—"],
          ["Weekday arrivals", String(total)],
        ].map(([term, value]) => (
          <div className="flex items-baseline gap-2 rounded-2xl bg-slate-100 px-3 py-1.5" key={term}>
            <dt className="text-xs font-semibold text-slate-600">{term}</dt>
            <dd className="font-black tabular-nums text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
    </ReportCard>
  );
}

// ---------------------------------------------------------------- operations

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function OperationsCard({ cards, hosts, totals }) {
  const assigned = Number(cards?.assigned) || 0;
  const available = Number(cards?.available) || 0;
  const incidents = Number(cards?.incidents) || 0;
  const inventory = assigned + available + incidents;
  const width = (value) => `${inventory ? (value / inventory) * 100 : 0}%`;

  return (
    <ReportCard
      subtitle="Cards, visit length and waiting."
      title="Reception operations"
      titleId="report-operations-heading"
    >
      <h3 className="mt-4 text-sm font-black text-slate-950">Visitor card use</h3>
      <div
        aria-label={`${assigned} assigned, ${available} available, ${incidents} with incidents`}
        className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
      >
        <span className="bg-(--chart-primary)" style={{ width: width(assigned) }} />
        <span className="bg-(--chart-soft)" style={{ width: width(available) }} />
        <span className="bg-amber-500" style={{ width: width(incidents) }} />
      </div>
      <p aria-hidden="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        <span>
          <b className="font-black text-[#0f766e] dark:text-[#5eead4]">{assigned}</b> assigned
        </span>
        <span>
          <b className="font-black text-slate-950">{available}</b> available
        </span>
        <span>
          <b className="font-black text-amber-700 dark:text-[#fcd34d]">{incidents}</b> with incidents
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 p-3">
          <dt className="text-xs font-semibold text-slate-500">Longest visit</dt>
          <dd className="mt-1 text-lg font-black tabular-nums text-slate-950">
            {formatMinutes(totals.longestDurationMinutes)}
          </dd>
        </div>
        <div className="rounded-2xl border border-slate-200 p-3">
          <dt className="text-xs font-semibold text-slate-500">Average wait to admit</dt>
          <dd className="mt-1 text-lg font-black tabular-nums text-slate-950">
            {formatMinutes(totals.averageWaitMinutes)}
          </dd>
        </div>
      </dl>

      <h3 className="mt-5 text-sm font-black text-slate-950">Most visited hosts</h3>
      {hosts.length ? (
        <ol className="mt-2 grid gap-2.5">
          {hosts.map((host) => (
            <li className="flex items-center gap-3" key={`${host.name}-${host.division}`}>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-black text-[#0f766e] ring-1 ring-brand-200 dark:bg-[#0b2b29] dark:text-[#5eead4] dark:ring-[#14756d]"
              >
                {initials(host.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-950">{host.name}</span>
                {host.division ? (
                  <span className="block truncate text-xs text-slate-500">{host.division}</span>
                ) : null}
              </span>
              <span className="text-sm font-black tabular-nums text-slate-950">
                {host.visits}
                <span className="sr-only"> visits</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No host recorded in this period.</p>
      )}
    </ReportCard>
  );
}
