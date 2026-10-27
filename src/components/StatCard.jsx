import { ArrowUpRight } from "lucide-react";

// Below md the card is compact (icon + arrow, number, short label, no
// note) so the cards sit side by side on phones. tone="alert" tints the
// card red when there is something to act on.
export default function StatCard({
  className = "",
  count,
  featured = false,
  icon: Icon,
  iconTone,
  note,
  noteTone = "neutral",
  onOpen,
  shortTitle,
  title,
  tone,
}) {
  const alert = tone === "alert";

  const noteClasses = featured
    ? "bg-[#ffffff26] text-[#ffffff]"
    : {
        amber: "bg-amber-50 text-amber-800",
        blue: "bg-blue-50 text-blue-800",
        brand: "bg-brand-50 text-brand-800",
        neutral: "bg-slate-100 text-slate-700",
        red: "bg-red-100 text-red-800",
      }[noteTone];

  return (
    <article
      className={`relative overflow-hidden rounded-2xl p-3 shadow-sm sm:p-4 md:rounded-3xl md:p-6 lg:p-5 xl:p-6 ${className} ${
        featured
          ? "bg-brand-800 text-[#ffffff]"
          : alert
            ? "border border-red-200 bg-red-50 text-slate-950"
            : "border border-slate-200 bg-white text-slate-950"
      }`}
    >
      {featured ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-14 size-52 rounded-full border-14 border-[#ffffff14]"
        >
          <span className="absolute inset-6 rounded-full border-10 border-[#ffffff14]" />
        </span>
      ) : null}

      <div className="relative flex items-center gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg md:size-10 md:rounded-xl ${
            featured
              ? "bg-[#ffffff26]"
              : alert || noteTone === "red"
                ? "bg-red-100 text-red-700"
                : iconTone === "amber"
                  ? "bg-amber-50 text-amber-700"
                  : noteTone === "blue"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-brand-50 text-brand-800"
          }`}
        >
          <Icon aria-hidden="true" className="size-4 md:size-5" />
        </span>

        <h2 className="flex-1 font-bold leading-tight max-md:sr-only lg:text-sm xl:text-base">
          {title}
        </h2>

        <span
          aria-hidden="true"
          className="flex-1 md:hidden"
        />

        {onOpen ? (
          <button
            aria-label={`Show ${title.toLowerCase()}`}
            className={`grid size-8 shrink-0 place-items-center rounded-full transition focus-visible:ring-4 focus-visible:ring-brand-200 md:size-10 ${
              featured
                ? "bg-[#ffffff] text-[#115e59] hover:bg-[#f0fdfa]"
                : alert
                  ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50"
            }`}
            onClick={onOpen}
            type="button"
          >
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      <p className="relative mt-3 text-3xl font-black md:mt-5 md:text-5xl">
        {count ?? "—"}
      </p>

      <p
        aria-hidden="true"
        className={`relative mt-1 truncate text-xs font-bold md:hidden ${
          featured ? "text-[#ffffff]" : "text-slate-800"
        }`}
      >
        {shortTitle || title}
      </p>

      <p
        className={`relative mt-4 hidden rounded-md px-2.5 py-1 text-xs font-bold md:inline-flex ${noteClasses}`}
      >
        {note}
      </p>
    </article>
  );
}
