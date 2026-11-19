import { CalendarDays, ChevronDown, Download, FileText, Lock, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppSelect from "../components/AppSelect.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import CsuMonthlyReport from "../components/reports/CsuMonthlyReport.jsx";
import DetailedVisitReport from "../components/reports/DetailedVisitReport.jsx";
import { MenuButton } from "../components/reports/ExportButtons.jsx";
import PrintableReport from "../components/reports/PrintableReport.jsx";
import {
  AgencyCard,
  PurposeCard,
  TowerCard,
  VisitsTrendCard,
} from "../components/reports/ReportCharts.jsx";
import ReportDownloads from "../components/reports/ReportDownloads.jsx";
import ReportKpis from "../components/reports/ReportKpis.jsx";
import { BusiestHoursCard, OperationsCard } from "../components/reports/ReportPanels.jsx";
import { AGENCY_FILTER_OPTIONS } from "../constants/selectOptions.js";
import { REPORT_TYPES } from "../constants/reportTypes.js";
import { getTowerLabel, TOWER_OPTIONS, VISIT_AGENCIES } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import useReportExport from "../hooks/useReportExport.js";
import useReportQuery from "../hooks/useReportQuery.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { getAnalytics } from "../lib/analyticsApi.js";
import {
  buildAgencyBreakdown,
  buildCsuReport,
  buildDailySummary,
  buildOverviewSummary,
  buildVisitLog,
  scopeLabel,
} from "../lib/reportBuilders.js";
import {
  checkCustomRange,
  formatRange,
  getPeriodRange,
  REPORT_PERIOD_VALUES,
  REPORT_PERIODS,
} from "../lib/reportPeriods.js";

const updatedFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

const BUILDERS = {
  "agency-breakdown": { build: buildAgencyBreakdown, report: "overview" },
  "daily-log": { build: buildVisitLog, report: "visits" },
  "visit-log": { build: buildVisitLog, report: "visits" },
  "weekly-summary": { build: buildDailySummary, report: "overview" },
};

function PanelSkeleton({ className = "", height = "h-72" }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-64 max-w-full rounded bg-slate-100" />
      <div className={`mt-6 rounded-2xl bg-slate-100 ${height}`} />
    </div>
  );
}

function TowerControl({ administrator, onChange, tower }) {
  if (!administrator) {
    return (
      <p className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full bg-brand-50 px-4 text-sm font-bold text-brand-800 ring-1 ring-brand-200 dark:bg-[#0b2b29]">
        <Lock aria-hidden="true" className="size-4" />
        {getTowerLabel(tower)} · your assigned tower
      </p>
    );
  }

  return (
    <div
      aria-label="Tower"
      className="flex gap-1 rounded-full border border-slate-200 bg-slate-100 p-1"
      role="group"
    >
      {[{ label: "All towers", value: "" }, ...TOWER_OPTIONS].map((option) => (
        <button
          aria-pressed={tower === option.value}
          className={`min-h-9 flex-1 whitespace-nowrap rounded-full px-3 text-sm transition sm:flex-none sm:px-4 ${
            tower === option.value
              ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
              : "font-semibold text-slate-600 hover:text-slate-900"
          }`}
          key={option.value || "all"}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function StaffReportsPage() {
  const { profile, session, setTowerScope, signOut, tower } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const today = getAccraIsoDate();
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const [csuFilters, setCsuFilters] = useState({
    agency: "",
    month: String(currentMonth),
    year: String(currentYear),
  });

  const accessToken = session?.access_token || "";
  const administrator = profile.role === "admin";
  const signOutNow = () => void signOut().catch(() => undefined);

  // Period and agency live in the URL so a reload or a shared link keeps
  // them; the tower is the session's tower, shared with other pages.
  const period = REPORT_PERIOD_VALUES.includes(searchParams.get("period"))
    ? searchParams.get("period")
    : "month";
  const agencyParam = searchParams.get("agency") || "";
  const agency = VISIT_AGENCIES.includes(agencyParam) ? agencyParam : "";
  const customParams = { from: searchParams.get("from") || "", to: searchParams.get("to") || "" };
  const customValid = !checkCustomRange(customParams);
  const range = getPeriodRange(
    period === "custom" && !customValid ? "month" : period,
    customParams,
    today,
  );
  const [customDraft, setCustomDraft] = useState(
    customValid ? customParams : { from: range.from, to: range.to },
  );
  const [customError, setCustomError] = useState("");

  function updateParams(changes) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);

        Object.entries(changes).forEach(([key, value]) => {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        });

        return next;
      },
      { replace: true },
    );
  }

  function changePeriod(nextPeriod) {
    setCustomError("");

    if (nextPeriod === "custom") {
      updateParams({ from: customDraft.from, period: "custom", to: customDraft.to });
      return;
    }

    updateParams({ from: "", period: nextPeriod === "month" ? "" : nextPeriod, to: "" });
  }

  function applyCustom(event) {
    event.preventDefault();

    const problem = checkCustomRange(customDraft);

    setCustomError(problem);

    if (!problem) {
      updateParams({ from: customDraft.from, period: "custom", to: customDraft.to });
    }
  }

  function changeTower(nextTower) {
    if (administrator && nextTower !== tower) {
      setTowerScope(nextTower);
    }
  }

  const scope = { agency, tower };
  // The keys leave out the access token: Supabase renews it about every
  // hour, and that should not reload every panel. Requests always send
  // the latest token.
  const overview = useReportQuery({
    key: accessToken
      ? [tower, agency, range.from, range.to, refreshKey].join("|")
      : "",
    onAuthError: signOutNow,
    request: (signal) =>
      getAnalytics({
        accessToken,
        body: { agency, dateFrom: range.from, dateTo: range.to, report: "overview", tower },
        signal,
      }),
  });

  const csu = useReportQuery({
    key: accessToken
      ? [tower, csuFilters.agency, csuFilters.month, csuFilters.year, refreshKey].join("|")
      : "",
    onAuthError: signOutNow,
    request: (signal) =>
      getAnalytics({
        accessToken,
        body: {
          agency: csuFilters.agency,
          month: Number(csuFilters.month),
          report: "csu-month",
          tower,
          year: Number(csuFilters.year),
        },
        signal,
      }),
  });

  const exporter = useReportExport({ onAuthError: signOutNow });

  function exportReport({ format, id, period: reportPeriod, tower: reportTower = tower, type }) {
    const definition = REPORT_TYPES.find((report) => report.id === type);
    const builder = BUILDERS[type];
    const reportRange =
      reportPeriod && reportPeriod !== "page" ? getPeriodRange(reportPeriod, {}, today) : range;
    const reportScope = { agency, tower: reportTower };

    exporter.runExport({
      fileSuffix: reportRange.from === reportRange.to ? reportRange.from : `${reportRange.from}-to-${reportRange.to}`,
      format,
      id,
      load: async () =>
        builder.build({
          data: await getAnalytics({
            accessToken,
            body: {
              agency,
              dateFrom: reportRange.from,
              dateTo: reportRange.to,
              report: builder.report,
              tower: reportTower,
            },
          }),
          range: reportRange,
          scope: reportScope,
          title: definition.title,
        }),
    });
  }

  function exportCsu(format) {
    exporter.runExport({
      fileSuffix: `${csuFilters.year}-${csuFilters.month.padStart(2, "0")}`,
      format,
      id: "csu-month",
      load: async () =>
        buildCsuReport({
          data:
            csu.data ||
            (await getAnalytics({
              accessToken,
              body: {
                agency: csuFilters.agency,
                month: Number(csuFilters.month),
                report: "csu-month",
                tower,
                year: Number(csuFilters.year),
              },
            })),
          scope: { agency: csuFilters.agency, tower },
          title: "Client Service Unit monthly report",
        }),
    });
  }

  function exportSummary(format) {
    exporter.runExport({
      fileSuffix: `${range.from}-to-${range.to}`,
      format,
      id: "summary",
      load: async () =>
        buildOverviewSummary({
          data: overview.data,
          range,
          scope,
          title: "Analytics summary",
        }),
    });
  }

  const data = overview.data;
  const firstLoad = !data && overview.status === "loading";
  const overviewLoading = overview.status === "loading";
  const overviewDim = `grid gap-4 transition-opacity ${overviewLoading ? "opacity-60" : ""}`;
  const towerText = tower ? getTowerLabel(tower) : "All towers";
  const periodLabel = REPORT_PERIODS.find((option) => option.value === period)?.label || "This month";
  const busiestDay = (data?.daily || []).reduce(
    (best, day) => (day.visits > (best?.visits ?? 0) ? day : best),
    null,
  );

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col gap-4 px-1 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Insights
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Analytics &amp; Reports
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            Visitor trends, reception workload and ready-to-send reports for{" "}
            <strong className="text-slate-950">{towerText}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-600 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
            disabled={overview.status === "loading"}
            onClick={() => setRefreshKey((value) => value + 1)}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${overview.status === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <MenuButton
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-5 text-sm font-black text-[#ffffff] shadow-md shadow-[#115e59]/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
            disabled={!data || Boolean(exporter.busy)}
            items={[
              { icon: Printer, label: "PDF (print)", onSelect: () => exportSummary("pdf") },
              { icon: Download, label: "Excel", onSelect: () => exportSummary("excel") },
              { icon: FileText, label: "CSV", onSelect: () => exportSummary("csv") },
            ]}
          >
            <Download aria-hidden="true" className="size-4" />
            Export report
            <ChevronDown aria-hidden="true" className="size-4" />
          </MenuButton>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <section
          aria-label="Report filters"
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="min-w-0 lg:shrink-0">
              <p className="mb-2 text-xs font-bold text-slate-700" id="report-period-label">
                Reporting period
              </p>
              <div
                aria-labelledby="report-period-label"
                className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 sm:inline-flex sm:flex-nowrap sm:rounded-full"
                role="group"
              >
                {REPORT_PERIODS.map((option) => (
                  <button
                    aria-pressed={period === option.value}
                    className={`min-h-9 flex-1 whitespace-nowrap rounded-full px-3 text-sm transition sm:flex-none sm:px-4 ${
                      period === option.value
                        ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
                        : "font-semibold text-slate-600 hover:text-slate-900"
                    }`}
                    key={option.value}
                    onClick={() => changePeriod(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 lg:shrink-0">
              <p className="mb-2 text-xs font-bold text-slate-700">Tower</p>
              <TowerControl administrator={administrator} onChange={changeTower} tower={tower} />
            </div>

            <AppSelect
              className="min-w-0 lg:min-w-56 lg:flex-1"
              id="report-agency"
              label="Agency"
              labelClassName="mb-2 block text-xs font-bold text-slate-700"
              onChange={(value) => updateParams({ agency: value })}
              options={AGENCY_FILTER_OPTIONS}
              size="xl"
              value={agency}
            />
          </div>

          {period === "custom" ? (
            <form
              className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:flex-wrap sm:items-end"
              noValidate
              onSubmit={applyCustom}
            >
              {[
                ["from", "From"],
                ["to", "To"],
              ].map(([key, label]) => (
                <label className="grid gap-1.5 text-xs font-bold text-slate-700" key={key}>
                  {label}
                  <input
                    aria-describedby={customError ? "report-custom-error" : undefined}
                    aria-invalid={Boolean(customError) || undefined}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
                    max={today}
                    onChange={(event) =>
                      setCustomDraft((current) => ({ ...current, [key]: event.target.value }))
                    }
                    type="date"
                    value={customDraft[key]}
                  />
                </label>
              ))}
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand-800 px-5 text-sm font-bold text-[#ffffff] transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                type="submit"
              >
                Apply dates
              </button>
              {customError ? (
                <p className="text-sm font-semibold text-red-700 sm:basis-full" id="report-custom-error" role="alert">
                  {customError}
                </p>
              ) : null}
            </form>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2 font-semibold text-slate-950">
              <CalendarDays aria-hidden="true" className="size-4 text-brand-700" />
              {formatRange(range.from, range.to)}
            </span>
            <span>{scopeLabel(scope)}</span>
            {overview.fetchedAt ? (
              <span>Updated {updatedFormatter.format(new Date(overview.fetchedAt))}</span>
            ) : null}
            {!administrator ? (
              <span className="basis-full text-xs text-slate-500">
                Receptionists see figures and reports for their assigned tower only.
              </span>
            ) : null}
          </div>
        </section>

        {overview.status === "error" && !data ? (
          <ErrorMessage
            message={overview.error}
            onRetry={() => setRefreshKey((value) => value + 1)}
            title="Reports unavailable"
          />
        ) : null}

        {firstLoad ? (
          <div className="grid gap-4" role="status">
            <span className="sr-only">Loading reports…</span>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <PanelSkeleton height="h-12" key={index} />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <PanelSkeleton className="lg:col-span-2" />
              <PanelSkeleton />
            </div>
          </div>
        ) : null}

        {data ? (
          <div aria-busy={overviewLoading} className={overviewDim}>
            <ReportKpis
              agency={agency}
              onSiteNow={data.onSiteNow}
              previous={data.previousTotals}
              range={range}
              totals={data.totals || {}}
            />
          </div>
        ) : null}

        {/* The CSU monthly report loads on its own, so it stays in place
            while the period overview reloads. */}
        <CsuMonthlyReport
          busy={exporter.busy}
          currentYear={currentYear}
          filters={csuFilters}
          onChange={(changes) => setCsuFilters((current) => ({ ...current, ...changes }))}
          onExport={exportCsu}
          onReset={() =>
            setCsuFilters({ agency: "", month: String(currentMonth), year: String(currentYear) })
          }
          query={csu}
          tower={tower}
        />

        {data ? (
          <div aria-busy={overviewLoading} className={overviewDim}>
            <div className="grid gap-4 lg:grid-cols-3">
              <VisitsTrendCard badge={periodLabel} daily={data.daily || []} total={data.totals?.visits ?? 0} />
              <TowerCard
                busiestDay={busiestDay}
                totals={data.totals || {}}
                towerScope={tower}
                towers={data.towers || []}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <AgencyCard agencies={data.agencies || []} />
              <PurposeCard purposes={data.purposes || []} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <BusiestHoursCard heatmap={data.heatmap || []} />
              <OperationsCard cards={data.cards} hosts={data.hosts || []} totals={data.totals || {}} />
            </div>
          </div>
        ) : null}

        <ReportDownloads
          administrator={administrator}
          busy={exporter.busy}
          onExport={exportReport}
          pagePeriod={period === "custom" ? formatRange(range.from, range.to) : periodLabel}
          scopeText={scopeLabel(scope)}
          tower={tower}
        />

        <DetailedVisitReport
          accessToken={accessToken}
          agency={agency}
          onAuthError={signOutNow}
          range={range}
          tower={tower}
        />

        <p className="px-1 pb-2 text-center text-xs text-slate-600">
          Visitor information is handled for access and security purposes.
        </p>
      </div>

      {exporter.printJob ? (
        <PrintableReport onDone={exporter.clearPrintJob} report={exporter.printJob} />
      ) : null}
    </div>
  );
}
