/**
 * The copyright and credit line at the foot of every layout. Layouts wrap
 * it in their own <footer>, so it stays one element and never nests a
 * footer inside another. `tone="dark"` is for teal or photo backgrounds.
 */
export default function SiteCredit({ className = "", tone = "light" }) {
  const year = new Date().getFullYear();
  const muted = tone === "dark" ? "text-white/80" : "text-slate-600";
  const strong = tone === "dark" ? "text-white" : "text-slate-800";

  return (
    <p className={`text-center text-xs leading-5 ${muted} ${className}`}>
      <span className="whitespace-nowrap">
        © {year} <span className={`font-semibold ${strong}`}>Ministry of Finance</span>
      </span>
      <span aria-hidden="true" className="mx-2 max-sm:hidden">
        ·
      </span>
      <br className="sm:hidden" />
      <span className="whitespace-nowrap">
        Developed and managed by <span className={`font-semibold ${strong}`}>PFMSD – SSU</span>
      </span>
    </p>
  );
}
