import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  IdCard,
  LinkIcon,
  Map as MapIcon,
  MapPin,
  SendHorizontal,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  TimerOff,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import buildingBackground from "../assets/images/building-bg-soft.webp";
import ministryLogo from "../assets/images/mof-logo-light.webp";
import SiteCredit from "../components/SiteCredit.jsx";
import { RatingFace, ReviewBubbleArt, ThanksEnvelopeArt } from "../components/feedback/FeedbackArt.jsx";
import {
  FEEDBACK_ASPECTS,
  FEEDBACK_COMMENT_LIMIT,
  LOW_RATING_MAX,
  PRAISE_HIGHLIGHTS,
  PROBLEM_HIGHLIGHTS,
  RATING_WORDS,
} from "../constants/feedback.js";
import { apiRequest } from "../lib/api.js";

// The link a visitor gets by SMS after check-out. No sign-in: the short
// code in the address is the only key. One answer per visit, in four
// short steps: rating, what stood out (or went wrong), three quick
// thumbs, then an optional comment and permission to be contacted.

const STEP_COUNT = 4;
const ASPECT_ICONS = { check_in: Clock3, courtesy: UserRoundCheck, wayfinding: MapIcon };

const visitDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Accra",
  weekday: "short",
  year: "numeric",
});

function formatVisitDate(value) {
  return value ? visitDateFormat.format(new Date(value)).replace(",", "") : "";
}

function visitedLine(feedback) {
  return [feedback?.office, feedback?.hostName].filter(Boolean).join(" · ");
}

// ── Frame ─────────────────────────────────────────────────────────────

function Backdrop() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
      <img alt="" className="h-full w-full scale-110 object-cover blur-md" decoding="async" src={buildingBackground} />
      <div className="absolute inset-0 bg-[#f4f7f6]/85 dark:bg-[#06100e]/85" />
    </div>
  );
}

// Dotted texture and two soft rings on the brand panel. Pure decoration.
function PanelTexture() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] bg-size-[14px_14px]" />
      <div className="absolute -right-16 -top-20 size-56 rounded-full border-[18px] border-white/5" />
      <div className="absolute -right-4 -top-8 size-32 rounded-full border-[10px] border-white/5" />
    </div>
  );
}

function Lockup() {
  return (
    <div className="relative flex flex-col items-center">
      <img
        alt="Ministry of Finance, Republic of Ghana"
        className="h-14 w-auto lg:h-[4.5rem]"
        decoding="async"
        height="194"
        src={ministryLogo}
        width="480"
      />
      <p className="mt-2 text-sm font-bold text-brand-300">Visitor feedback</p>
    </div>
  );
}

function VisitDetails({ feedback, roomy = false }) {
  const visited = visitedLine(feedback);
  const date = formatVisitDate(feedback?.visitedAt);
  const rows = [
    { icon: MapPin, label: "Visited", value: visited },
    { icon: CalendarDays, label: "Date", value: date },
    { icon: IdCard, label: "Reference", mono: true, value: feedback?.reference },
  ].filter((row) => row.value);

  if (!rows.length) {
    return null;
  }

  if (roomy) {
    return (
      <dl className="relative space-y-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        {rows.map(({ icon: Icon, label, mono, value }) => (
          <div className="relative min-w-0 pl-12" key={label}>
            <dt className="text-xs font-semibold text-brand-100/80">
              <span className="absolute left-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl bg-white/10 text-brand-200">
                <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
              </span>
              {label}
            </dt>
            <dd className={`truncate text-base font-bold text-white ${mono ? "font-mono text-sm tracking-wide" : ""}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const [first, ...rest] = rows;

  return (
    <dl className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="col-span-2">
        <dt className="text-xs font-semibold text-brand-100/80">{first.label}</dt>
        <dd className={`truncate text-sm font-bold text-white ${first.mono ? "font-mono tracking-wide" : ""}`}>{first.value}</dd>
      </div>
      {rest.map(({ label, mono, value }) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs font-semibold text-brand-100/80">{label}</dt>
          <dd className={`text-sm font-bold text-white ${mono ? "font-mono tracking-wide" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Phone: brand header on top of the white card. Desktop: brand panel on
// the left, the question on the right.
function Frame({ children, feedback }) {
  const firstName = feedback?.firstName;

  return (
    <div className="relative isolate flex min-h-dvh flex-col text-slate-950">
      <Backdrop />
      <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 lg:py-14" id="main-content">
        <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-white shadow-[0_30px_80px_-36px_rgb(15_23_42/0.45)] ring-1 ring-slate-900/5 lg:grid lg:min-h-[43rem] lg:max-w-5xl lg:grid-cols-[22rem_1fr]">
          <header className="relative overflow-hidden bg-brand-900 px-5 pb-5 pt-6 text-white lg:flex lg:flex-col lg:bg-[linear-gradient(180deg,#115e59_0%,#0b3f3b_100%)] lg:px-7 lg:pb-7 lg:pt-9">
            <PanelTexture />
            <Lockup />

            <div className="lg:hidden">
              <VisitDetails feedback={feedback} />
            </div>

            <div className="relative hidden flex-1 flex-col lg:flex">
              {firstName ? (
                <p className="mt-3 text-balance text-center text-3xl font-black leading-tight tracking-tight">
                  Thanks for visiting us, {firstName}.
                </p>
              ) : null}
              <div className="my-6 h-px bg-white/10" />
              <VisitDetails feedback={feedback} roomy />
              <ReviewBubbleArt className="mt-auto pt-8" />
              <p className="mt-8 flex gap-2.5 text-sm leading-6 text-brand-50/85">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
                Your answers go to the Client Service Unit and are used only to improve visits.
              </p>
            </div>
          </header>

          <section className="flex min-w-0 flex-col px-5 pb-5 pt-5 sm:px-7 lg:px-12 lg:pb-10 lg:pt-10">{children}</section>
        </div>
      </main>
      <footer className="flex justify-center px-4 pb-6">
        <div className="rounded-full bg-white/80 px-5 py-1 shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
          <SiteCredit />
        </div>
      </footer>
    </div>
  );
}

// ── Progress ─────────────────────────────────────────────────────────

function Progress({ onBack, step }) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      {step > 1 ? (
        <button
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.2} />
          Back
        </button>
      ) : null}
      <div aria-hidden="true" className="ml-auto flex flex-1 gap-1.5 lg:max-w-md">
        {Array.from({ length: STEP_COUNT }, (_, index) => {
          const position = index + 1;
          const fill = position < step ? "w-full" : position === step ? "w-1/2" : "w-0";

          return (
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-100/70 dark:bg-white/10" key={position}>
              <span className={`block h-full rounded-full bg-brand-700 transition-[width] duration-500 ease-out ${fill}`} />
            </span>
          );
        })}
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
        <span className="sr-only">Question </span>
        {step} of {STEP_COUNT}
      </p>
    </div>
  );
}

// ── Questions ────────────────────────────────────────────────────────

function Question({ children, headingRef, hint, title }) {
  const hintId = useId();

  return (
    <div className="step-in">
      <h1
        aria-describedby={hint ? hintId : undefined}
        className="max-w-[22ch] text-balance text-3xl font-black leading-tight tracking-tight text-brand-950 outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        {title}
      </h1>
      {hint ? (
        <p className="mt-2 text-pretty text-base leading-6 text-slate-600" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function RatingStep({ error, onChange, value }) {
  const errorId = useId();

  return (
    <fieldset aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="sr-only">Rate your visit</legend>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {[1, 2, 3, 4, 5].map((level) => {
          const selected = value === level;

          return (
            <label className="group relative cursor-pointer" key={level}>
              <input
                checked={selected}
                className="peer sr-only"
                name="rating"
                onChange={() => onChange(level)}
                type="radio"
                value={level}
              />
              <span
                className={`flex min-h-[6.5rem] flex-col items-center justify-center gap-2 rounded-2xl border px-0.5 py-3 text-center transition duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-600/30 sm:min-h-[7.25rem] ${
                  selected
                    ? "border-brand-700 bg-brand-50 text-brand-900 shadow-[0_10px_24px_-14px_rgb(15_118_110/0.55)]"
                    : "border-slate-200 bg-white text-slate-500 group-hover:border-brand-300 group-hover:text-brand-800"
                }`}
              >
                <RatingFace
                  className={`size-9 transition-transform duration-300 ease-out sm:size-12 ${selected ? "scale-110" : "group-hover:scale-105"}`}
                  level={level}
                />
                <span className={`text-xs leading-tight sm:text-sm ${selected ? "font-black" : "font-semibold text-slate-800"}`}>
                  {RATING_WORDS[level]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-rose-700" id={errorId} role="alert">
          <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2} />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function HighlightsStep({ low, onToggle, selected }) {
  const options = low ? PROBLEM_HIGHLIGHTS : PRAISE_HIGHLIGHTS;

  return (
    <fieldset>
      <legend className="sr-only">{low ? "What went wrong" : "What stood out"}</legend>
      <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap">
        {options.map(({ key, label }) => {
          const checked = selected.includes(key);

          return (
            <label className="group cursor-pointer" key={key}>
              <input checked={checked} className="peer sr-only" onChange={() => onToggle(key)} type="checkbox" />
              <span
                className={`inline-flex min-h-11 items-center gap-2.5 rounded-full border py-1.5 pl-2 pr-4 text-base font-semibold transition duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-600/30 ${
                  checked
                    ? "border-brand-700 bg-brand-50 text-brand-900"
                    : "border-slate-200 bg-white text-slate-800 group-hover:border-brand-300"
                }`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full border transition duration-200 ${
                    checked ? "border-brand-800 bg-brand-800 text-white" : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                </span>
                {label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ThumbButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`grid size-12 place-items-center rounded-xl border transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 ${
        active
          ? "border-brand-800 bg-brand-800 text-white shadow-[0_8px_18px_-10px_rgb(15_118_110/0.7)]"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
    </button>
  );
}

function AspectsStep({ answers, onAnswer }) {
  return (
    <ul className="space-y-3">
      {FEEDBACK_ASPECTS.map(({ field, hint, key, label }) => {
        const Icon = ASPECT_ICONS[key];
        const value = answers[field];
        const labelId = `aspect-${key}`;

        return (
          <li className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 sm:gap-4 sm:p-4" key={key}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800">
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1" id={labelId}>
              <p className="font-bold leading-tight text-slate-950">{label}</p>
              <p className="mt-0.5 text-sm leading-5 text-slate-600">{hint}</p>
            </div>
            <div aria-labelledby={labelId} className="flex shrink-0 gap-2" role="group">
              <ThumbButton
                active={value === true}
                icon={ThumbsUp}
                label={`${label}: good`}
                onClick={() => onAnswer(field, value === true ? null : true)}
              />
              <ThumbButton
                active={value === false}
                icon={ThumbsDown}
                label={`${label}: not good`}
                onClick={() => onAnswer(field, value === false ? null : false)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ContactSwitch({ checked, contact, onChange }) {
  const labelId = useId();
  const detailId = useId();
  const details = [contact?.phone, contact?.email].filter(Boolean);

  if (!details.length) {
    return null;
  }

  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <button
        aria-checked={checked}
        aria-describedby={detailId}
        aria-labelledby={labelId}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 ${
          checked ? "bg-brand-800" : "bg-slate-300"
        }`}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`absolute left-1 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
      <div className="min-w-0">
        <p className="font-bold leading-6 text-slate-950" id={labelId}>
          You may contact me about this feedback
        </p>
        <p className="mt-0.5 text-sm leading-5 text-slate-600" id={detailId}>
          We would use {details.join(" or ")}, the details you gave at reception.
        </p>
      </div>
    </div>
  );
}

function CommentStep({ comment, contact, contactOk, onComment, onContact }) {
  const countId = useId();

  return (
    <div>
      <label className="sr-only" htmlFor="feedback-comment">
        Your comment (optional)
      </label>
      <div className="relative">
        <textarea
          aria-describedby={countId}
          className="block min-h-36 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 pb-8 pt-3 text-base leading-6 text-slate-950 shadow-xs placeholder:text-slate-600 focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-600/30"
          id="feedback-comment"
          maxLength={FEEDBACK_COMMENT_LIMIT}
          onChange={(event) => onComment(event.target.value)}
          placeholder="A name to thank, or something we should keep doing…"
          value={comment}
        />
        <p className="pointer-events-none absolute bottom-2.5 right-4 text-xs font-semibold tabular-nums text-slate-600" id={countId}>
          {comment.length} / {FEEDBACK_COMMENT_LIMIT}
        </p>
      </div>
      <ContactSwitch checked={contactOk} contact={contact} onChange={onContact} />
    </div>
  );
}

// ── Footer actions ───────────────────────────────────────────────────

function PrimaryButton({ children, disabledLook = false, icon: Icon = ArrowRight, ...props }) {
  return (
    <button
      className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-6 text-base font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 sm:flex-none sm:min-w-44 ${
        disabledLook
          ? "cursor-not-allowed bg-slate-200 text-slate-600"
          : "bg-brand-800 text-white shadow-[0_10px_15px_-3px_rgb(15_118_110/0.25)] hover:bg-brand-900 disabled:cursor-wait disabled:opacity-70"
      }`}
      {...props}
    >
      {children}
      <Icon aria-hidden="true" className="size-4" strokeWidth={2.2} />
    </button>
  );
}

function Actions({ hint, onSkip, primary }) {
  return (
    <div className="mt-8 flex items-center gap-3 border-t border-slate-100 pt-5 lg:mt-auto">
      {onSkip ? (
        <button
          className="inline-flex min-h-12 items-center rounded-xl px-4 text-base font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30"
          onClick={onSkip}
          type="button"
        >
          Skip
        </button>
      ) : hint ? (
        <p className="hidden text-sm text-slate-600 sm:block">{hint}</p>
      ) : null}
      <div className="flex flex-1 justify-end">{primary}</div>
    </div>
  );
}

// ── Notices and thanks ───────────────────────────────────────────────

function Notice({ children, icon: Icon, title }) {
  const headingRef = useRef(null);

  return (
    <div className="step-in flex flex-1 flex-col items-center justify-center py-10 text-center" role="status">
      <span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-800">
        <Icon aria-hidden="true" className="size-8" strokeWidth={1.6} />
      </span>
      <h1 className="mt-5 text-balance text-2xl font-black tracking-tight text-brand-950" ref={headingRef}>
        {title}
      </h1>
      <p className="mt-2 max-w-sm text-pretty leading-7 text-slate-600">{children}</p>
    </div>
  );
}

function Thanks({ contactOk, firstName, rating, reference }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="step-in flex flex-1 flex-col items-center justify-center py-6 text-center">
      <ThanksEnvelopeArt />
      <h1
        className="mt-4 text-balance text-3xl font-black leading-tight tracking-tight text-brand-950 outline-none sm:text-5xl"
        ref={headingRef}
        tabIndex={-1}
      >
        {firstName ? `Thank you, ${firstName}!` : "Thank you!"}
      </h1>
      <p className="mt-3 max-w-md text-pretty leading-7 text-slate-600">
        {rating
          ? "Your feedback went straight to the Client Service Unit. We read every response and use it to make visits better."
          : "We already have your feedback for this visit. The Client Service Unit reads every response."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {rating ? (
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-sm font-semibold text-brand-900">
            You rated: <span className="font-black">{RATING_WORDS[rating]}</span>
          </span>
        ) : null}
        {reference ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-brand-200 px-3.5 font-mono text-sm font-semibold tracking-wide text-brand-900">
            {reference}
          </span>
        ) : null}
      </div>
      <p className="mt-5 max-w-md text-pretty text-sm leading-6 text-slate-600">
        {contactOk ? "If we need more detail, someone from the Client Service Unit may contact you. " : ""}
        You can close this page now.
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

const EMPTY_ANSWERS = Object.freeze({
  checkInOk: null,
  comment: "",
  contactOk: false,
  courtesyOk: null,
  highlights: [],
  rating: 0,
  wayfindingOk: null,
});

export default function VisitorFeedbackPage() {
  const { code = "" } = useParams();
  const [state, setState] = useState({ code: "", error: "", feedback: null });
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [step, setStep] = useState(1);
  const [ratingError, setRatingError] = useState("");
  const [submit, setSubmit] = useState({ error: "", saved: false, saving: false });
  const headingRef = useRef(null);
  const movedRef = useRef(false);
  const loading = state.code !== code;
  const low = answers.rating > 0 && answers.rating <= LOW_RATING_MAX;

  useEffect(() => {
    document.title = "Rate your visit · Ministry of Finance";
    let active = true;

    apiRequest("/api/feedback/view", { body: JSON.stringify({ code }), method: "POST" })
      .then((response) => {
        if (active) {
          setState({ code, error: "", feedback: response.feedback });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ code, error: error.status === 404 ? "invalid" : "unavailable", feedback: null });
        }
      });

    return () => {
      active = false;
    };
  }, [code]);

  // Move focus to the new question after Back/Continue, not on arrival.
  useEffect(() => {
    if (movedRef.current) {
      headingRef.current?.focus();
    }
  }, [step]);

  function update(patch) {
    setAnswers((current) => ({ ...current, ...patch }));
  }

  function goTo(next) {
    movedRef.current = true;
    setSubmit((current) => ({ ...current, error: "" }));
    setStep(next);
  }

  function chooseRating(rating) {
    const wasLow = answers.rating > 0 && answers.rating <= LOW_RATING_MAX;
    const isLow = rating <= LOW_RATING_MAX;

    // Praise and problem choices do not mix: switching side clears them.
    update({ highlights: wasLow === isLow ? answers.highlights : [], rating });
    setRatingError("");
  }

  function toggleHighlight(key) {
    update({
      highlights: answers.highlights.includes(key)
        ? answers.highlights.filter((item) => item !== key)
        : [...answers.highlights, key],
    });
  }

  async function send() {
    setSubmit({ error: "", saved: false, saving: true });

    try {
      await apiRequest("/api/feedback/submit", {
        body: JSON.stringify({ ...answers, code }),
        method: "POST",
      });
      setSubmit({ error: "", saved: true, saving: false });
    } catch (error) {
      setSubmit({ error: error.message, saved: false, saving: false });
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (step === 1) {
      if (!answers.rating) {
        setRatingError("Choose a face to continue.");
        return;
      }

      goTo(2);
      return;
    }

    if (step < STEP_COUNT) {
      goTo(step + 1);
      return;
    }

    send();
  }

  const feedback = state.feedback;

  if (loading) {
    return (
      <Frame feedback={null}>
        <div className="flex flex-1 flex-col justify-center gap-4 py-10" role="status">
          <span className="sr-only">Opening your feedback form…</span>
          <span aria-hidden="true" className="h-2 w-24 animate-pulse rounded-full bg-slate-200" />
          <span aria-hidden="true" className="h-8 w-3/4 animate-pulse rounded-xl bg-slate-200" />
          <span aria-hidden="true" className="h-24 w-full animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </Frame>
    );
  }

  if (state.error === "invalid") {
    return (
      <Frame feedback={null}>
        <Notice icon={LinkIcon} title="Link not valid">
          This feedback link is not valid. Check that you opened the full link from your text message.
        </Notice>
      </Frame>
    );
  }

  if (state.error) {
    return (
      <Frame feedback={null}>
        <Notice icon={TriangleAlert} title="Something went wrong">
          The feedback form could not be opened. Please check your connection and try again.
        </Notice>
      </Frame>
    );
  }

  if (submit.saved || feedback?.status === "submitted") {
    return (
      <Frame feedback={feedback}>
        <Thanks
          contactOk={submit.saved && answers.contactOk}
          firstName={feedback?.firstName}
          rating={submit.saved ? answers.rating : 0}
          reference={feedback?.reference}
        />
      </Frame>
    );
  }

  if (feedback?.status === "expired") {
    return (
      <Frame feedback={feedback}>
        <Notice icon={TimerOff} title="This link has expired">
          Feedback links stay open for 7 days after a visit. Thank you for thinking of us.
        </Notice>
      </Frame>
    );
  }

  const questions = {
    1: {
      hint: "Tap the face that fits best. Four quick questions, about 30 seconds.",
      title: "How was your visit to the Ministry today?",
    },
    2: low
      ? { hint: "Sorry to hear that. Pick any that apply.", title: "What went wrong?" }
      : {
          hint: answers.rating >= 4 ? "Glad to hear it. Pick as many as you like." : "Pick as many as you like.",
          title: "What stood out?",
        },
    3: { hint: "Thumbs up or down. Skip any that did not apply.", title: "How did each part of your visit go?" },
    4: { hint: "This last step is optional.", title: "Anything else you would like to share?" },
  }[step];

  return (
    <Frame feedback={feedback}>
      <Progress onBack={() => goTo(step - 1)} step={step} />
      <form className="mt-6 flex flex-1 flex-col lg:mt-0" noValidate onSubmit={handleSubmit}>
        <div className="flex flex-1 flex-col lg:justify-center lg:py-10">
          <Question headingRef={headingRef} hint={questions.hint} key={step} title={questions.title}>
            {step === 1 ? <RatingStep error={ratingError} onChange={chooseRating} value={answers.rating} /> : null}
            {step === 2 ? <HighlightsStep low={low} onToggle={toggleHighlight} selected={answers.highlights} /> : null}
            {step === 3 ? <AspectsStep answers={answers} onAnswer={(field, value) => update({ [field]: value })} /> : null}
            {step === 4 ? (
              <CommentStep
                comment={answers.comment}
                contact={feedback?.contact}
                contactOk={answers.contactOk}
                onComment={(comment) => update({ comment })}
                onContact={(contactOk) => update({ contactOk })}
              />
            ) : null}
          </Question>

          {submit.error ? (
            <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">
              {submit.error}
            </p>
          ) : null}
        </div>

        <Actions
          hint={step === 1 ? "Required" : "Optional"}
          onSkip={step === 2 || step === 3 ? () => goTo(step + 1) : null}
          primary={
            step === STEP_COUNT ? (
              <PrimaryButton disabled={submit.saving} icon={SendHorizontal} type="submit">
                {submit.saving ? "Sending…" : "Send feedback"}
              </PrimaryButton>
            ) : (
              <PrimaryButton aria-disabled={step === 1 && !answers.rating ? true : undefined} disabledLook={step === 1 && !answers.rating} type="submit">
                Continue
              </PrimaryButton>
            )
          }
        />
      </form>
    </Frame>
  );
}
