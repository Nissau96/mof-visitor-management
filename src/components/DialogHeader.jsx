import { Sparkles, X } from "lucide-react";

// Shared header for every modal: a tinted gradient with concentric rings,
// an optional chip (the old eyebrow), the title and description, and a
// small illustration built around the dialog's icon. Matches the check-out
// confirmation design. Hex colours keep the tones stable in dark mode,
// where the theme remaps brand and slate utilities.

const TONES = {
  brand: {
    dot: "bg-[#10b981]",
    header:
      "from-[#e6f8f4] via-[#f2fbf9] to-white dark:from-[#0d2a27] dark:via-[#0d1d27] dark:to-[#0b1220]",
    ring: "border-[#0f766e]/10 dark:border-[#5eead4]/10",
    tile: "from-[#0e8077] to-[#115e59]",
    under: "bg-[#ccfbf1] dark:bg-[#123b37]",
  },
  danger: {
    dot: "bg-[#ef4444]",
    header:
      "from-[#fdecec] via-[#fdf5f5] to-white dark:from-[#2e1418] dark:via-[#1c1622] dark:to-[#0b1220]",
    ring: "border-[#b91c1c]/10 dark:border-[#fca5a5]/10",
    tile: "from-[#dc2626] to-[#991b1b]",
    under: "bg-[#fee2e2] dark:bg-[#3b1a1f]",
  },
  warning: {
    dot: "bg-[#f59e0b]",
    header:
      "from-[#fdf3dc] via-[#fef9ec] to-white dark:from-[#2d230c] dark:via-[#1d1b1d] dark:to-[#0b1220]",
    ring: "border-[#b45309]/10 dark:border-[#fcd34d]/10",
    tile: "from-[#d97706] to-[#92400e]",
    under: "bg-[#fef3c7] dark:bg-[#3a2c0b]",
  },
};

function DialogArt({ icon: Icon = Sparkles, tone }) {
  const colours = TONES[tone] || TONES.brand;

  return (
    <span aria-hidden="true" className="relative hidden h-24 w-32 shrink-0 sm:block">
      {/* Tilted backing card */}
      <span className={`absolute left-5 top-3 h-18 w-22 rotate-[-8deg] rounded-2xl ${colours.under}`} />
      {/* Main card with the icon tile */}
      <span className="absolute left-7 top-2 grid h-18 w-22 place-items-center rounded-2xl bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-200 dark:bg-[#111a2b]! dark:ring-[#1f2a3d]!">
        <span className={`grid size-11 place-items-center rounded-xl bg-linear-to-br text-[#ffffff] shadow-md shadow-slate-900/15 ${colours.tile}`}>
          <Icon className="size-5.5" strokeWidth={2.25} />
        </span>
      </span>
      {/* Amber slip with two lines */}
      <span className="absolute bottom-1 right-0 flex h-8 w-12 flex-col justify-center gap-1 rounded-lg bg-[#fbbf24] px-2 shadow-md shadow-amber-900/15">
        <span className="h-1 w-6 rounded-full bg-[#ffffff]" />
        <span className="h-1 w-8 rounded-full bg-[#fef3c7]" />
      </span>
      {/* Sparkle and dot */}
      <svg className="absolute left-0 top-0 size-4 fill-[#f59e0b]" viewBox="0 0 16 16">
        <path d="M8 0l1.6 5.4L15 7l-5.4 1.6L8 14l-1.6-5.4L1 7l5.4-1.6z" />
      </svg>
      <span className="absolute right-3 top-1 size-2 rounded-full bg-[#5eead4]" />
    </span>
  );
}

export default function DialogHeader({
  busy = false,
  closeLabel = "Close dialog",
  description,
  descriptionId,
  eyebrow,
  icon,
  onClose,
  title,
  titleId,
  tone = "brand",
}) {
  const colours = TONES[tone] || TONES.brand;
  const closeButton = (
    <button aria-label={closeLabel} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:opacity-50 dark:bg-[#111a2b]! dark:text-[#e2e8f0]! dark:ring-[#1f2a3d]!" disabled={busy} onClick={onClose} type="button">
      <X aria-hidden="true" className="size-5" />
    </button>
  );

  return (
    <header className={`relative isolate shrink-0 overflow-hidden bg-linear-to-br px-5 pb-5 pt-5 sm:px-7 sm:pt-6 ${colours.header}`}>
      <span aria-hidden="true">
        {["size-80", "size-60", "size-40"].map((size) => (
          <span className={`pointer-events-none absolute -right-20 -top-24 -z-10 rounded-full border ${colours.ring} ${size}`} key={size} />
        ))}
      </span>

      {eyebrow ? (
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-900/10 dark:bg-[#0b1220]! dark:text-[#e2e8f0]! dark:ring-[#ffffff]/15">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${colours.dot}`} />
            <span className="truncate">{eyebrow}</span>
          </span>
          {closeButton}
        </div>
      ) : null}

      <div className={`flex gap-4 ${eyebrow ? "mt-3 items-end" : "items-start"}`}>
        <div className="min-w-0 flex-1 self-end">
          <h2 className="text-balance text-[1.375rem] font-black leading-tight tracking-tight text-slate-950 sm:text-2xl" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-[42ch] text-sm leading-6 text-slate-600" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>

        <DialogArt icon={icon} tone={tone} />
        {eyebrow ? null : closeButton}
      </div>
    </header>
  );
}
