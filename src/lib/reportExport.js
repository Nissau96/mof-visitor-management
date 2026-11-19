// Downloads for the Analytics & Reports page. "Excel" is a CSV file
// with a byte-order mark, which Excel opens with the right characters;
// "PDF" is the browser's print dialog (Save as PDF).

// A cell starting with one of these could run as a formula in Excel.
const FORMULA_START = /^[=+\-@\t\r]/;

function toCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  let text = String(value);

  if (typeof value === "string" && FORMULA_START.test(text)) {
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// columns: [{ key, label }]; rows: objects keyed by column key.
export function toCsv(columns, rows) {
  const lines = [
    columns.map((column) => toCell(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => toCell(row[column.key])).join(","),
    ),
  ];

  return lines.join("\r\n");
}

export function downloadCsv(fileName, columns, rows, { excel = true } = {}) {
  const csv = toCsv(columns, rows);
  const blob = new Blob([excel ? `\ufeff${csv}` : csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "Daily visitor log", "2026-11-13" -> "daily-visitor-log-2026-11-13.csv"
export function reportFileName(title, suffix) {
  const slug = `${title} ${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug}.csv`;
}
