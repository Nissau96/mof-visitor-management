import { Building2, CalendarDays, ChartLine, ListChecks } from "lucide-react";

// Report types the page can produce. period "page" follows the period
// chosen at the top of the page.
export const REPORT_TYPES = [
  {
    description: "Every arrival and departure for one day.",
    icon: CalendarDays,
    id: "daily-log",
    period: "today",
    ready: true,
    title: "Daily visitor log",
  },
  {
    description: "Visits per day and the headline figures for the last 7 days.",
    icon: ChartLine,
    id: "weekly-summary",
    period: "7days",
    ready: true,
    title: "Weekly summary",
  },
  {
    description: "Visits for each agency in the selected period.",
    icon: Building2,
    id: "agency-breakdown",
    period: "page",
    ready: true,
    title: "Agency breakdown",
  },
  {
    description: "Every visit in the period with times, host and card.",
    icon: ListChecks,
    id: "visit-log",
    period: "page",
    ready: false,
    title: "Visit log",
  },
];
