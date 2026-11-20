import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@plexui/ui/components/Select";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import buildingBackground from "../assets/images/building-bg.jpeg";
import ministryLogo from "../assets/images/Asset-8.svg";
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
  "min-h-12 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70";

const AUDIENCE_CHOICES = Object.freeze([
  Object.freeze({ label: "Ministry staff", value: "staff" }),
  Object.freeze({ label: "Intern/NSP", value: "nsp" }),
]);

const MODE_DESCRIPTIONS = Object.freeze({
  emergency:
    "For the emergency administrator account, when Microsoft sign-in is unavailable.",
  microsoft:
    "Select your current reception tower, then sign in with your Ministry work email.",
  nsp: "Select your current reception tower, then sign in with the email address and password you were given.",
  password:
    "Enter your credentials and select your current reception tower.",
});

function TowerIcon(props) {
  return <MapPin {...props} className="size-4 text-slate-400" />;
}

// Microsoft's four-square mark, as its sign-in button guidelines ask.
function MicrosoftMark() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 21 21">
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
    const tower = getValues("tower");

    if (!tower) {
      void trigger("tower");
      return;
    }

    const popup = openMicrosoftPopup();

    setRedirecting(true);

    try {
      const result = await signInWithMicrosoft({ popup, tower });

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
      <div className="flex min-h-dvh items-center justify-center bg-[#5f7a77] px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#5f7a77] px-3 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
      <main className="grid w-full max-w-6xl overflow-hidden rounded-xl bg-white p-2 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.4)] sm:p-3 lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr] lg:rounded-none">
        {/* Form panel */}
        <section
          aria-labelledby="staff-login-heading"
          className="flex min-w-0 flex-col px-4 py-5 sm:px-9 sm:py-6 lg:px-10 xl:px-14"
        >
          <header className="flex flex-col items-center gap-3">
            <Link
              aria-label="Ministry of Finance Visitor Management home"
              className="inline-flex rounded-lg"
              to="/visit"
            >
              <img
                alt="Ministry of Finance, Republic of Ghana"
                className="h-36 w-36 object-contain sm:h-24"
                decoding="async"
                src={ministryLogo}
              />
            </Link>

            {/* <span className="rounded-full bg-[#eff5f4] px-3 py-1 text-xs font-semibold text-brand-800">
              Staff portal
            </span> */}
          </header>

          <div className="flex flex-1 items-center justify-center py-2 sm:py-2">
            <div className="w-full max-w-[340px]">
              {/* Overlapping circles echo the reference symbol */}
              <div
                aria-hidden="true"
                className="relative mx-auto mb-6 h-11 w-12"
              >
                <span className="absolute left-0 top-0 size-8 rounded-full bg-[#b5cfcb]" />
                <span className="absolute bottom-0 right-0 size-8 rounded-full bg-[#d5e7e4]/90" />
              </div>

              <div className="text-center">
                <h1
                  className="text-2xl font-semibold tracking-tight text-slate-950"
                  id="staff-login-heading"
                >
                  {mode === "emergency" ? "Emergency sign-in" : "Sign In"}
                </h1>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {MODE_DESCRIPTIONS[mode]}
                </p>
              </div>

              {signInError ? (
                <div className="mt-6">
                  <ErrorMessage
                    message={signInError}
                    title="Sign-in unsuccessful"
                  />
                </div>
              ) : idleSignOut ? (
                <p
                  className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
                  role="status"
                >
                  <span className="font-bold text-slate-950">
                    You were signed out after 25 minutes without activity.
                  </span>{" "}
                  Sign in again to continue.
                </p>
              ) : null}

              <form
                aria-busy={isSubmitting}
                className="mt-7 grid gap-4"
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

                <Field
                  description="Select your assigned tower."
                  error={errors.tower?.message}
                  id="staff-tower"
                  label="Assigned Tower"
                  required
                >
                  <Controller
                    control={control}
                    name="tower"
                    render={({ field }) => (
                      <div
                        ref={(node) =>
                          field.ref(
                            node?.querySelector("#staff-tower") ?? null,
                          )
                        }
                      >
                        <Select
                          aria-describedby={
                            errors.tower
                              ? "staff-tower-description staff-tower-error"
                              : "staff-tower-description"
                          }
                          aria-invalid={Boolean(errors.tower)}
                          aria-labelledby="staff-tower-label"
                          disabled={busy}
                          id="staff-tower"
                          name={field.name}
                          onChange={(option) => {
                            field.onChange(option.value);
                            field.onBlur();
                          }}
                          options={TOWER_OPTIONS}
                          placeholder="Select your designated tower"
                          size="3xl"
                          TriggerStartIcon={TowerIcon}
                          triggerClassName="rounded-lg"
                          value={field.value}
                        />
                      </div>
                    )}
                  />
                </Field>

                {mode === "microsoft" ? (
                  <button
                    className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-black bg-[#171717] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-black focus-visible:ring-4 focus-visible:ring-brand-600/30 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={busy}
                    onClick={startMicrosoftSignIn}
                    type="button"
                  >
                    {redirecting ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
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
                  <div className="grid gap-4">
                    <Field
                      error={errors.email?.message}
                      id="staff-email"
                      label="Email address"
                      required
                    >
                      <div className="relative">
                        <Mail
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
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
                          className={`${inputClassName} pl-10`}
                          disabled={isSubmitting}
                          id="staff-email"
                          inputMode="email"
                          placeholder="Enter your email address"
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
                          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                        />

                        <input
                          aria-describedby={
                            errors.password
                              ? "staff-password-error"
                              : undefined
                          }
                          aria-invalid={Boolean(errors.password)}
                          autoComplete="current-password"
                          className={`${inputClassName} pl-10 pr-12`}
                          disabled={isSubmitting}
                          id="staff-password"
                          placeholder="Enter your password"
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
                          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed"
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
                      className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-black bg-[#171717] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-black focus-visible:ring-4 focus-visible:ring-brand-600/30 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={isSubmitting}
                      type="submit"
                    >
                      {isSubmitting ? (
                        <>
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
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

              {mode === "emergency" ? (
                <div className="mt-4 text-center">
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:text-brand-800"
                    to="/staff/login"
                  >
                    Back to the usual sign-in
                  </Link>
                </div>
              ) : null}

              {/* <div className="mt-6 border-t border-slate-100 pt-4 text-center">
                <Link
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium text-slate-600 transition hover:text-brand-800"
                  to="/visit"
                >
                  <ArrowLeft
                    aria-hidden="true"
                    className="size-4"
                  />
                  Return to the visitor portal
                </Link>
              </div> */}
            </div>
          </div>

          <footer className="text-center">
            <p className="text-[0.7rem] leading-5 text-slate-500">
              Ministry of Finance · Authorised staff access only
            </p>
          </footer>
        </section>

        {/* Image panel */}
        <aside
          aria-labelledby="staff-access-heading"
          className="relative isolate hidden min-w-0 overflow-hidden rounded-[1.75rem] bg-[#6f8a86] lg:flex lg:items-end"
        >
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
            decoding="async"
            src={buildingBackground}
          />

          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-b from-[#1f3d3a]/10 via-transparent to-[#0b2422]/75"
          />

          {/* Curved white inset for the return button */}
          <div className="absolute left-0 top-0 rounded-br-[2.5rem] bg-white pb-3 pr-3">
            <Link
              aria-label="Return to the visitor portal"
              className="grid size-14 place-items-center rounded-full bg-[#eff3f2] text-slate-600 transition hover:bg-[#dde9e7] hover:text-brand-900"
              to="/visit"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-5"
                strokeWidth={1.5}
              />
            </Link>
          </div>

          <div className="w-full p-4 xl:p-5">
            <section className="rounded-2xl border border-white/35 bg-[#1e3b38]/50 p-5 text-white shadow-lg backdrop-blur-md xl:p-6">
              <div className="flex items-center gap-2.5">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-5 shrink-0 text-white/90"
                  strokeWidth={1.5}
                />

                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/85">
                  Visitor Management
                </p>
              </div>

              <h2
                className="mt-3 text-2xl font-semibold tracking-tight"
                id="staff-access-heading"
              >
                Authorised staff access
              </h2>

              <p className="mt-2 max-w-md text-sm leading-6 text-white/90">
                Access protected reception and administration
                functions using your authorised staff account.
              </p>

              <div className="mt-5 flex items-center gap-2 border-t border-white/20 pt-4">
                <MapPin
                  aria-hidden="true"
                  className="size-4 shrink-0 text-white/80"
                />

                <p className="text-xs leading-5 text-white/85">
                  Select your current reception tower at sign-in.
                </p>
              </div>
            </section>
          </div>
        </aside>
      </main>

      <footer>
        <SiteCredit tone="dark" />
      </footer>
    </div>
  );
}