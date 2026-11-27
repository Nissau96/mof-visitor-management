// Decorative art for the booking page hero: a calendar with a booked
// day, a clock and a visitor pass. Teal family only (One Teal Rule).
// Colours are classes, not inline styles, so the dark theme can
// restate them and the Content-Security-Policy stays satisfied.

const PAPER = "fill-white dark:fill-[#111a2b]";
const SLOT = "fill-brand-50 dark:fill-[#163b38]";
const INK = "fill-brand-800 dark:fill-brand-400";
const LINE = "stroke-brand-800 dark:stroke-brand-400";

export default function BookingHeroArt({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 320 220"
    >
      {/* Soft ground and backdrop */}
      <ellipse className="fill-brand-100/70 dark:fill-[#0f3a37]" cx="166" cy="200" rx="128" ry="10" />
      <path
        className="fill-brand-100/60 dark:fill-[#0f3a37]/70"
        d="M188 28c46-18 104-6 124 30v126H120c-6-58 14-138 68-156Z"
      />

      {/* Calendar */}
      <g>
        <rect className={`${PAPER} stroke-brand-100 dark:stroke-[#1f4f4b]`} height="138" rx="16" strokeWidth="2" width="176" x="60" y="44" />
        <path className={INK} d="M60 60a16 16 0 0 1 16-16h144a16 16 0 0 1 16 16v14H60V60Z" />
        <rect className="fill-brand-100 dark:fill-brand-200" height="6" opacity="0.9" rx="3" width="44" x="78" y="56" />
        <rect className={INK} height="22" rx="4" width="8" x="98" y="32" />
        <rect className={INK} height="22" rx="4" width="8" x="190" y="32" />

        {[0, 1, 2, 3, 4].map((column) =>
          [0, 1, 2].map((row) =>
            column === 2 && row === 1 ? null : (
              <rect
                className={SLOT}
                height="20"
                key={`${column}-${row}`}
                rx="5"
                width="24"
                x={76 + column * 30}
                y={88 + row * 28}
              />
            ),
          ),
        )}
        <rect className={INK} height="20" rx="5" width="24" x="136" y="116" />
        <path
          className="stroke-white"
          d="m142 126 4 4 8-8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </g>

      {/* Clock */}
      <g>
        <circle className={`${PAPER} ${LINE}`} cx="74" cy="164" r="30" strokeWidth="5" />
        <path
          className={LINE}
          d="M74 146v19l12 8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        <circle className={INK} cx="74" cy="165" r="3" />
      </g>

      {/* Visitor pass on its clip */}
      <g>
        <path className={LINE} d="M246 70v-16m10 16v-16" strokeLinecap="round" strokeWidth="5" />
        <rect className={`${PAPER} stroke-brand-100 dark:stroke-[#1f4f4b]`} height="104" rx="14" strokeWidth="2" transform="rotate(6 254 122)" width="82" x="213" y="70" />
        <rect className={INK} height="8" rx="4" transform="rotate(6 254 122)" width="28" x="240" y="78" />
        <circle className="fill-brand-50 dark:fill-[#163b38]" cx="252" cy="114" r="16" />
        <circle className={INK} cx="252" cy="109" r="6" />
        <path className={INK} d="M241 125a11 11 0 0 1 22 0v1h-22v-1Z" />
        <rect className="fill-slate-800 dark:fill-slate-300" height="6" rx="3" transform="rotate(6 254 150)" width="50" x="228" y="146" />
        <rect className="fill-brand-200 dark:fill-brand-700" height="6" rx="3" transform="rotate(6 254 162)" width="36" x="232" y="158" />
      </g>

      {/* Guests joining */}
      <g>
        <circle className={`${PAPER} stroke-brand-100 dark:stroke-[#1f4f4b]`} cx="246" cy="30" r="14" strokeWidth="2" />
        <circle className={INK} cx="246" cy="27" r="4.5" />
        <path className={INK} d="M238 38a8 8 0 0 1 16 0Z" />
        <circle className={INK} cx="278" cy="40" r="12" />
        <path className="stroke-white" d="M278 34v12m-6-6h12" strokeLinecap="round" strokeWidth="3" />
      </g>

      {/* Sparkles */}
      <path className="fill-brand-500 dark:fill-brand-300" d="m34 70 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" />
      <path className="fill-brand-300 dark:fill-brand-500" d="m300 112 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
      <circle className="fill-brand-300 dark:fill-brand-500" cx="216" cy="22" r="3" />
    </svg>
  );
}
