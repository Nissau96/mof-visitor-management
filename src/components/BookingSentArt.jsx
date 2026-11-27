// Decorative art for the "Request sent" card: a booking card with a
// waiting clock and a tick, and a paper plane on its way to reception.
// Teal family only (One Teal Rule). Colours are classes so the dark
// theme can restate them and the Content-Security-Policy stays satisfied.

const PAPER = "fill-white dark:fill-[#111a2b]";
const INK = "fill-brand-800 dark:fill-brand-400";
const LINE = "stroke-brand-800 dark:stroke-brand-400";

export default function BookingSentArt({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 260 210"
    >
      <ellipse className="fill-brand-100/70 dark:fill-[#0f3a37]" cx="130" cy="192" rx="120" ry="8" />

      {/* Flight path and plane */}
      <path
        className="stroke-brand-300 dark:stroke-brand-500"
        d="M20 58C44 20 104 6 160 30"
        strokeDasharray="5 7"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <g className={LINE} strokeLinejoin="round" strokeWidth="3.5">
        <path className={PAPER} d="m216 4-58 34 22 8 36-42Z" />
        <path className={PAPER} d="m216 4-30 54-6-12 36-42Z" />
      </g>

      {/* Booking card */}
      <rect className="fill-brand-100 dark:fill-[#163b38]" height="104" rx="14" width="196" x="44" y="86" />
      <rect className={`${PAPER} stroke-brand-100 dark:stroke-[#1f4f4b]`} height="104" rx="14" strokeWidth="2" width="196" x="36" y="78" />
      <path className={INK} d="M36 92a14 14 0 0 1 14-14h168a14 14 0 0 1 14 14v12H36V92Z" />
      <rect className="fill-slate-800 dark:fill-slate-300" height="7" rx="3.5" width="70" x="56" y="122" />
      <rect className="fill-brand-100 dark:fill-[#1f4f4b]" height="7" rx="3.5" width="110" x="56" y="140" />
      <rect className="fill-brand-100 dark:fill-[#1f4f4b]" height="7" rx="3.5" width="90" x="56" y="156" />

      {/* Waiting clock */}
      <circle className={`${PAPER} ${LINE}`} cx="194" cy="142" r="22" strokeWidth="4" />
      <path className={LINE} d="M194 128v15l9 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />

      {/* Tick */}
      <circle className={`${INK} stroke-white dark:stroke-[#111a2b]`} cx="34" cy="150" r="20" strokeWidth="4" />
      <path
        className="stroke-white"
        d="m25 150 6 6 12-12"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />

      {/* Sparkles */}
      <circle className="fill-brand-300 dark:fill-brand-500" cx="10" cy="82" r="4" />
      <path className="fill-brand-500 dark:fill-brand-300" d="m252 96 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" />
    </svg>
  );
}
