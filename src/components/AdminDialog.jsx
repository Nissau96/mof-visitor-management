import { X } from "lucide-react";
import { useId } from "react";

// Modal shell for administration forms: eyebrow, title, optional
// description and a close button above a divider. Put the form inside
// and use DialogBody and DialogFooter so the actions sit on their own
// divided strip. Escape closes the dialog unless it is busy.
export default function AdminDialog({
  busy = false,
  children,
  closeLabel = "Close dialog",
  description,
  eyebrow,
  onClose,
  title,
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 pb-5 pt-6 sm:px-7">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-700">
                {eyebrow}
              </p>
            ) : null}

            <h2
              className="mt-1 text-2xl font-black tracking-tight text-slate-950"
              id={titleId}
            >
              {title}
            </h2>

            {description ? (
              <p
                className="mt-2 text-sm leading-6 text-slate-600"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>

          <button
            aria-label={closeLabel}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}

export function DialogBody({ children }) {
  return (
    <div className="grid gap-5 px-5 py-6 sm:px-7">
      {children}
    </div>
  );
}

export function DialogFooter({ children }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
      {children}
    </div>
  );
}

export const DIALOG_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-black transition focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed";

export const DIALOG_CANCEL_BUTTON = `${DIALOG_BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60`;

export const DIALOG_PRIMARY_BUTTON = `${DIALOG_BUTTON} bg-brand-800 text-white hover:bg-brand-900 disabled:bg-slate-200 disabled:text-slate-500`;

// Rounded text input used inside administration dialogs.
export const DIALOG_INPUT =
  "min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";
