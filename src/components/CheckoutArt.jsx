// Decorative art for the check-out dialog: an open door with the visitor
// heading out, a clock for the departure time and the visitor card being
// handed back. Teal family with one amber accent. Colours are classes so
// the dark theme can restate them and the Content-Security-Policy stays
// satisfied.

const LINE = "stroke-brand-800 dark:stroke-brand-300";

export default function CheckoutArt({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 168 120"
    >
      <ellipse className="fill-brand-100/80 dark:fill-[#0f3a37]" cx="76" cy="112" rx="58" ry="5" />

      {/* Door frame and open door */}
      <rect className="fill-white stroke-brand-700 dark:fill-[#0d2724] dark:stroke-brand-400" height="92" rx="6" strokeWidth="3" width="50" x="30" y="16" />
      <path className="fill-brand-600 dark:fill-brand-500" d="M33 19l30 8v80l-30-1z" />
      <path className="fill-brand-700 dark:fill-brand-600" d="M33 19l30 8v4L33 23z" />
      <circle className="fill-amber-300" cx="57" cy="70" r="3" />

      {/* Exit arrow */}
      <path className={LINE} d="M92 66h40" strokeLinecap="round" strokeWidth="4" />
      <path className={LINE} d="M120 54l12 12-12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />

      {/* Clock */}
      <circle className={`fill-white dark:fill-[#0d2724] ${LINE}`} cx="132" cy="26" r="15" strokeWidth="3" />
      <path className={LINE} d="M132 17v9l6 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />

      {/* Returned visitor card */}
      <rect className="fill-amber-400" height="26" rx="5" width="38" x="94" y="84" />
      <rect className="fill-white" height="4" rx="2" width="12" x="100" y="91" />
      <rect className="fill-white" height="4" rx="2" width="12" x="114" y="91" />
      <rect className="fill-amber-100" height="4" rx="2" width="22" x="100" y="99" />

      {/* Sparkle and dot */}
      <path className="fill-amber-400" d="M12 46l2 5.4 5.4 2-5.4 2L12 61l-2-5.6-5.4-2 5.4-2z" />
      <circle className="fill-brand-300 dark:fill-brand-500" cx="158" cy="62" r="3" />
    </svg>
  );
}
