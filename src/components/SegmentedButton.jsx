// Pill-shaped option inside a rounded segmented control (tabs or filters).
export default function SegmentedButton({
  active,
  children,
  className = "",
  onClick,
  ...props
}) {
  return (
    <button
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm transition ${className} ${
        active
          ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
          : "font-semibold text-slate-600 hover:text-slate-900"
      }`}
      onClick={onClick}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
