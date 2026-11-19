import { ChevronDown, FileText, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const OUTLINE =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60";

// Small menu: a button that opens a list of actions below it. Escape,
// a click outside or choosing an item closes it.
export function MenuButton({ align = "right", children, className, disabled, items, label }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function close(event) {
      if (event.type === "keydown" ? event.key === "Escape" : !wrapper.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);

    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapper}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-label={label}
        className={className}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {children}
      </button>

      {open ? (
        <ul
          className={`absolute top-full z-30 mt-2 min-w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
          id={menuId}
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                type="button"
              >
                {item.icon ? <item.icon aria-hidden="true" className="size-4 text-slate-500" /> : null}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// PDF and Excel buttons plus a More menu (plain CSV, Print) for one
// report. busy is the running "<id>:<format>" from useReportExport.
export default function ExportButtons({ busy, id, name, onExport }) {
  const running = (format) => busy === `${id}:${format}`;
  const anyBusy = Boolean(busy);
  const spinner = <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        aria-label={`Download ${name} as PDF`}
        className={`${OUTLINE} border-brand-600 bg-white text-brand-800 hover:bg-brand-50`}
        disabled={anyBusy}
        onClick={() => onExport("pdf")}
        type="button"
      >
        {running("pdf") ? spinner : null}
        PDF
      </button>

      <button
        aria-label={`Download ${name} for Excel`}
        className={`${OUTLINE} border-brand-600 bg-white text-brand-800 hover:bg-brand-50`}
        disabled={anyBusy}
        onClick={() => onExport("excel")}
        type="button"
      >
        {running("excel") ? spinner : null}
        Excel
      </button>

      <MenuButton
        className={`${OUTLINE} border-transparent px-3 text-slate-700 hover:bg-slate-100`}
        disabled={anyBusy}
        items={[
          { icon: FileText, label: "Download CSV", onSelect: () => onExport("csv") },
          { icon: Printer, label: "Print", onSelect: () => onExport("pdf") },
        ]}
        label={`More downloads for ${name}`}
      >
        {running("csv") ? spinner : null}
        More
        <ChevronDown aria-hidden="true" className="size-4" />
      </MenuButton>
    </div>
  );
}
