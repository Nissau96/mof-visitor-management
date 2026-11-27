import { useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";

const generatedFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Accra",
});

function getPrintRoot() {
  let root = document.getElementById("print-root");

  if (!root) {
    root = document.createElement("div");
    root.id = "print-root";
    document.body.append(root);
  }

  return root;
}

// Renders a report table outside the app and opens the print dialog,
// where staff choose "Save as PDF". index.css hides everything else
// while #print-root has content. onDone runs once the dialog closes.
export default function PrintableReport({ onDone, report }) {
  const done = useEffectEvent(() => onDone());

  useEffect(() => {
    const finish = () => done();

    window.addEventListener("afterprint", finish, { once: true });

    // Let the portal paint before the dialog snapshots the page.
    const frame = window.requestAnimationFrame(() => {
      window.print();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finish);
    };
  }, [report]);

  return createPortal(
    <article className="hidden bg-[#ffffff] p-8 font-sans text-[#0f172a] print:block">
      <header className="flex items-start justify-between gap-6 border-b-2 border-[#0f766e] pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Ministry of Finance · Visitor management
          </p>
          <h1 className="mt-1 text-2xl font-black">{report.title}</h1>
          <p className="mt-1 text-sm text-[#475569]">{report.subtitle}</p>
        </div>

        <p className="shrink-0 text-right text-xs text-[#475569]">
          Generated
          <br />
          {generatedFormatter.format(new Date())}
        </p>
      </header>

      <table className="mt-5 w-full border-collapse text-left text-[11px]">
        <thead>
          <tr>
            {report.columns.map((column) => (
              <th
                className="border-b border-[#cbd5e1] bg-[#f1f5f9] px-2 py-2 font-bold uppercase tracking-wide"
                key={column.key}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {report.rows.map((row, index) => (
            <tr className="break-inside-avoid" key={index}>
              {report.columns.map((column) => (
                <td
                  className="border-b border-[#e2e8f0] px-2 py-1.5 align-top"
                  key={column.key}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {report.footer ? (
        <p className="mt-4 text-xs text-[#475569]">{report.footer}</p>
      ) : null}

      <p className="mt-6 text-[10px] text-[#64748b]">
        Visitor information is handled for access and security purposes.
      </p>
    </article>,
    getPrintRoot(),
  );
}
