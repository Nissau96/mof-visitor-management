import {
  Search,
  X,
} from "lucide-react";

// Shared pieces for the administration record pages (hosts, staff).

export const PAGE_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed";

export const OUTLINE_BUTTON = `${PAGE_BUTTON} border border-brand-600 bg-white text-brand-800 hover:bg-brand-50 disabled:opacity-60`;

export const FILLED_BUTTON = `${PAGE_BUTTON} bg-brand-800 text-white hover:bg-brand-900`;

export const TABLE_HEAD_CELL =
  "px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500";

function getInitials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    // Skip numbering such as "Floor 2" so initials stay letters.
    .filter((word) => /^\p{L}/u.test(word));

  const initials =
    words.length > 1
      ? words[0][0] + words[words.length - 1][0]
      : (words[0] || "?").slice(0, 2);

  return initials.toUpperCase();
}

export function InitialsAvatar({ name }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800"
    >
      {getInitials(name)}
    </span>
  );
}

export function SearchPill({
  describedBy,
  id,
  label,
  maxLength,
  onChange,
  placeholder,
  value,
}) {
  return (
    <form
      className="relative w-full min-w-0 lg:max-w-md"
      onSubmit={(event) => event.preventDefault()}
      role="search"
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>

      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500"
      />

      <input
        aria-describedby={describedBy}
        autoComplete="off"
        className="h-11 min-h-11 w-full rounded-full border border-slate-200 bg-slate-50 py-0 pl-11 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </form>
  );
}

export function SuccessBanner({ message, onDismiss }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"
      role="status"
    >
      <p className="flex-1">{message}</p>

      <button
        aria-label="Dismiss confirmation"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-100"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

// Status chip with a leading mark: a dot when on, a dash when off.
export function StateChip({ children, on, tone = "brand" }) {
  const onStyles = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${
        on
          ? onStyles
          : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {on ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : (
        <span aria-hidden="true" className="h-0.5 w-2 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
