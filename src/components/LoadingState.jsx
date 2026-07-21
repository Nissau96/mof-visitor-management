import { LoaderCircle } from "lucide-react";

export default function LoadingState({ message = "Loading…" }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-32 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700"
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      <span className="font-semibold">{message}</span>
    </div>
  );
}
