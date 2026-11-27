// Decorative art for the "My bookings" hero: a clipboard of bookings
// (waiting, approved, closed), a calendar page, a clock and guests.
// Teal family only (One Teal Rule). Colours are classes so the dark
// theme can restate them and the Content-Security-Policy stays satisfied.

const PAPER = "fill-white dark:fill-[#111a2b]";
const EDGE = "stroke-brand-100 dark:stroke-[#1f4f4b]";
const INK = "fill-brand-800 dark:fill-brand-400";
const LINE = "stroke-brand-800 dark:stroke-brand-400";
const SOFT = "fill-brand-100 dark:fill-[#1f4f4b]";

function Row({ y, children, tone }) {
  return (
    <g>
      <rect className={`${tone} ${EDGE}`} height="30" rx="8" strokeWidth="2" width="104" x="66" y={y} />
      {children}
      <rect className="fill-slate-800 dark:fill-slate-300" height="5" rx="2.5" width="54" x="102" y={y + 9} />
      <rect className={SOFT} height="5" rx="2.5" width="36" x="102" y={y + 18} />
    </g>
  );
}

// day: today's day of the month, shown on the calendar page.
export default function MyBookingsArt({ className = "", day }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 270 190"
    >
      <ellipse className="fill-brand-100/70 dark:fill-[#0f3a37]" cx="138" cy="178" rx="112" ry="8" />

      {/* Clipboard */}
      <rect className="fill-brand-100 dark:fill-[#163b38]" height="150" rx="16" width="132" x="58" y="24" />
      <rect className={`${PAPER} ${EDGE}`} height="150" rx="16" strokeWidth="2" width="132" x="52" y="18" />
      <rect className={INK} height="16" rx="6" width="46" x="95" y="10" />
      <circle className="fill-white" cx="118" cy="18" r="3" />

      <Row tone="fill-brand-50 dark:fill-[#163b38]" y="42">
        <rect className={INK} height="14" rx="4" width="14" x="76" y="50" />
      </Row>
      <Row tone="fill-brand-50 dark:fill-[#163b38]" y="82">
        <rect className={INK} height="14" rx="4" width="14" x="76" y="90" />
        <path className="stroke-white" d="m79.5 97 2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </Row>
      <Row tone="fill-slate-50" y="122">
        <rect className="fill-slate-300 dark:fill-slate-600" height="14" rx="4" width="14" x="76" y="130" />
      </Row>

      {/* Clock */}
      <circle className={`${PAPER} ${LINE}`} cx="34" cy="62" r="20" strokeWidth="4" />
      <path className={LINE} d="M34 51v12l8 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />

      {/* Calendar page */}
      <rect className={`${PAPER} ${EDGE}`} height="64" rx="10" strokeWidth="2" width="60" x="192" y="44" />
      <path className={INK} d="M192 54a10 10 0 0 1 10-10h40a10 10 0 0 1 10 10v8h-60v-8Z" />
      <rect className={INK} height="12" rx="3" width="6" x="205" y="36" />
      <rect className={INK} height="12" rx="3" width="6" x="233" y="36" />
      <text
        className="fill-slate-900 text-[26px] font-black dark:fill-slate-100"
        textAnchor="middle"
        x="222"
        y="97"
      >
        {day}
      </text>

      {/* Guests */}
      <circle className={`${PAPER} ${EDGE}`} cx="214" cy="132" r="13" strokeWidth="2" />
      <circle className={INK} cx="214" cy="129" r="4" />
      <path className={INK} d="M207 139a7 7 0 0 1 14 0Z" />
      <circle className={INK} cx="238" cy="126" r="13" />
      <circle className="fill-white" cx="238" cy="123" r="4" />
      <path className="fill-white" d="M231 133a7 7 0 0 1 14 0Z" />

      {/* Sparkles */}
      <path className="fill-brand-500 dark:fill-brand-300" d="m30 112 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" />
      <circle className="fill-brand-300 dark:fill-brand-500" cx="258" cy="24" r="3.5" />
    </svg>
  );
}
