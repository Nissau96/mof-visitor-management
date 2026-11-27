// Decorative art for the meeting details dialog: a calendar page with
// today's slot marked, a clock and a guest. Teal family with one amber
// accent. Colours are classes so the dark theme can restate them and the
// Content-Security-Policy stays satisfied.

const PAPER = "fill-white dark:fill-[#111a2b]";
const EDGE = "stroke-brand-100 dark:stroke-[#1f4f4b]";
const INK = "fill-brand-700 dark:fill-brand-400";
const LINE = "stroke-brand-800 dark:stroke-brand-400";
const SOFT = "fill-brand-100 dark:fill-[#1f4f4b]";

const CELLS = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [3, 1],
  [1, 2], [2, 2],
];

export default function MeetingDetailsArt({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 160 120"
    >
      <ellipse className="fill-brand-100/70 dark:fill-[#0f3a37]" cx="88" cy="112" rx="54" ry="6" />

      {/* Calendar */}
      <rect className={`${PAPER} ${EDGE}`} height="82" rx="12" strokeWidth="2" width="96" x="42" y="18" />
      <path className={INK} d="M42 30a12 12 0 0 1 12-12h72a12 12 0 0 1 12 12v8H42z" />
      <rect className="fill-brand-900 dark:fill-brand-300" height="14" rx="3" width="6" x="62" y="10" />
      <rect className="fill-brand-900 dark:fill-brand-300" height="14" rx="3" width="6" x="112" y="10" />
      {CELLS.map(([column, row]) => (
        <rect className={SOFT} height="10" key={`${column}-${row}`} rx="2.5" width="14" x={56 + column * 19} y={46 + row * 16} />
      ))}
      <rect className="fill-amber-400" height="10" rx="2.5" width="14" x="94" y="62" />

      {/* Clock */}
      <circle className={`${PAPER} ${LINE}`} cx="50" cy="80" r="20" strokeWidth="3" />
      <path className={LINE} d="M50 68v12l8 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />

      {/* Guest */}
      <circle className={`fill-brand-600 dark:fill-brand-500 ${EDGE}`} cx="130" cy="92" r="13" strokeWidth="3" />
      <circle className="fill-white" cx="130" cy="88" r="3.5" />
      <path className="fill-white" d="M123.5 99a6.5 6.5 0 0 1 13 0z" />

      {/* Sparkle and dot */}
      <path className="fill-amber-400" d="M18 30l2.2 5.8L26 38l-5.8 2.2L18 46l-2.2-5.8L10 38l5.8-2.2z" />
      <circle className="fill-amber-400" cx="152" cy="22" r="3" />
    </svg>
  );
}
