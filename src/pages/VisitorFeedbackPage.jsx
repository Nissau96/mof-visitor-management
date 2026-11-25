import { CheckCircle2, MessageSquareHeart, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import SiteCredit from "../components/SiteCredit.jsx";
import { apiRequest } from "../lib/api.js";

// The link a visitor gets by SMS after check-out. No sign-in: the short
// code in the address is the only key. One answer per visit.

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const COMMENT_LIMIT = 1000;

function Shell({ children }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      </main>
      <footer className="px-4 pb-8 pt-4">
        <SiteCredit />
      </footer>
    </div>
  );
}

function Notice({ icon: Icon = MessageSquareHeart, title, children }) {
  return (
    <Shell>
      <div className="flex flex-col items-center text-center" role="status">
        <Icon aria-hidden="true" className="size-12 text-brand-800" strokeWidth={1.6} />
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-sm leading-7 text-slate-600">{children}</p>
      </div>
    </Shell>
  );
}

function StarRating({ onChange, value }) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-900">
        Your rating <span className="text-rose-700">*</span>
      </legend>
      <div className="mt-3 flex gap-1 sm:gap-2">
        {[1, 2, 3, 4, 5].map((stars) => (
          <label className="relative cursor-pointer" key={stars}>
            <input
              checked={value === stars}
              className="peer sr-only"
              name="rating"
              onChange={() => onChange(stars)}
              type="radio"
              value={stars}
            />
            <span className="sr-only">
              {stars} {stars === 1 ? "star" : "stars"}, {RATING_WORDS[stars]}
            </span>
            <Star
              aria-hidden="true"
              className={`size-11 rounded-lg p-1 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand-200 ${
                value >= stars ? "fill-amber-400 text-amber-500" : "text-slate-300 hover:text-amber-400"
              }`}
              strokeWidth={1.6}
            />
          </label>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 min-h-6 text-sm font-semibold text-slate-700">
        {value ? RATING_WORDS[value] : ""}
      </p>
    </fieldset>
  );
}

export default function VisitorFeedbackPage() {
  const { code = "" } = useParams();
  const [state, setState] = useState({ code: "", error: "", feedback: null });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submit, setSubmit] = useState({ error: "", saving: false, saved: false });
  const loading = state.code !== code;

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

  async function handleSubmit(event) {
    event.preventDefault();

    if (!rating) {
      setSubmit({ error: "Choose a rating from 1 to 5 stars.", saving: false, saved: false });
      return;
    }

    setSubmit({ error: "", saving: true, saved: false });

    try {
      await apiRequest("/api/feedback/submit", {
        body: JSON.stringify({ code, comment, rating }),
        method: "POST",
      });
      setSubmit({ error: "", saving: false, saved: true });
    } catch (error) {
      setSubmit({ error: error.message, saving: false, saved: false });
    }
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-slate-600" role="status">
          Opening your feedback form…
        </p>
      </Shell>
    );
  }

  if (state.error === "invalid") {
    return <Notice title="Link not valid">This feedback link is not valid. Check that you opened the full link from your message.</Notice>;
  }

  if (state.error) {
    return <Notice title="Something went wrong">The feedback form could not be opened. Please try again later.</Notice>;
  }

  if (submit.saved || state.feedback?.status === "submitted") {
    return (
      <Notice icon={CheckCircle2} title="Thank you">
        Your feedback has been received. It helps the Ministry of Finance improve how visitors are welcomed.
      </Notice>
    );
  }

  if (state.feedback?.status === "expired") {
    return <Notice title="Link expired">Feedback links stay open for 7 days after a visit. This one has expired.</Notice>;
  }

  return (
    <Shell>
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-800">Ministry of Finance</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">How was your visit?</h1>
      {state.feedback?.reference ? (
        <p className="mt-2 text-sm text-slate-600">
          Visit reference <span className="font-semibold text-slate-900">{state.feedback.reference}</span>
        </p>
      ) : null}

      <form className="mt-6 space-y-6" noValidate onSubmit={handleSubmit}>
        <StarRating onChange={setRating} value={rating} />

        <div>
          <label className="text-sm font-bold text-slate-900" htmlFor="feedback-comment">
            Anything we should know? <span className="font-normal text-slate-600">(optional)</span>
          </label>
          <textarea
            aria-describedby="feedback-comment-count"
            className="mt-2 block min-h-32 w-full rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-100"
            id="feedback-comment"
            maxLength={COMMENT_LIMIT}
            onChange={(event) => setComment(event.target.value)}
            value={comment}
          />
          <p className="mt-1 text-right text-xs text-slate-600" id="feedback-comment-count">
            {comment.length}/{COMMENT_LIMIT}
          </p>
        </div>

        {submit.error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800" role="alert">
            {submit.error}
          </p>
        ) : null}

        <button
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
          disabled={submit.saving}
          type="submit"
        >
          {submit.saving ? "Sending…" : "Send feedback"}
        </button>
      </form>
    </Shell>
  );
}
