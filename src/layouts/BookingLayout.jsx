import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Link2,
  ListChecks,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import SiteCredit from "../components/SiteCredit.jsx";
import buildingBackground from "../assets/images/building-bg-soft.webp";
import ministryLogo from "../assets/images/Asset-8.svg";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import Toaster from "../components/Toaster.jsx";
import {
  WORK_EMAIL_SIGN_IN_CONFIGURED,
  getSignedInBooker,
  signInWithWorkEmail,
  signOutWorkEmail,
} from "../lib/workEmailSignIn.js";

// /book and /book/mine: Ministry staff book meetings for their guests.
// They sign in with their work email; nothing else on the page shows
// until they have.

function MicrosoftMark() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 21 21">
      <path d="M1 1h9v9H1z" fill="#f25022" />
      <path d="M11 1h9v9h-9z" fill="#7fba00" />
      <path d="M1 11h9v9H1z" fill="#00a4ef" />
      <path d="M11 11h9v9h-9z" fill="#ffb900" />
    </svg>
  );
}

// The white card every signed-out state sits in: the Ministry mark on
// top, the state's content, and an optional reassurance band below.
function GateCard({ children, labelledBy, note }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="mx-auto w-full max-w-[36rem] overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_24px_80px_-30px_rgba(15,23,42,0.4)]"
    >
      <div className="flex flex-col items-center px-5 pb-8 pt-9 text-center sm:px-12 sm:pt-10">
        <img
          alt="Ministry of Finance, Republic of Ghana"
          className="h-16 w-auto rounded-lg dark:bg-[#ffffff] dark:p-1.5 sm:h-[4.5rem]"
          decoding="async"
          height="141"
          src={ministryLogo}
          width="349"
        />
        <span aria-hidden="true" className="mt-5 h-1 w-10 rounded-full bg-brand-100" />
        {children}
      </div>

      {note ? (
        <p className="flex items-center justify-center gap-2 border-t border-slate-100 bg-brand-50/60 px-5 py-4 text-center text-sm text-slate-700">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
          {note}
        </p>
      ) : null}
    </section>
  );
}

const BOOKING_STEPS = Object.freeze([
  { icon: CalendarCheck, label: "Book the meeting" },
  { icon: UserPlus, label: "Add your guests" },
]);

function SignInCard({ error, onSignIn, signingIn }) {
  return (
    <GateCard
      labelledBy="booking-sign-in-heading"
      note="Reception reviews every booking before guests arrive."
    >
      <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-brand-800">
        <CalendarDays aria-hidden="true" className="size-3.5" />
        Meeting bookings
      </p>

      <h1
        className="mt-4 text-balance text-3xl font-black tracking-tight text-brand-950"
        id="booking-sign-in-heading"
      >
        Book a meeting at reception
      </h1>

      <p className="mt-3 max-w-md text-pretty leading-7 text-slate-600">
        List your guests before they arrive, so reception has their
        details ready. Sign in with your Ministry work email to continue.
      </p>

      <ol aria-label="How booking works" className="mt-7 grid w-full grid-cols-2 gap-3">
        {BOOKING_STEPS.map(({ icon: Icon, label }) => (
          <li
            className="flex flex-col items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/50 px-3 py-5"
            key={label}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-white text-brand-800 shadow-sm">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="text-sm font-bold text-brand-900">{label}</span>
          </li>
        ))}
      </ol>

      {error ? (
        <div className="mt-6 w-full text-left">
          <ErrorMessage message={error} title="Sign-in unsuccessful" />
        </div>
      ) : null}

      <button
        className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full bg-[#0b0f14] px-4 text-sm font-bold sm:gap-3 sm:px-6 sm:text-base text-white shadow-[0_12px_24px_-12px_rgba(2,6,23,0.6)] transition hover:bg-[#1b222b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 disabled:cursor-wait disabled:opacity-70 dark:ring-1 dark:ring-white/15"
        disabled={signingIn}
        onClick={onSignIn}
        type="button"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#ffffff]">
          {signingIn ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-[#0b0f14]" />
          ) : (
            <MicrosoftMark />
          )}
        </span>
        {signingIn
          ? "Finish signing in in the Microsoft window…"
          : "Sign in with Work Email"}
      </button>

      <p className="mt-4 text-sm text-slate-600">
        Only Ministry staff accounts can book.
      </p>
    </GateCard>
  );
}

function initialsOf(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "?"
  );
}

// "Signed in as" button that opens a small panel with the work email
// and Sign out. Closes on Escape, on a click elsewhere and after use.
function AccountMenu({ booker, onSignOut }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative justify-self-end" ref={rootRef}>
      <button
        aria-controls="booking-account-panel"
        aria-expanded={open}
        className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800"
        >
          {initialsOf(booker.name)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block text-xs text-slate-600">Signed in as</span>
          <span className="block max-w-48 truncate text-sm font-bold text-slate-950">
            {booker.name}
          </span>
        </span>
        <span className="sr-only sm:hidden">Account: {booker.name}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.4)]"
          id="booking-account-panel"
        >
          <div className="px-3 py-2">
            <p className="font-bold text-slate-950">{booker.name}</p>
            <p className="break-all text-sm text-slate-600">{booker.email}</p>
          </div>
          <button
            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 focus-visible:ring-4 focus-visible:ring-brand-200"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

const NAV_LINK =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm sm:px-4 font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200";

export default function BookingLayout() {
  const [booker, setBooker] = useState(null);
  const [status, setStatus] = useState(
    WORK_EMAIL_SIGN_IN_CONFIGURED ? "loading" : "unconfigured",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!WORK_EMAIL_SIGN_IN_CONFIGURED) {
      return undefined;
    }

    let cancelled = false;

    getSignedInBooker()
      .then((current) => {
        if (!cancelled) {
          setBooker(current);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn() {
    setError("");
    setStatus("signing-in");

    try {
      setBooker(await signInWithWorkEmail());
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setStatus("ready");
    }
  }

  async function signOut() {
    await signOutWorkEmail().catch(() => undefined);
    setBooker(null);
  }

  const outletContext = useMemo(
    () => ({
      booker,
      // Called when the API says the sign-in is no longer valid.
      requireSignIn(message) {
        setBooker(null);
        setError(message || "Sign in with your work email to continue.");
      },
    }),
    [booker],
  );

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-[#eef3f2] text-slate-950 dark:bg-[#07110f]">
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
        <img
          alt=""
          className="h-full w-full scale-110 object-cover blur-md"
          decoding="async"
          src={buildingBackground}
        />
        <div className="absolute inset-0 bg-[#f4f7f6]/85 dark:bg-[#06100e]/85" />
      </div>

      <a
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#booking-content"
      >
        Skip to main content
      </a>

      {/* Signed out, the gate card carries the Ministry mark instead. */}
      {booker ? (
        <header className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-6xl items-center justify-between gap-2 rounded-3xl border border-slate-200/70 bg-white px-2 py-2 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)] sm:mt-5 sm:w-[calc(100%-3rem)] sm:gap-3 sm:px-3">
          <nav
            aria-label="Meeting bookings"
            className="flex min-w-0 gap-1 rounded-full bg-slate-100 p-1"
          >
            <NavLink
              className={({ isActive }) =>
                `${NAV_LINK} justify-center ${isActive ? "bg-brand-800 text-white shadow-[0_10px_15px_-3px_rgba(15,118,110,0.25)]" : "text-slate-700 hover:bg-white hover:text-slate-950"}`
              }
              end
              to="/book"
            >
              <CalendarPlus aria-hidden="true" className="hidden size-4 sm:block" />
              New booking
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `${NAV_LINK} justify-center ${isActive ? "bg-brand-800 text-white shadow-[0_10px_15px_-3px_rgba(15,118,110,0.25)]" : "text-slate-700 hover:bg-white hover:text-slate-950"}`
              }
              to="/book/mine"
            >
              <ListChecks aria-hidden="true" className="hidden size-4 sm:block" />
              My bookings
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `${NAV_LINK} justify-center ${isActive ? "bg-brand-800 text-white shadow-[0_10px_15px_-3px_rgba(15,118,110,0.25)]" : "text-slate-700 hover:bg-white hover:text-slate-950"}`
              }
              to="/book/invite"
            >
              <Link2 aria-hidden="true" className="hidden size-4 sm:block" />
              Invite visitor
            </NavLink>
          </nav>

          <AccountMenu booker={booker} onSignOut={signOut} />
        </header>
      ) : null}

      <main
        className={`flex flex-1 flex-col px-4 sm:px-6 ${booker ? "pb-8" : "justify-center py-8 sm:py-12"}`}
        id="booking-content"
        tabIndex="-1"
      >
        {status === "unconfigured" ? (
          <GateCard labelledBy="booking-unavailable-heading">
            <h1
              className="mt-6 text-2xl font-black tracking-tight text-brand-950"
              id="booking-unavailable-heading"
            >
              Bookings unavailable
            </h1>
            <div className="mt-5 w-full text-left">
              <ErrorMessage
                message="Work email sign-in has not been set up for meeting bookings yet. Contact the system administrator."
                title="Sign-in not set up"
              />
            </div>
          </GateCard>
        ) : status === "loading" ? (
          <GateCard labelledBy="booking-loading-heading">
            <h1 className="sr-only" id="booking-loading-heading">
              Meeting bookings
            </h1>
            <div className="mt-6 w-full">
              <LoadingState message="Checking your sign-in…" />
            </div>
          </GateCard>
        ) : booker ? (
          <Outlet context={outletContext} />
        ) : (
          <SignInCard
            error={error}
            onSignIn={signIn}
            signingIn={status === "signing-in"}
          />
        )}
      </main>

      <footer className="flex justify-center px-4 pb-6">
        <SiteCredit className="rounded-3xl bg-white/80 px-5 py-2 shadow-sm backdrop-blur sm:rounded-full" />
      </footer>

      <Toaster />
    </div>
  );
}
