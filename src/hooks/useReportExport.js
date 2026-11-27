import { useState } from "react";
import { ApiError } from "../lib/api.js";
import { downloadCsv, reportFileName } from "../lib/reportExport.js";
import { toast } from "../lib/toast.js";
import { reportExported } from "../lib/activityEvents.js";

// Runs a report download. load() fetches and builds the report table;
// format is "pdf" (print dialog, Save as PDF), "excel" (CSV Excel opens
// cleanly) or "csv" (plain CSV). While a PDF prints, printJob holds the
// table for <PrintableReport>.
export default function useReportExport({ onAuthError }) {
  const [busy, setBusy] = useState("");
  const [printJob, setPrintJob] = useState(null);

  async function runExport({ fileSuffix, format, id, load }) {
    if (busy) {
      return;
    }

    setBusy(`${id}:${format}`);

    try {
      const report = await load();

      // Every report download is a sensitive event in the activity log.
      void reportExported({
        format: format === "pdf" ? "pdf" : "csv",
        period: fileSuffix ? String(fileSuffix) : undefined,
        report: report.title,
        rows: Array.isArray(report.rows) ? report.rows.length : undefined,
      });

      if (format === "pdf") {
        setPrintJob(report);
      } else {
        downloadCsv(
          reportFileName(report.title, fileSuffix),
          report.columns,
          report.rows,
          { excel: format === "excel" },
        );
        toast.success("Report downloaded", `${report.title} is in your downloads.`);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        onAuthError?.();
        return;
      }

      toast.error(
        "Report not ready",
        error instanceof Error && error.message
          ? error.message
          : "The report could not be created. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }

  return {
    busy,
    clearPrintJob: () => setPrintJob(null),
    printJob,
    runExport,
  };
}
