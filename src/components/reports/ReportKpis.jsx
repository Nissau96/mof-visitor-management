import {
  ArrowUpRight,
  Clock3,
  CreditCard,
  LogOut,
  RefreshCcw,
  UserCheck,
  UserPlus,
  Users,
  ClipboardList,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatMinutes, percentChange } from "../../lib/reportPeriods.js";

function DeltaChip({ change, featured }) {
  if (change === null) {
    return null;
  }

  const up = change > 0;
  const flat = change === 0;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums ${
        featured
          ? "bg-[#ffffff26] text-[#ffffff]"
          : flat
            ? "bg-slate-100 text-slate-700"
            : up
              ? "bg-brand-50 text-brand-800"
              : "bg-red-50 text-red-700"
      }`}
    >
      {up ? "+" : ""}
      {change}%
      <span className="sr-only"> compared with the previous period</span>
    </span>
  );
}

function KpiCard({ change, featured = false, icon: Icon, label, link, note, value }) {
  return (
    <article
      className={`card-float relative flex min-w-0 flex-col overflow-hidden rounded-3xl p-4 shadow-sm sm:p-5 ${
        featured
          ? "bg-linear-to-br from-[#0f766e] to-[#115e59] text-[#ffffff]"
          : "border border-slate-200 bg-white text-slate-950"
      }`}
    >
      {featured ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-14 size-52 rounded-full border-14 border-[#ffffff14]"
        >
          <span className="absolute inset-6 rounded-full border-10 border-[#ffffff14]" />
        </span>
      ) : null}

      <div className="relative flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className={`grid size-9 shrink-0 place-items-center rounded-xl ${
            featured ? "bg-[#ffffff26]" : "bg-brand-50 text-brand-800"
          }`}
        >
          <Icon className="size-4.5" />
        </span>

        {/* Phones: the label drops under the icon row so it never meets the arrow. */}
        <h3 className="min-w-0 flex-1 text-sm font-bold leading-tight max-sm:order-last max-sm:basis-full sm:pt-1.5">
          {label}
        </h3>

        {link ? (
          <Link
            aria-label={`Open ${label.toLowerCase()} in Visit History`}
            className={`ml-auto grid size-9 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
              featured
                ? "bg-[#ffffff] text-[#115e59] hover:bg-[#f0fdfa]"
                : "border border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50"
            }`}
            state={link.state}
            to={link.to}
          >
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>

      <p className="relative mt-3 text-2xl font-black tabular-nums tracking-tight min-[420px]:text-3xl sm:text-4xl">
        {value}
      </p>

      <p
        className={`relative mt-2 flex min-w-0 items-center gap-2 text-xs font-semibold ${
          featured ? "text-[#ccfbf1]" : "text-slate-600"
        }`}
      >
        <DeltaChip change={change} featured={featured} />
        <span className="truncate max-sm:hidden">{note}</span>
      </p>
    </article>
  );
}

// The eight headline figures. Arrows open Visit History with the same
// period and agency; the tower is already shared through the session.
export default function ReportKpis({ agency, onSiteNow, previous, range, totals }) {
  const change = (key) => percentChange(totals[key], previous?.[key]);
  const historyLink = (extra = {}) => ({
    state: {
      historyFilters: {
        agency,
        dateFrom: range.from,
        dateTo: range.to,
        ...extra,
      },
    },
    to: "/staff/history",
  });

  const cards = [
    {
      change: change("uniqueVisitors"),
      featured: true,
      icon: Users,
      label: "Total visitors",
      link: historyLink(),
      note: "Unique visitors in period",
      value: totals.uniqueVisitors ?? 0,
    },
    {
      change: change("visits"),
      icon: ClipboardList,
      label: "Total visits",
      link: historyLink(),
      note: "All recorded visits",
      value: totals.visits ?? 0,
    },
    {
      change: null,
      icon: UserCheck,
      label: "Currently checked in",
      link: {
        state: { historyFilters: { agency, status: "checked_in" } },
        to: "/staff/history",
      },
      note: "On premises right now",
      value: onSiteNow ?? 0,
    },
    {
      change: change("checkouts"),
      icon: LogOut,
      label: "Total checkouts",
      link: historyLink({ status: "checked_out" }),
      note: "Completed departures",
      value: totals.checkouts ?? 0,
    },
    {
      change: change("newVisitors"),
      icon: UserPlus,
      label: "New visitors",
      link: historyLink(),
      note: "First-time visitors",
      value: totals.newVisitors ?? 0,
    },
    {
      change: change("returningVisitors"),
      icon: RefreshCcw,
      label: "Returning visitors",
      link: historyLink(),
      note: "Visited before this period",
      value: totals.returningVisitors ?? 0,
    },
    {
      change: change("averageDurationMinutes"),
      icon: Clock3,
      label: "Average visit duration",
      link: historyLink({ status: "checked_out" }),
      note: "Time spent on premises",
      value: formatMinutes(totals.averageDurationMinutes),
    },
    {
      change: change("cardsIssued"),
      icon: CreditCard,
      label: "Visitor cards issued",
      link: historyLink(),
      note: "Card issue transactions",
      value: totals.cardsIssued ?? 0,
    },
  ];

  return (
    <section aria-labelledby="report-kpi-heading">
      <h2 className="sr-only" id="report-kpi-heading">
        Headline figures
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}
