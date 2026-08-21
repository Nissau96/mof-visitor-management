import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { TOWER_OPTIONS } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { staffLoginSchema } from "../validation/staffLogin.js";

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

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
  const [showPassword, setShowPassword] =
    useState(false);

  const [submissionError, setSubmissionError] =
    useState("");

  const location = useLocation();
  const navigate = useNavigate();

  const {
    authMessage,
    clearAuthMessage,
    profile,
    session,
    signIn,
    status,
  } = useAuth();

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
      tower: "",
    },
    resolver: zodResolver(staffLoginSchema),
    shouldFocusError: true,
  });

  const destination = getSafeDestination(
    location.state,
  );

  async function submitLogin(values) {
    setSubmissionError("");
    clearAuthMessage();

    try {
      await signIn(values);
      navigate(destination, {
        replace: true,
      });
    } catch (error) {
      setSubmissionError(
        error instanceof Error &&
          error.message
          ? error.message
          : "Sign-in could not be completed. Please try again.",
      );
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <LoadingState message="Checking staff session…" />
        </div>
      </div>
    );
  }

  if (
    status === "authenticated" &&
    session &&
    profile
  ) {
    return (
      <Navigate
        replace
        to={destination}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <div aria-hidden="true" className="h-1.5 bg-accent" />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4 sm:px-6 lg:px-8">
          <Link
            aria-label="Visitor Management home"
            className="inline-flex min-h-12 items-center gap-3 rounded-xl"
            to="/visit"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-brand-800 text-white">
              <Building2 aria-hidden="true" className="size-6" />
            </span>

            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-800">
                Ministry of Finance
              </span>

              <span className="block font-bold text-slate-950">
                Visitor Management
              </span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:px-8">
        <section className="hidden rounded-3xl bg-brand-900 p-8 text-white lg:block">
          <ShieldCheck aria-hidden="true" className="size-12 text-brand-100" />

          <h1 className="mt-6 text-3xl font-black tracking-tight">
            Authorised staff access
          </h1>

          <p className="mt-4 leading-7 text-brand-50">
            Sign in to access protected reception and
            administration functions.
          </p>

          <p className="mt-6 text-sm leading-6 text-brand-100">
            Select your assigned tower.
          </p>
        </section>

        <section aria-labelledby="staff-login-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Staff portal
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950" id="staff-login-heading">
            Sign in
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Use your authorised staff account and select
            your current reception tower.
          </p>

          {submissionError || authMessage ? (
            <div className="mt-6">
              <ErrorMessage
                message={submissionError || authMessage}
                title="Sign-in unsuccessful"
              />
            </div>
          ) : null}

          <form className="mt-7 grid gap-6" noValidate onSubmit={handleSubmit(submitLogin)}>
            <Field
              description="Select your assigned tower."
              error={errors.tower?.message}
              id="staff-tower"
              label="Assigned Tower"
              required
            >
              <div className="relative">
                <MapPin aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

                <select
                  aria-describedby={errors.tower ? "staff-tower-description staff-tower-error" : "staff-tower-description"}
                  aria-invalid={Boolean(errors.tower)}
                  className={`${inputClassName} pl-12`}
                  disabled={isSubmitting}
                  id="staff-tower"
                  {...register("tower")}
                >
                  <option value="">
                    Select your designated tower
                  </option>

                  {TOWER_OPTIONS.map((towerOption) => (
                    <option key={towerOption.value} value={towerOption.value}>
                      {towerOption.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field error={errors.email?.message} id="staff-email" label="Email address" required>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

                <input
                  aria-describedby={errors.email ? "staff-email-error" : undefined}
                  aria-invalid={Boolean(errors.email)}
                  autoCapitalize="none"
                  autoComplete="email"
                  className={`${inputClassName} pl-12`}
                  disabled={isSubmitting}
                  id="staff-email"
                  inputMode="email"
                  spellCheck="false"
                  type="email"
                  {...register("email")}
                />
              </div>
            </Field>



            <Field error={errors.password?.message} id="staff-password" label="Password" required>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

                <input
                  aria-describedby={errors.password ? "staff-password-error" : undefined}
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="current-password"
                  className={`${inputClassName} px-12`}
                  disabled={isSubmitting}
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                />

                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
                  disabled={isSubmitting}
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-5" />
                  ) : (
                    <Eye aria-hidden="true" className="size-5" />
                  )}
                </button>
              </div>
            </Field>

            <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-70" disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn aria-hidden="true" className="size-5" />
                  Sign in
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <Link className="inline-flex min-h-11 items-center rounded-xl font-bold text-brand-800 hover:text-brand-950" to="/visit">
              Return to the visitor portal
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}