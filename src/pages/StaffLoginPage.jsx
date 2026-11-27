import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import buildingPhoto from "../assets/images/building-bg.jpeg";
import buildingBackdrop from "../assets/images/building-bg-soft.webp";
import ministryLogo from "../assets/images/Asset-8.svg";
import ministryLogoLight from "../assets/images/mof-logo-light.webp";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import SegmentedChoice from "../components/SegmentedChoice.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { TOWER_OPTIONS } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { MICROSOFT_SIGN_IN_ENABLED } from "../lib/featureFlags.js";
import {
  openMicrosoftPopup,
  readMicrosoftError,
} from "../lib/microsoftSignIn.js";
import { wasSignedOutForInactivity } from "../lib/staffIdle.js";
import { staffLoginSchema } from "../validation/staffLogin.js";
import SiteCredit from "../components/SiteCredit.jsx";

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-500 hover:border-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-600/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70";

const AUDIENCE_CHOICES = Object.freeze([
  Object.freeze({ label: "Ministry staff", value: "staff" }),
  Object.freeze({ label: "Intern / NSP", value: "nsp" }),
]);

const MODE_DESCRIPTIONS = Object.freeze({
  emergency:
    "For the emergency administrator account, when Microsoft sign-in is unavailable.",
  microsoft:
    "Sign in to the Staff Portal with your Ministry work email.",
  nsp: "Sign in with the email address and password you were given.",
  password:
    "Sign in to the Staff Portal with your email address and password.",
});

// Microsoft's four-square mark, as its sign-in button guidelines ask.
function MicrosoftMark() {
  return (
    <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 21 21">
      <path d="M0 0h10v10H0z" fill="#f25022" />
      <path d="M11 0h10v10H11z" fill="#7fba00" />
      <path d="M0 11h10v10H0z" fill="#00a4ef" />
      <path d="M11 11h10v10H11z" fill="#ffb900" />
    </svg>
  );
}

function getSafeDestination(locationState) {
  const destination = locationState?.from;

  if (
    typeof destination === "string" &&
    destination.startsWith("/staff") &&
    !destination.startsWith("//") &&
    destination !== "/staff/login"
  ) {
    return destination;
  }

  return "/staff";
}

// Blurred building behind the card, washed in deep teal.
function Backdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-brand-950">
      <img
        alt=""
        className="h-full w-full scale-110 object-cover blur-lg"
        decoding="async"
        src={buildingBackdrop}
      />
      <div className="absolute inset-0 bg-brand-950/70" />
    </div>
  );
}

// A small floating note on the photo. Static information, so no hover lift.
function PhotoNote({ children, className, icon: Icon, iconClassName, text, title }) {
  return (
    <div
      className={`absolute hidden max-w-[17rem] items-start gap-3 rounded-2xl bg-white/95 p-4 shadow-[0_18px_36px_-16px_rgb(2_6_23/0.45)] backdrop-blur-sm lg:flex dark:bg-slate-900/90 ${className}`}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconClassName}`}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black tracking-tight text-slate-950">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">{text}</p>
        {children}
      </div>
    </div>
  );
}

function PhotoChip({ children, icon: Icon }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 text-xs font-semibold text-white backdrop-blur-sm">
      {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </span>
  );
}

function PhotoPanel({ passwordMode }) {
  return (
    <aside
      aria-labelledby="staff-photo-heading"
      className="relative isolate flex min-h-56 overflow-hidden rounded-[1.25rem] bg-brand-900 sm:min-h-64 lg:min-h-[40rem] lg:rounded-3xl"
    >
      <img
        alt=""
        className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
        decoding="async"
        src={buildingPhoto}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-b from-brand-950/10 via-brand-950/35 to-brand-950/90 lg:from-brand-950/0 lg:via-brand-950/0 lg:via-50%"
      />

      <PhotoNote
        className="right-6 top-6"
        icon={ScanLine}
        iconClassName="bg-brand-800 text-white"
        text="Check visitors in and hand out cards at the desk"
        title="Scan, confirm, card out"
      />

      <PhotoNote
        className="left-6 top-[38%]"
        icon={CreditCard}
        iconClassName="bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-200"
        text="Issued and returned, per tower"
        title="Every card accounted for"
      >
        <span className="mt-2 flex gap-1.5">
          {TOWER_OPTIONS.map((tower) => (
            <span
              className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-200"
              key={tower.value}
            >
              {tower.label}
            </span>
          ))}
        </span>
      </PhotoNote>

      <div className="mt-auto w-full p-4 sm:p-6 lg:p-8">
        <h2
          className="text-3xl font-black leading-tight tracking-tight text-white lg:text-5xl lg:leading-none"
          id="staff-photo-heading"
        >
          Reception, <span className="text-brand-300">organised.</span>
        </h2>
        <p className="mt-3 hidden max-w-md text-base leading-6 text-white/85 lg:block">
          Check-ins, visitor cards, meetings and WiFi access for both towers, in one place.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 lg:mt-5">
          {passwordMode ? (
            <PhotoChip icon={KeyRound}>Email and password</PhotoChip>
          ) : (
            <PhotoChip icon={ShieldCheck}>Microsoft work account</PhotoChip>
          )}
          <span className="hidden lg:inline-flex">
            <PhotoChip>Ministry of Finance</PhotoChip>
          </span>
        </div>
      </div>
    </aside>
  );
}

// Two tower cards as one radio group. Arrow keys move between them.
function TowerChoice({ disabled, error, register, value }) {
  return (
    <fieldset
      aria-describedby={error ? "staff-tower-error" : undefined}
      aria-invalid={Boolean(error)}
      className="grid gap-2"
      disabled={disabled}
    >
      <legend className="mb-2 text-sm font-semibold text-slate-800">
        Your reception tower
        <span aria-hidden="true" className="ml-1 text-red-700">
          *
        </span>
      </legend>

      <div className="grid grid-cols-2 gap-3">
        {TOWER_OPTIONS.map((tower) => {
          const checked = value === tower.value;

          return (
            <label
              className={`relative flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 pr-8 transition has-focus-visible:ring-4 has-focus-visible:ring-brand-600/30 has-disabled:cursor-not-allowed has-disabled:opacity-70 ${
                checked
                  ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700 dark:bg-brand-950/60"
                  : error
                    ? "border-red-300 hover:border-red-400"
                    : "border-slate-300 hover:border-slate-400"
              }`}
              key={tower.value}
            >
              <input
                className="sr-only min-h-0"
                type="radio"
                value={tower.value}
                {...register("tower")}
              />
              <span
                aria-hidden="true"
                className={`hidden size-9 shrink-0 place-items-center rounded-lg min-[400px]:grid ${
                  checked
                    ? "bg-brand-800 text-white"
                    : "bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-200"
                }`}
              >
                <Building2 className="size-4" />
              </span>
              <span className="whitespace-nowrap text-base font-black tracking-tight text-slate-950">
                {tower.label}
              </span>
              <span
                aria-hidden="true"
                className={`absolute right-3 top-3 grid size-4 place-items-center rounded-full border-2 ${
                  checked ? "border-brand-700" : "border-slate-300"
                }`}
              >
                {checked ? <span className="size-2 rounded-full bg-brand-700" /> : null}
              </span>
            </label>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm font-semibold text-red-700" id="staff-tower-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export default function StaffLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  // Every visit starts on "Ministry staff"; reception PCs are shared,
  // so the last person's choice is not remembered.
  const [audience, setAudience] = useState("staff");
  const [redirecting, setRedirecting] = useState(false);
  const [idleSignOut] = useState(wasSignedOutForInactivity);

  const location = useLocation();
  const navigate = useNavigate();
  const microsoftError = readMicrosoftError(location.search);

  // /staff/login?emergency=1 is the emergency administrator's password
  // sign-in, kept off the main form.
  const emergency =
    new URLSearchParams(location.search).get("emergency") === "1";

  const mode = !MICROSOFT_SIGN_IN_ENABLED
    ? "password"
    : emergency
      ? "emergency"
      : audience === "nsp"
        ? "nsp"
        : "microsoft";

  const showPasswordForm = mode !== "microsoft";

  const {
    authMessage,
    clearAuthMessage,
    profile,
    session,
    signIn,
    signInWithMicrosoft,
    status,
  } = useAuth();

  const {
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    trigger,
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
      tower: "",
    },
    resolver: zodResolver(staffLoginSchema),
    shouldFocusError: true,
  });

  const tower = useWatch({ control, name: "tower" });
  const destination = getSafeDestination(location.state);

  async function submitLogin(values) {
    setSubmissionError("");
    clearAuthMessage();

    try {
      const signedInProfile = await signIn(values);

      navigate(
        signedInProfile?.passwordChangeRequired
          ? "/staff/setup"
          : destination,
        { replace: true },
      );
    } catch (error) {
      setSubmissionError(
        error instanceof Error && error.message
          ? error.message
          : "Sign-in could not be completed. Please try again.",
      );
    }
  }

  async function startMicrosoftSignIn() {
    setSubmissionError("");
    clearAuthMessage();

    // The popup has to open in the click itself, before any await, or
    // the browser blocks it; so the tower is checked synchronously.
    const chosenTower = getValues("tower");

    if (!chosenTower) {
      void trigger("tower");
      return;
    }

    const popup = openMicrosoftPopup();

    setRedirecting(true);

    try {
      const result = await signInWithMicrosoft({ popup, tower: chosenTower });

      // Signed in: the auth state change moves this page on. Closed or
      // timed out: back to the form.
      if (result?.status === "cancelled") {
        setRedirecting(false);
      }
    } catch (error) {
      setRedirecting(false);
      setSubmissionError(
        error instanceof Error && error.message
          ? error.message
          : "Microsoft sign-in could not be started. Please try again.",
      );
    }
  }

  const busy = isSubmitting || redirecting;
  const signInError =
    submissionError || authMessage || microsoftError;

  if (status === "loading") {
    return (
      <div className="relative isolate flex min-h-dvh items-center justify-center px-4">
        <Backdrop />
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
          <LoadingState message="Checking staff session…" />
        </div>
      </div>
    );
  }

  if (status === "authenticated" && session && profile) {
    return (
      <Navigate
        replace
        to={
          profile.passwordChangeRequired
            ? "/staff/setup"
            : destination
        }
      />
    );
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-5 px-3 py-4 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Backdrop />

      <main className="grid w-full max-w-md gap-2 rounded-[1.75rem] bg-white p-2 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.6)] sm:max-w-xl sm:p-3 lg:max-w-6xl lg:grid-cols-2 lg:gap-3 lg:rounded-[2rem]">
        <PhotoPanel passwordMode={showPasswordForm} />

        <section
          aria-labelledby="staff-login-heading"
          className="flex min-w-0 flex-col px-3 pb-3 pt-4 sm:px-8 sm:pb-5 lg:px-12 lg:py-10 xl:px-16"
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
            <Link
              aria-label="Ministry of Finance Visitor Management home"
              className="mx-auto inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30"
              to="/visit"
            >
              <img
                alt="Ministry of Finance, Republic of Ghana"
                className="h-16 w-auto object-contain lg:h-20 dark:hidden"
                decoding="async"
                src={ministryLogo}
              />
              <img
                alt="Ministry of Finance, Republic of Ghana"
                className="hidden h-16 w-auto object-contain lg:h-20 dark:block"
                decoding="async"
                src={ministryLogoLight}
              />
            </Link>

            <h1
              className="mt-5 text-3xl font-black leading-tight tracking-tight text-brand-950 sm:text-4xl lg:mt-8 dark:text-white"
              id="staff-login-heading"
            >
              {mode === "emergency" ? "Emergency sign-in" : "Welcome back"}
            </h1>

            <p className="mt-2 text-base leading-6 text-slate-600">
              {MODE_DESCRIPTIONS[mode]}
            </p>

            {signInError ? (
              <div className="mt-5">
                <ErrorMessage
                  message={signInError}
                  title="Sign-in unsuccessful"
                />
              </div>
            ) : idleSignOut ? (
              <p
                className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
                role="status"
              >
                <span className="font-bold text-slate-950">
                  You were signed out after 25 minutes without activity.
                </span>{" "}
                Sign in again to continue.
              </p>
            ) : null}

            <form
              aria-busy={busy}
              className="mt-6 grid gap-5"
              noValidate
              onSubmit={handleSubmit(submitLogin)}
            >
              {MICROSOFT_SIGN_IN_ENABLED && !emergency ? (
                <SegmentedChoice
                  disabled={busy}
                  inline
                  legend="Sign in as"
                  name="staff-sign-in-as"
                  onChange={(value) => {
                    setAudience(value);
                    setSubmissionError("");
                  }}
                  options={AUDIENCE_CHOICES}
                  value={audience}
                />
              ) : null}

              <TowerChoice
                disabled={busy}
                error={errors.tower?.message}
                register={register}
                value={tower}
              />

              {mode === "microsoft" ? (
                <button
                  className="inline-flex min-h-13 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-5 py-3 text-base font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_10px_20px_-10px_rgb(2_6_23/0.55)] transition-[background-color,box-shadow,translate] duration-200 ease-out hover:bg-black hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_14px_28px_-12px_rgb(2_6_23/0.6)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 active:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_4px_10px_-6px_rgb(2_6_23/0.5)] disabled:cursor-not-allowed disabled:opacity-70 motion-safe:enabled:hover:-translate-y-px motion-safe:enabled:active:translate-y-0 dark:border-slate-300"
                  disabled={busy}
                  onClick={startMicrosoftSignIn}
                  type="button"
                >
                  {redirecting ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  ) : (
                    <MicrosoftMark />
                  )}
                  {redirecting
                    ? "Finish signing in in the Microsoft window…"
                    : "Sign in with Work Email"}
                </button>
              ) : null}

              {showPasswordForm ? (
                <div className="grid gap-5">
                  <Field
                    error={errors.email?.message}
                    id="staff-email"
                    label="Email address"
                    required
                  >
                    <div className="relative">
                      <Mail
                        aria-hidden="true"
                        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                      />

                      <input
                        aria-describedby={
                          errors.email
                            ? "staff-email-error"
                            : undefined
                        }
                        aria-invalid={Boolean(errors.email)}
                        autoCapitalize="none"
                        autoComplete="email"
                        className={`${inputClassName} pl-11`}
                        disabled={isSubmitting}
                        id="staff-email"
                        inputMode="email"
                        placeholder="name@example.com"
                        spellCheck="false"
                        type="email"
                        {...register("email")}
                      />
                    </div>
                  </Field>

                  <Field
                    error={errors.password?.message}
                    id="staff-password"
                    label="Password"
                    required
                  >
                    <div className="relative">
                      <LockKeyhole
                        aria-hidden="true"
                        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                      />

                      <input
                        aria-describedby={
                          errors.password
                            ? "staff-password-error"
                            : undefined
                        }
                        aria-invalid={Boolean(errors.password)}
                        autoComplete="current-password"
                        className={`${inputClassName} pl-11 pr-12`}
                        disabled={isSubmitting}
                        id="staff-password"
                        placeholder="Your password"
                        type={showPassword ? "text" : "password"}
                        {...register("password")}
                      />

                      <button
                        aria-controls="staff-password"
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 disabled:cursor-not-allowed"
                        disabled={isSubmitting}
                        onClick={() =>
                          setShowPassword((current) => !current)
                        }
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff
                            aria-hidden="true"
                            className="size-4"
                          />
                        ) : (
                          <Eye
                            aria-hidden="true"
                            className="size-4"
                          />
                        )}
                      </button>
                    </div>
                  </Field>

                  <button
                    className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 py-3 text-base font-bold text-white shadow-[0_10px_15px_-3px_rgb(15_118_110/0.25)] transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/30 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-5 animate-spin"
                        />
                        Signing in…
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </button>
                </div>
              ) : null}
            </form>

            <p className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <LockKeyhole
                aria-hidden="true"
                className="mt-1 size-4 shrink-0 text-brand-700 dark:text-brand-300"
              />
              Authorised staff only. Every sign-in is recorded with your tower and device.
            </p>

            {mode === "emergency" ? (
              <div className="mt-3 text-center">
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-600 transition hover:text-brand-800"
                  to="/staff/login"
                >
                  Back to the usual sign-in
                </Link>
              </div>
            ) : null}
          </div>

          <footer className="mx-auto mt-8 flex w-full max-w-md flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-sm text-slate-600 lg:max-w-none">
            <p>
              Trouble signing in?{" "}
              <span className="font-bold text-brand-800 dark:text-brand-300">
                Contact PFMSD – SSU
              </span>
            </p>
            <p>Staff Portal</p>
          </footer>
        </section>
      </main>

      <footer>
        <SiteCredit tone="dark" />
      </footer>
    </div>
  );
}
