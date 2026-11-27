import DialogHeader from "./DialogHeader.jsx";
import { useId } from "react";

// Modal shell for administration forms: the shared DialogHeader (chip,
// title, optional description, illustration and close button). Put the form inside
// and use DialogBody and DialogFooter so the actions sit on their own
// divided strip. Escape closes the dialog unless it is busy. An optional
// icon is drawn into the header illustration; tone tints the header
// (brand, warning or danger).
export default function AdminDialog({
  busy = false,
  children,
  closeLabel = "Close dialog",
  description,
  eyebrow,
  icon: Icon,
  onClose,
  title,
  tone = "brand",
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
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
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-4xl bg-white shadow-2xl shadow-slate-950/30 [&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col"
        role="dialog"
      >
        <DialogHeader
          busy={busy}
          closeLabel={closeLabel}
          description={description}
          descriptionId={descriptionId}
          eyebrow={eyebrow}
          icon={Icon}
          onClose={onClose}
          title={title}
          titleId={titleId}
          tone={tone}
        />

        {children}
      </section>
    </div>
  );
}

// The only part of a dialog that scrolls.
export function DialogBody({ children, className = "", ...props }) {
  return (
    <div
      className={`scroll-pane grid min-h-0 flex-1 content-start gap-5 px-5 py-6 sm:px-7 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogFooter({ children }) {
  return (
    <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
      {children}
    </div>
  );
}

export const DIALOG_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-black transition-colors focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed";

export const DIALOG_CANCEL_BUTTON = `${DIALOG_BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60`;

export const DIALOG_PRIMARY_BUTTON = `${DIALOG_BUTTON} bg-linear-to-r from-[#0e8077] to-[#115e59] text-[#ffffff] shadow-lg shadow-[#0f766e]/25 hover:from-[#0f766e] hover:to-[#134e4a] disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none`;

// Rounded text input used inside administration dialogs.
export const DIALOG_INPUT =
  "min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";
