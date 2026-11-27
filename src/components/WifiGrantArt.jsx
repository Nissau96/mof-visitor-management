// Decorative art for the Wi-Fi grant dialog: a guest router sending a
// signal, with an amber key for the password. Colours are classes so
// the dark theme can restate them and the Content-Security-Policy stays
// satisfied.

export default function WifiGrantArt({ className = "" }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" focusable="false" viewBox="0 0 168 120">
      <ellipse className="fill-[#ccfbf1]/80 dark:fill-[#0f3a37]" cx="84" cy="112" rx="60" ry="5" />

      {/* Signal arcs */}
      <path className="stroke-[#5eead4] dark:stroke-[#2dd4bf]" d="M48 34a52 52 0 0 1 72 0" strokeLinecap="round" strokeWidth="6" />
      <path className="stroke-[#14b8a6]" d="M60 46a35 35 0 0 1 48 0" strokeLinecap="round" strokeWidth="6" />
      <path className="stroke-[#0f766e] dark:stroke-[#5eead4]" d="M72 58a18 18 0 0 1 24 0" strokeLinecap="round" strokeWidth="6" />

      {/* Router */}
      <path className="stroke-[#0f766e] dark:stroke-[#5eead4]" d="M58 70V60M110 70V60" strokeLinecap="round" strokeWidth="4" />
      <rect className="fill-white stroke-[#0f766e] dark:fill-[#0d2724] dark:stroke-[#5eead4]" height="30" rx="8" strokeWidth="3.5" width="76" x="46" y="70" />
      <circle className="fill-[#0f766e] dark:fill-[#5eead4]" cx="60" cy="85" r="3.5" />
      <circle className="fill-[#14b8a6]" cx="72" cy="85" r="3.5" />
      <circle className="fill-[#f59e0b]" cx="84" cy="85" r="3.5" />
      <rect className="fill-[#ccfbf1] dark:fill-[#123b37]" height="5" rx="2.5" width="20" x="94" y="82.5" />

      {/* Key */}
      <circle className="stroke-[#f59e0b]" cx="136" cy="82" r="8" strokeWidth="4" />
      <path className="stroke-[#f59e0b]" d="M136 90v18M136 100h6M136 106h5" strokeLinecap="round" strokeWidth="4" />

      {/* Sparkle and dots */}
      <path className="fill-[#f59e0b]" d="M24 52l2 5.4 5.4 2-5.4 2L24 67l-2-5.6-5.4-2 5.4-2z" />
      <circle className="fill-[#5eead4]" cx="140" cy="20" r="3" />
      <circle className="fill-[#99f6e4] dark:fill-[#14b8a6]" cx="152" cy="40" r="2" />
    </svg>
  );
}
