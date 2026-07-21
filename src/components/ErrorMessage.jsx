import { AlertCircle } from "lucide-react";

export default function ErrorMessage({
  message = "The request could not be completed. Please try again.",
  onRetry,
  title = "Something went wrong",
}) {
  return (
    <section
      aria-atomic="true"
      className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm leading-6">{message}</p>
          {onRetry ? (
            <button
              className="mt-4 min-h-11 rounded-xl bg-red-800 px-4 text-sm font-bold text-white"
              onClick={onRetry}
              type="button"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
