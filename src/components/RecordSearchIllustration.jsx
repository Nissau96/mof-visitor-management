// Visitor pass under a magnifying glass, for finding a returning
// visitor's record. Same teals as VisitorPassIllustration; decorative.
export default function RecordSearchIllustration({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 220 180"
    >
      <ellipse
        className="fill-[#0f766e]/15 dark:fill-[#000000]/30"
        cx="100"
        cy="164"
        rx="84"
        ry="8"
      />

      {/* Accent dots */}
      <circle className="fill-[#f59e0b]" cx="22" cy="20" r="5" />
      <circle className="fill-[#2dd4bf]" cx="206" cy="40" r="4" />

      <g transform="rotate(-6 100 92)">
        {/* Card edge, then face */}
        <rect className="fill-[#115e59]" height="108" rx="16" width="160" x="26" y="48" />
        <rect
          className="fill-[#f0fdfa] stroke-[#99e2d6] dark:fill-[#0b2b29] dark:stroke-[#14756d]"
          height="106"
          rx="15"
          strokeWidth="3"
          width="154"
          x="19"
          y="42"
        />

        {/* Lanyard clip */}
        <rect className="fill-[#115e59]" height="24" rx="6" width="22" x="85" y="26" />
        <rect className="fill-[#f0fdfa] dark:fill-[#0b2b29]" height="6" rx="3" width="10" x="91" y="32" />

        {/* Photo panel and details */}
        <rect className="fill-[#ccfbf1] dark:fill-[#0f3a37]" height="60" rx="10" width="126" x="33" y="65" />
        <circle className="fill-[#115e59]" cx="60" cy="85" r="10" />
        <path className="fill-[#115e59]" d="M42 117c0-11 8-18 18-18s18 7 18 18z" />
        <rect className="fill-[#2dd4bf]" height="8" rx="4" width="56" x="88" y="77" />
        <rect className="fill-[#2dd4bf]/70" height="7" rx="3.5" width="44" x="88" y="92" />
        <rect className="fill-[#2dd4bf]/70" height="7" rx="3.5" width="50" x="88" y="106" />
      </g>

      {/* Magnifying glass over the card's corner */}
      <path
        className="stroke-[#115e59]"
        d="m184 140 22 22"
        strokeLinecap="round"
        strokeWidth="12"
      />
      <circle
        className="fill-[#ccfbf1]/80 stroke-[#ffffff] dark:fill-[#0f3a37]/80 dark:stroke-[#0b2b29]"
        cx="164"
        cy="120"
        r="31"
        strokeWidth="8"
      />
      <circle
        className="stroke-[#115e59]"
        cx="164"
        cy="120"
        r="27"
        strokeWidth="7"
      />
      <path
        className="stroke-[#ffffff]"
        d="M150 110a17 17 0 0 1 13-9"
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  );
}
