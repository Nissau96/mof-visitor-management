import {
  Download,
  FileDown,
  LoaderCircle,
  Lock,
} from "lucide-react";
import { useState } from "react";
import AppSelect from "../AppSelect.jsx";
import ExportButtons from "./ExportButtons.jsx";
import { REPORT_TYPES } from "../../constants/reportTypes.js";
import { getTowerLabel, TOWER_OPTIONS } from "../../constants/visitorOptions.js";

const GENERATOR_PERIODS = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7days" },
  { label: "This month", value: "month" },
  { label: "This quarter", value: "quarter" },
];

const PERIOD_LABELS = {
  "7days": "Last 7 days",
  month: "This month",
  quarter: "This quarter",
  today: "Today",
};

const FORMATS = [
  { label: "PDF", value: "pdf" },
  { label: "Excel", value: "excel" },
  { label: "CSV", value: "csv" },
];

const FIELD_LABEL = "mb-1.5 block text-xs font-bold text-slate-700";

function GenerateReport({ administrator, busy, onExport, pageTower }) {
  const [type, setType] = useState("daily-log");
  const [period, setPeriod] = useState("today");
  const [tower, setTower] = useState(pageTower);
  const [format, setFormat] = useState("pdf");
  const selected = REPORT_TYPES.find((report) => report.id === type);
  const running = busy === `generator:${format}`;

  function changeType(nextType) {
    const next = REPORT_TYPES.find((report) => report.id === nextType);

    setType(nextType);

    if (next && next.period !== "page") {
      setPeriod(next.period);
    }
  }

  return (
    <section
      aria-labelledby="generate-report-heading"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-[#14b8a6] to-[#0f766e] text-[#ffffff]"
        >
          <FileDown className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-950" id="generate-report-heading">
            Generate a report
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Pick the report, period and tower, then download.
          </p>
        </div>
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onExport({ format, id: "generator", period, tower, type });
        }}
      >
        <div>
          <AppSelect
            describedBy="generate-type-help"
            id="generate-type"
            label="Report type"
            labelClassName={FIELD_LABEL}
            onChange={changeType}
            options={REPORT_TYPES.map((report) => ({ label: report.title, value: report.id }))}
            size="xl"
            value={type}
          />
          <p className="mt-1.5 text-xs text-slate-500" id="generate-type-help">
            {selected?.description}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AppSelect
            id="generate-period"
            label="Reporting period"
            labelClassName={FIELD_LABEL}
            onChange={setPeriod}
            options={GENERATOR_PERIODS}
            size="xl"
            value={period}
          />

          {administrator ? (
            <AppSelect
              id="generate-tower"
              label="Tower"
              labelClassName={FIELD_LABEL}
              onChange={setTower}
              options={[{ label: "Both towers", value: "" }, ...TOWER_OPTIONS]}
              size="xl"
              value={tower}
            />
          ) : (
            <div>
              <p className={FIELD_LABEL}>Tower</p>
              <p className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                <Lock aria-hidden="true" className="size-4 text-slate-500" />
                {getTowerLabel(pageTower)}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">Locked to your assigned tower.</p>
            </div>
          )}
        </div>

        <fieldset>
          <legend className={FIELD_LABEL}>Export format</legend>
          <div className="inline-flex gap-1 rounded-full border border-slate-200 bg-slate-100 p-1">
            {FORMATS.map((option) => (
              <label
                className={`cursor-pointer rounded-full px-4 py-1.5 text-sm transition has-focus-visible:ring-4 has-focus-visible:ring-brand-200 ${
                  format === option.value
                    ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
                    : "font-semibold text-slate-600 hover:text-slate-900"
                }`}
                key={option.value}
              >
                <input
                  checked={format === option.value}
                  className="sr-only"
                  name="generate-format"
                  onChange={() => setFormat(option.value)}
                  type="radio"
                  value={option.value}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-6 text-sm font-black text-[#ffffff] shadow-md shadow-[#115e59]/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(busy)}
          type="submit"
        >
          {running ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Download aria-hidden="true" className="size-4" />
          )}
          {format === "pdf" ? "Generate PDF" : format === "excel" ? "Download Excel" : "Download CSV"}
        </button>
      </form>
    </section>
  );
}

function ReadyReports({ busy, onExport, pagePeriod, scopeText }) {
  return (
    <section
      aria-labelledby="ready-reports-heading"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="text-base font-black tracking-tight text-slate-950" id="ready-reports-heading">
        Ready reports
      </h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Built from the filters above. Download as PDF or Excel.
      </p>

      <ul className="mt-4 divide-y divide-slate-200">
        {REPORT_TYPES.filter((report) => report.ready).map((report) => (
          <li
            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            key={report.id}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800"
              >
                <report.icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-950">{report.title}</h3>
                <p className="text-xs leading-5 text-slate-600">{report.description}</p>
                <p className="text-xs text-slate-500">
                  {scopeText} · {report.period === "page" ? pagePeriod : PERIOD_LABELS[report.period]}
                </p>
              </div>
            </div>

            <ExportButtons
              busy={busy}
              id={report.id}
              name={`the ${report.title.toLowerCase()}`}
              onExport={(format) =>
                onExport({ format, id: report.id, period: report.period, type: report.id })
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReportDownloads({
  administrator,
  busy,
  onExport,
  pagePeriod,
  scopeText,
  tower,
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <GenerateReport
        administrator={administrator}
        busy={busy}
        key={tower}
        onExport={onExport}
        pageTower={tower}
      />
      <ReadyReports busy={busy} onExport={onExport} pagePeriod={pagePeriod} scopeText={scopeText} />
    </div>
  );
}
