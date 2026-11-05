// Visitor pass with a check badge, drawn in the brand teals so it stays
// sharp and follows dark mode. Decorative only.
export default function VisitorPassIllustration({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 220 180"
    >
      <ellipse
        className="fill-[#0f766e]/15 dark:fill-[#000000]/30"
        cx="104"
        cy="162"
        rx="88"
        ry="9"
      />

      <g transform="rotate(-7 104 92)">
        {/* Card edge, then face */}
        <rect className="fill-[#115e59]" height="112" rx="16" width="166" x="27" y="44" />
        <rect
          className="fill-[#f0fdfa] stroke-[#99e2d6] dark:fill-[#0b2b29] dark:stroke-[#14756d]"
          height="110"
          rx="15"
          strokeWidth="3"
          width="160"
          x="20"
          y="38"
        />

        {/* Lanyard clip */}
        <rect className="fill-[#115e59]" height="24" rx="6" width="22" x="89" y="22" />
        <rect className="fill-[#f0fdfa] dark:fill-[#0b2b29]" height="6" rx="3" width="10" x="95" y="28" />

        {/* Photo panel and details */}
        <rect className="fill-[#ccfbf1] dark:fill-[#0f3a37]" height="62" rx="10" width="132" x="34" y="62" />
        <circle className="fill-[#115e59]" cx="62" cy="83" r="10" />
        <path className="fill-[#115e59]" d="M44 116c0-11 8-18 18-18s18 7 18 18z" />
        <rect className="fill-[#2dd4bf]" height="8" rx="4" width="62" x="90" y="74" />
        <rect className="fill-[#2dd4bf]/70" height="7" rx="3.5" width="48" x="90" y="89" />
        <rect className="fill-[#2dd4bf]/70" height="7" rx="3.5" width="54" x="90" y="103" />
      </g>

      {/* Check badge */}
      <circle className="fill-[#ffffff] dark:fill-[#0b2b29]" cx="176" cy="122" r="27" />
      <circle className="fill-[#115e59]" cx="176" cy="122" r="22" />
      <path
        d="m165 122 7.5 7.5L188 114"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}
