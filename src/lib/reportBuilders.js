import {
  getTowerLabel,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";
import {
  formatMinutes,
  formatRange,
  formatShortDate,
} from "./reportPeriods.js";

// Turns API data into report tables: { title, subtitle, columns, rows,
// footer? }. The same table feeds the CSV download and the printed PDF.

// The line each visit purpose is reported under in the Client Service
// Unit's monthly report.
export const CSU_REPORT_LINES = {
  "Follow up": "Follow-up",
  Meeting: "Official meeting",
  "PUD / Delivery": "Picking up documents and delivery",
  "SOD / SOL": "Submission of letters and documents",
};

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

export function formatTime(value) {
  return value ? timeFormatter.format(new Date(value)) : "";
}

export function formatDateTime(value) {
  return value ? dateTimeFormatter.format(new Date(value)) : "";
}

export function visitMinutes(visit) {
  if (!visit.checkedInAt || !visit.checkedOutAt) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (Date.parse(visit.checkedOutAt) - Date.parse(visit.checkedInAt)) /
        60_000,
    ),
  );
}

export function monthLabel(year, month) {
  return monthFormatter.format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function scopeLabel({ agency, tower }) {
  return [
    agency || "All agencies",
    tower ? getTowerLabel(tower) : "All towers",
  ].join(" · ");
}

// ---------------------------------------------------------------- visits

const VISIT_COLUMNS = [
  { key: "reference", label: "Reference" },
  { key: "visitorName", label: "Visitor" },
  { key: "organization", label: "Organisation" },
  { key: "purpose", label: "Purpose" },
  { key: "agency", label: "Agency" },
  { key: "division", label: "Division" },
  { key: "personVisiting", label: "Person visited" },
  { key: "tower", label: "Tower" },
  { key: "checkedIn", label: "Checked in" },
  { key: "checkedOut", label: "Checked out" },
  { key: "duration", label: "Duration" },
  { key: "card", label: "Card" },
];

export function buildVisitLog({ data, range, scope, title }) {
  const visits = Array.isArray(data?.visits) ? data.visits : [];

  return {
    columns: VISIT_COLUMNS,
    footer: data?.truncated
      ? `Showing the latest ${visits.length} of ${data.totalCount} visits. Choose a shorter period for the full list.`
      : `${visits.length} ${visits.length === 1 ? "visit" : "visits"}.`,
    rows: visits.map((visit) => ({
      agency: visit.agency || "",
      card: visit.cardNumber || "Not assigned",
      checkedIn: formatDateTime(visit.checkedInAt),
      checkedOut: visit.checkedOutAt
        ? formatDateTime(visit.checkedOutAt)
        : "On site",
      division: visit.division || "",
      duration: visit.checkedOutAt ? formatMinutes(visitMinutes(visit)) : "",
      organization: visit.organization || "",
      personVisiting: visit.personVisiting || "",
      purpose: visit.purpose,
      reference: visit.reference,
      tower: visit.tower ? getTowerLabel(visit.tower) : "",
      visitorName: visit.visitorName,
    })),
    subtitle: `${formatRange(range.from, range.to)} · ${scopeLabel(scope)}`,
    title,
  };
}

// ---------------------------------------------------------------- summary

export function buildDailySummary({ data, range, scope, title }) {
  const daily = Array.isArray(data?.daily) ? data.daily : [];
  const purposes = Array.isArray(data?.purposes) ? data.purposes : [];
  const totals = data?.totals || {};

  return {
    columns: [
      { key: "date", label: "Date" },
      { key: "visits", label: "Visits" },
    ],
    footer: [
      `${totals.visits ?? 0} visits by ${totals.uniqueVisitors ?? 0} visitors`,
      `${totals.newVisitors ?? 0} first-time`,
      `average stay ${formatMinutes(totals.averageDurationMinutes)}`,
      purposes.length
        ? `top purpose ${purposes[0].purpose} (${purposes[0].visits})`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    rows: daily.map((day) => ({
      date: formatShortDate(day.date),
      visits: day.visits,
    })),
    subtitle: `${formatRange(range.from, range.to)} · ${scopeLabel(scope)}`,
    title,
  };
}

export function buildAgencyBreakdown({ data, range, scope, title }) {
  const agencies = Array.isArray(data?.agencies) ? data.agencies : [];
  const total = agencies.reduce((sum, row) => sum + row.visits, 0);

  return {
    columns: [
      { key: "agency", label: "Agency" },
      { key: "visits", label: "Visits" },
      { key: "share", label: "Share" },
    ],
    footer: `${total} visits across ${agencies.length} ${agencies.length === 1 ? "agency" : "agencies"}.`,
    rows: agencies.map((row) => ({
      agency: row.agency,
      share: total ? `${Math.round((row.visits / total) * 100)}%` : "0%",
      visits: row.visits,
    })),
    subtitle: `${formatRange(range.from, range.to)} · ${scopeLabel(scope)}`,
    title,
  };
}

// ---------------------------------------------------------------- CSU

// Purpose-by-week grid from get_csu_monthly_report cells. Every known
// purpose gets a row, in the order the visitor form lists them.
export function buildCsuTable(data) {
  const weeks = (Array.isArray(data?.weeks) ? data.weeks : []).map(
    (week) => ({
      ...week,
      label: `Week ${week.week}`,
      range: `${formatShortDate(week.start)} to ${formatShortDate(week.end)}`,
    }),
  );
  const cells = Array.isArray(data?.cells) ? data.cells : [];
  const purposes = [
    ...VISIT_PURPOSES,
    ...cells
      .map((cell) => cell.purpose)
      .filter((purpose) => !VISIT_PURPOSES.includes(purpose)),
  ].filter((purpose, index, list) => list.indexOf(purpose) === index);

  const weekTotals = weeks.map(() => 0);

  const rows = purposes.map((purpose) => {
    const counts = weeks.map((week) => {
      const cell = cells.find(
        (item) => item.week === week.week && item.purpose === purpose,
      );

      return Number(cell?.visits) || 0;
    });

    counts.forEach((count, index) => {
      weekTotals[index] += count;
    });

    const total = counts.reduce((sum, count) => sum + count, 0);
    const peak = Math.max(0, ...counts);

    return {
      counts,
      line: CSU_REPORT_LINES[purpose] || "",
      peakIndex: peak > 0 ? counts.indexOf(peak) : -1,
      purpose,
      total,
    };
  });

  const total = weekTotals.reduce((sum, count) => sum + count, 0);
  const busiestCount = Math.max(0, ...weekTotals);
  const busiestIndex = busiestCount > 0 ? weekTotals.indexOf(busiestCount) : -1;
  const topRow = rows.reduce(
    (best, row) => (row.total > (best?.total || 0) ? row : best),
    null,
  );

  return {
    busiest:
      busiestIndex >= 0
        ? { count: busiestCount, label: weeks[busiestIndex].label }
        : null,
    rows: rows.map((row) => ({
      ...row,
      share: total ? Math.round((row.total / total) * 100) : 0,
    })),
    top: topRow ? { count: topRow.total, purpose: topRow.purpose } : null,
    total,
    weekTotals,
    weeks,
  };
}

export function buildCsuReport({ data, scope, title }) {
  const table = buildCsuTable(data);
  const weekColumns = table.weeks.map((week, index) => ({
    key: `week${index}`,
    label: `${week.label} (${week.range})`,
  }));

  return {
    columns: [
      { key: "purpose", label: "Purpose" },
      { key: "line", label: "Report line" },
      ...weekColumns,
      { key: "total", label: "Total" },
      { key: "share", label: "Share" },
    ],
    footer:
      "Weeks run Monday to Friday. A week belongs to the month its Monday falls in; weekend visits count in the week before.",
    rows: [
      ...table.rows.map((row) => ({
        line: row.line,
        purpose: row.purpose,
        share: `${row.share}%`,
        total: row.total,
        ...Object.fromEntries(
          row.counts.map((count, index) => [`week${index}`, count]),
        ),
      })),
      {
        line: "",
        purpose: "Total",
        share: table.total ? "100%" : "0%",
        total: table.total,
        ...Object.fromEntries(
          table.weekTotals.map((count, index) => [`week${index}`, count]),
        ),
      },
    ],
    subtitle: `${monthLabel(data.year, data.month)} · ${scopeLabel(scope)}`,
    title,
  };
}

// ---------------------------------------------------------------- summary

// The page's headline figures with the previous period, for the
// "Export report" button.
export function buildOverviewSummary({ data, range, scope, title }) {
  const totals = data?.totals || {};
  const previous = data?.previousTotals || {};
  const metrics = [
    ["Total visitors", "uniqueVisitors"],
    ["Total visits", "visits"],
    ["Total checkouts", "checkouts"],
    ["New visitors", "newVisitors"],
    ["Returning visitors", "returningVisitors"],
    ["Visitor cards issued", "cardsIssued"],
    ["Average visit duration", "averageDurationMinutes", formatMinutes],
    ["Longest visit", "longestDurationMinutes", formatMinutes],
    ["Average wait to admit", "averageWaitMinutes", formatMinutes],
  ];

  return {
    columns: [
      { key: "metric", label: "Figure" },
      { key: "value", label: "This period" },
      { key: "previous", label: "Previous period" },
    ],
    footer: `On site when generated: ${data?.onSiteNow ?? 0}. The previous period is the same number of days just before.`,
    rows: [
      ...metrics.map(([metric, key, format]) => ({
        metric,
        previous: format ? format(previous[key]) : (previous[key] ?? 0),
        value: format ? format(totals[key]) : (totals[key] ?? 0),
      })),
      ...(data?.agencies || []).map((row) => ({
        metric: `Agency: ${row.agency}`,
        previous: "",
        value: row.visits,
      })),
      ...(data?.purposes || []).map((row) => ({
        metric: `Purpose: ${row.purpose}`,
        previous: "",
        value: row.visits,
      })),
    ],
    subtitle: `${formatRange(range.from, range.to)} · ${scopeLabel(scope)}`,
    title,
  };
}
