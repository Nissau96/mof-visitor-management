import { ArrowLeft, Check, Info } from "lucide-react";
import { Link } from "react-router-dom";
import ministryLogo from "../assets/images/mof-logo.webp";

// Shared frame for the visitor forms (first visit, returning visit):
// one card over the building background with the logo, a Back pill,
// a step bar and numbered section cards.

export function VisitorCardShell({ children, wash = true }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="relative isolate overflow-hidden rounded-[2rem] border border-[#ffffff]/80 bg-[#f8fbfa]/95 p-5 shadow-xl shadow-slate-900/5 sm:p-7 dark:border-[#1f2d40] dark:bg-[#0d1626]/95">
        {/* Mint wash behind the illustration and the top of section 1 */}
        {wash ? (
          <div
            aria-hidden="true"
            className="absolute -right-10 top-28 -z-10 hidden h-80 w-[48%] rounded-l-[10rem] bg-[#dcf6f0] sm:block dark:bg-[#0b2b29]"
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

// Logo and Back pill, then the eyebrow, title and description beside
// the illustration (hidden on phones so the form starts sooner).
export function VisitorCardHeader({
  backTo = "/visit",
  children,
  description,
  eyebrow,
  illustration,
  title,
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <img
          alt="Ministry of Finance, Republic of Ghana"
          className="h-14 w-auto sm:h-16 dark:rounded-xl dark:bg-[#ffffff] dark:p-1.5"
          decoding="async"
          height="66"
          src={ministryLogo}
          width="166"
        />

        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#0f766e] bg-white px-4 text-sm font-bold text-[#0f766e] transition hover:bg-[#f0fdfa] focus-visible:ring-4 focus-visible:ring-brand-200 dark:border-[#5eead4] dark:text-[#5eead4]"
          to={backTo}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Link>
      </div>

      <div className="mt-4 grid items-end gap-6 sm:grid-cols-[minmax(0,1fr)_11rem] md:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <p className="inline-flex rounded-full border border-[#99e2d6] bg-[#f0fdfa] px-4 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#0f766e] dark:border-[#14756d] dark:bg-[#0b2b29] dark:text-[#5eead4]">
            {eyebrow}
          </p>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {title}
          </h1>

          <p className="mt-2 max-w-md text-base text-slate-600">
            {description}
          </p>

          {children}
        </div>

        {illustration}
      </div>
    </>
  );
}

// "3 of 5 required details" with a bar, under the page title.
export function RequiredProgress({ done, idPrefix, total }) {
  const percent = total
    ? Math.round((done / total) * 100)
    : 0;

  return (
    <div className="mt-5 max-w-md">
      <div className="flex items-center justify-between text-sm font-bold text-slate-900">
        <span id={`${idPrefix}-progress-label`}>
          {done} of {total} required details
        </span>
        <span aria-hidden="true">{percent}%</span>
      </div>

      <div
        aria-labelledby={`${idPrefix}-progress-label`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={done}
        className="mt-2 h-2 overflow-hidden rounded-full bg-[#ccfbf1] dark:bg-[#0f3a37]"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-[#0f766e] transition-[width] duration-300 dark:bg-[#2dd4bf]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function StepIndicator({ label, step, steps }) {
  return (
    <ol aria-label={label} className="mt-6 flex items-center gap-3">
      {steps.map((stepLabel, index) => {
        const number = index + 1;
        const done = number < step;
        const current = number === step;

        return (
          <li
            aria-current={current ? "step" : undefined}
            className={`flex min-w-0 flex-1 items-center gap-3 ${
              current && steps.length > 2 ? "max-sm:flex-auto" : ""
            }`}
            key={stepLabel}
          >
            <span
              aria-hidden="true"
              className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-black ${
                current || done
                  ? "bg-[#0f766e] text-[#ffffff]"
                  : "bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]"
              }`}
            >
              {done ? <Check className="size-4" /> : number}
            </span>

            {/* With three steps, phones show only the current label. */}
            <span
              className={`truncate text-sm ${
                current
                  ? "font-black text-slate-950"
                  : `font-semibold text-slate-600 ${
                      steps.length > 2 ? "max-sm:sr-only" : ""
                    }`
              }`}
            >
              <span className="sr-only">
                {`Step ${number} of ${steps.length}: `}
              </span>
              {stepLabel}
              {done ? (
                <span className="sr-only"> (completed)</span>
              ) : null}
            </span>

            {number < steps.length ? (
              <span
                aria-hidden="true"
                className={`h-0.5 min-w-6 flex-1 rounded-full ${
                  done ? "bg-[#0f766e]" : "bg-slate-200"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// A numbered step card. The heading takes focus when a step opens.
export function FormSection({
  children,
  description,
  icon: Icon,
  idPrefix = "registration",
  number,
  title,
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#14b8a6] to-[#0f766e] text-lg font-black text-[#ffffff] shadow-md shadow-[#0f766e]/25"
        >
          {number}
        </span>

        <div className="min-w-0 flex-1">
          <h2
            className="text-xl font-black tracking-tight text-slate-950 outline-none"
            id={`${idPrefix}-step-${number}`}
            tabIndex={-1}
          >
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {description}
          </p>
        </div>

        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]"
        >
          <Icon className="size-5" />
        </span>
      </div>

      <div className="mt-6 grid gap-5">{children}</div>
    </section>
  );
}

// Grey until the step's required fields are filled, but always
// clickable so a press shows what is missing. The colour switches
// instantly so it is never caught at half contrast.
export function StepButton({ children, ready, ...props }) {
  return (
    <button
      className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-black transition-shadow focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        ready
          ? "bg-[#0f766e] text-[#ffffff] shadow-lg shadow-[#0f766e]/25 hover:bg-[#115e59]"
          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

// The quiet partner of StepButton, for going back a step.
export function SecondaryStepButton({ children, ...props }) {
  return (
    <button
      className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-base font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function IconInput({ children, icon: Icon }) {
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500"
      />
      {children}
    </div>
  );
}

export function VisitorPrivacyFootnote() {
  return (
    <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-600 sm:rounded-full">
      <Info aria-hidden="true" className="size-4 shrink-0" />
      Visitor information is handled for access and security purposes.
    </p>
  );
}
