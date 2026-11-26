// Drawn artwork for the visitor feedback page. Decorative only, so every
// piece is aria-hidden; colours come from Tailwind classes, not inline
// styles (the Content-Security-Policy blocks those).

// The five rating faces share one drawing; only the mouth changes.
const MOUTHS = {
  1: "M8 16.6c1.1-1.5 2.4-2.2 4-2.2s2.9.7 4 2.2",
  2: "M8.6 16c1-.8 2.1-1.2 3.4-1.2s2.4.4 3.4 1.2",
  3: "M8.8 15.2h6.4",
  4: "M8.6 14.4c1 .9 2.1 1.4 3.4 1.4s2.4-.5 3.4-1.4",
  5: "M8 13.8c1.1 1.7 2.4 2.6 4 2.6s2.9-.9 4-2.6",
};

export function RatingFace({ className = "", level }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9.1" cy="10" fill="currentColor" r="1" />
      <circle cx="14.9" cy="10" fill="currentColor" r="1" />
      <path d={MOUTHS[level]} stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function Sparkle({ className }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        className="fill-current"
        d="M12 1.5c.6 5.4 2.2 8.4 10.5 10.5-8.3 2.1-9.9 5.1-10.5 10.5-.6-5.4-2.2-8.4-10.5-10.5C9.8 9.9 11.4 6.9 12 1.5Z"
      />
    </svg>
  );
}

// Desktop side panel: a speech bubble holding a rating.
export function ReviewBubbleArt({ className = "" }) {
  return (
    <div aria-hidden="true" className={`relative mx-auto h-40 w-56 ${className}`}>
      <span className="absolute bottom-0 left-1/2 h-3 w-40 -translate-x-1/2 rounded-full bg-black/20 blur-sm" />
      <span className="absolute left-2 top-2 size-2.5 rounded-full bg-brand-300" />
      <span className="absolute bottom-10 right-0 size-2.5 rounded-full bg-brand-300" />
      <Sparkle className="absolute bottom-14 left-0 size-5 text-amber-300" />
      <svg className="absolute left-6 top-4 h-32 w-40" fill="none" viewBox="0 0 160 128">
        <path
          className="fill-white"
          d="M20 4h120c8.8 0 16 7.2 16 16v52c0 8.8-7.2 16-16 16H62l-26 26 4-26H20C11.2 88 4 80.8 4 72V20C4 11.2 11.2 4 20 4Z"
        />
        <path
          className="fill-amber-400"
          d="m38 30 4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L38 53.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5L38 30Z"
        />
        <path
          className="fill-amber-400"
          d="m72 30 4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L72 53.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5L72 30Z"
        />
        <path
          className="fill-amber-200"
          d="m106 30 4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3-9.3-4.9-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5L106 30Z"
        />
        <rect className="fill-brand-100" height="6" rx="3" width="92" x="30" y="68" />
      </svg>
      <span className="absolute right-3 top-0 grid size-12 place-items-center rounded-full bg-brand-300 shadow-[0_10px_20px_-8px_rgb(4_47_46/0.6)]">
        <svg className="size-6 text-brand-950" viewBox="0 0 24 24">
          <path
            className="fill-current"
            d="M12 20.3 10.6 19C5.6 14.5 2.5 11.7 2.5 8.2A4.7 4.7 0 0 1 7.3 3.5c1.8 0 3.6.9 4.7 2.2a6.2 6.2 0 0 1 4.7-2.2 4.7 4.7 0 0 1 4.8 4.7c0 3.5-3.1 6.3-8.1 10.8L12 20.3Z"
          />
        </svg>
      </span>
    </div>
  );
}

// Thank-you screen: a sealed envelope with a heart card.
export function ThanksEnvelopeArt({ className = "" }) {
  return (
    <div aria-hidden="true" className={`relative mx-auto h-44 w-52 ${className}`}>
      <span className="absolute inset-x-6 top-2 bottom-8 rounded-full border border-dashed border-brand-200 bg-brand-50" />
      <span className="absolute bottom-1 left-1/2 h-3 w-36 -translate-x-1/2 rounded-full bg-slate-200" />
      <Sparkle className="absolute left-1 top-16 size-5 text-amber-400" />
      <Sparkle className="absolute right-2 top-9 size-4 text-amber-400" />
      <span className="absolute left-9 top-4 size-2.5 rotate-12 rounded-[3px] bg-brand-300" />
      <span className="absolute right-10 top-1 size-3 -rotate-12 rounded-[3px] bg-amber-200" />
      <span className="absolute bottom-12 left-4 size-2 rounded-full bg-brand-200" />
      <span className="absolute bottom-14 right-3 size-2.5 rounded-full bg-brand-300" />
      <svg className="absolute left-1/2 top-3 h-36 w-36 -translate-x-1/2" fill="none" viewBox="0 0 144 144">
        <rect className="fill-brand-800" height="62" rx="8" width="64" x="40" y="4" />
        <path
          className="fill-amber-200"
          transform="translate(0 -20)"
          d="M72 56.5 70 54.7c-6.4-5.8-10.5-9.5-10.5-14a6.6 6.6 0 0 1 6.7-6.7c2.3 0 4.4 1.1 5.8 2.7a7.7 7.7 0 0 1 5.8-2.7 6.6 6.6 0 0 1 6.7 6.7c0 4.5-4.1 8.2-10.5 14L72 56.5Z"
        />
        <path
          className="fill-white stroke-brand-700"
          d="M22 58c0-4.4 3.6-8 8-8h84c4.4 0 8 3.6 8 8v54c0 4.4-3.6 8-8 8H30c-4.4 0-8-3.6-8-8V58Z"
          strokeWidth="3"
        />
        <path className="stroke-brand-700" d="m24 56 48 36 48-36" strokeLinejoin="round" strokeWidth="3" />
      </svg>
    </div>
  );
}
