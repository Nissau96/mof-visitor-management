// Decorative artwork for the two reception kiosk options. Explicit
// colours keep them the same in light and dark mode.

function Sparkle({ color, size = 8, x, y }) {
  return (
    <path
      d={`M${x} ${y - size}Q${x} ${y} ${x + size} ${y}Q${x} ${y} ${x} ${y + size}Q${x} ${y} ${x - size} ${y}Q${x} ${y} ${x} ${y - size}Z`}
      fill={color}
    />
  );
}

// A QR finder pattern: the three nested squares in a QR code's corners.
function Finder({ color, size, x, y }) {
  const ring = size / 7;

  return (
    <g>
      <rect fill={color} height={size} rx={ring} width={size} x={x} y={y} />
      <rect
        fill="#ffffff"
        height={size - ring * 2}
        width={size - ring * 2}
        x={x + ring}
        y={y + ring}
      />
      <rect
        fill={color}
        height={ring * 3}
        rx={ring / 2}
        width={ring * 3}
        x={x + ring * 2}
        y={y + ring * 2}
      />
    </g>
  );
}

const QR_MODULES = [
  [0, 0], [2, 0], [3, 1], [1, 2], [2, 2], [0, 3], [3, 3],
  [1, 4], [2, 4], [3, 5], [0, 5],
];

function QrModules({ color, size, x, y }) {
  return QR_MODULES.map(([column, row]) => (
    <rect
      fill={color}
      height={size}
      key={`${column}-${row}`}
      width={size}
      x={x + column * size}
      y={y + row * size}
    />
  ));
}

export function QrScanIllustration({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 240 170"
    >
      <ellipse cx="124" cy="152" fill="#0b4f4a" opacity="0.45" rx="84" ry="9" />
      <circle cx="128" cy="78" fill="#ffffff" opacity="0.12" r="64" />

      {/* Printed QR card */}
      <rect fill="#ffffff" height="104" rx="14" width="84" x="38" y="34" />
      <Finder color="#0f766e" size={24} x={48} y={44} />
      <Finder color="#0f766e" size={24} x={88} y={44} />
      <Finder color="#0f766e" size={24} x={48} y={84} />
      <QrModules color="#0f766e" size={5} x={90} y={84} />
      <rect fill="#99f6e4" height="6" rx="3" width="48" x="56" y="120" />

      {/* Scan beams */}
      {[72, 84, 96].map((y) => (
        <path
          d={`M126 ${y}h22`}
          key={y}
          stroke="#fde68a"
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      ))}

      {/* Phone */}
      <g transform="rotate(12 182 86)">
        <rect fill="#134e4a" height="118" rx="14" width="66" x="149" y="27" />
        <rect fill="#ecfdf5" height="100" rx="9" width="54" x="155" y="35" />
        <Finder color="#134e4a" size={14} x={164} y={52} />
        <Finder color="#134e4a" size={14} x={184} y={52} />
        <Finder color="#134e4a" size={14} x={164} y={72} />
        <QrModules color="#134e4a" size={3} x={185} y={72} />
        <path
          d="M160 50v-6h6M198 44h6v6M204 84v6h-6M166 90h-6v-6"
          stroke="#f59e0b"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
        <path d="M160 67h44" stroke="#f59e0b" strokeWidth="1.5" />
        <rect fill="#99f6e4" height="5" rx="2.5" width="34" x="165" y="104" />
        <rect fill="#0f766e" height="8" rx="4" width="34" x="165" y="114" />
      </g>

      <Sparkle color="#ffffff" size={6} x={24} y={36} />
      <Sparkle color="#fde68a" size={8} x={214} y={24} />
    </svg>
  );
}

export function LogVisitIllustration({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 240 170"
    >
      <circle cx="116" cy="82" fill="#e6f7f4" r="64" />
      <ellipse cx="118" cy="154" fill="#d5efe9" rx="74" ry="7" />

      {/* Clipboard */}
      <rect
        fill="#ffffff"
        height="122"
        rx="12"
        stroke="#a7dcd2"
        strokeWidth="2"
        width="96"
        x="70"
        y="28"
      />
      <rect fill="#0f766e" height="18" rx="6" width="40" x="98" y="18" />
      <circle cx="118" cy="25" fill="#ffffff" r="2.5" />

      <circle cx="88" cy="54" fill="#0f766e" r="8" />
      <circle cx="88" cy="51.5" fill="#ffffff" r="2.6" />
      <path d="M83.5 58.5a5 5 0 0 1 9 0" fill="#ffffff" />
      <rect fill="#134e4a" height="5" rx="2.5" width="46" x="102" y="47" />
      <rect fill="#cbd5e1" height="4" rx="2" width="30" x="102" y="57" />

      {[74, 94].map((y) => (
        <g key={y}>
          <rect
            fill="#f8fafc"
            height="13"
            rx="4"
            stroke="#cbd5e1"
            width="74"
            x="81"
            y={y}
          />
          <rect fill="#94a3b8" height="3" rx="1.5" width="22" x="87" y={y + 5} />
        </g>
      ))}

      <rect fill="#0f766e" height="10" rx="2.5" width="10" x="81" y="115" />
      <path
        d="M83.5 120l2 2 3.5-4"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <rect fill="#cbd5e1" height="4" rx="2" width="40" x="96" y="118" />
      <rect fill="#0f766e" height="10" rx="5" width="46" x="81" y="132" />

      {/* Done badge */}
      <circle cx="66" cy="40" fill="#0f766e" r="13" />
      <path
        d="M60 40l4.5 4.5 8-9"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />

      {/* Pencil */}
      <g transform="rotate(38 176 92)">
        <rect fill="#fda4af" height="12" rx="4" width="14" x="169" y="40" />
        <rect fill="#cbd5e1" height="6" width="14" x="169" y="50" />
        <rect fill="#f59e0b" height="62" width="14" x="169" y="56" />
        <rect fill="#d97706" height="62" width="4" x="179" y="56" />
        <path d="M169 118h14l-7 16z" fill="#fde7c7" />
        <path d="M173.5 128.5h5l-2.5 5.5z" fill="#334155" />
      </g>

      <Sparkle color="#f59e0b" size={7} x={204} y={42} />
    </svg>
  );
}
