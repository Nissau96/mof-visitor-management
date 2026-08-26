import {
  zodResolver,
} from "@hookform/resolvers/zod";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import {
  useState,
} from "react";
import {
  useForm,
} from "react-hook-form";
import {
  Link,
  Navigate,
  useNavigate,
} from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
import useAuth from "../hooks/useAuth.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";
import {
  staffPasswordSetupSchema,
} from "../validation/adminManagement.js";

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-12 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

function getPasswordErrorMessage(error) {
  if (error instanceof ApiError) {
    if (
      error.status === 400 ||
      error.status === 403 ||
      error.status === 409
    ) {
      return error.message;
    }

    if (error.status === 401) {
      return "Your temporary staff session has expired. Sign in again or contact an administrator.";
    }
  }

  return error instanceof Error &&
    error.message
    ? error.message
    : "Your password could not be changed. Please try again.";
}

function formatExpiry(value) {
  if (!value) {
    return "";
  }

  const expiry = new Date(value);

  if (
    Number.isNaN(
      expiry.getTime(),
    )
  ) {
    return "";
  }

  return `${new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    },
  ).format(expiry)} GMT`;
}

function BrandIdentity({
  subtitle =
    "Staff account setup",
}) {
  return (
    <Link aria-label="Visitor Management home" className="inline-flex min-h-12 items-center gap-3 rounded-xl" to="/visit">
      <span className="grid size-11 place-items-center rounded-xl bg-brand-800 text-white">
        <Building2 aria-hidden="true" className="size-6" />
      </span>

      <span>
        <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-800">
          Ministry of Finance
        </span>

        <span className="block font-bold text-slate-950">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

export default function StaffSetupPage() {
  const [showPassword, setShowPassword] =
    useState(false);

  const [submissionError, setSubmissionError] =
    useState("");

  const [completed, setCompleted] =
    useState(false);

  const [signingOut, setSigningOut] =
    useState(false);

  const navigate = useNavigate();

  const {
    profile,
    session,
    signOut,
    status,
  } = useAuth();

  const {
    formState: {
      errors,
      isSubmitting,
    },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
    resolver: zodResolver(
      staffPasswordSetupSchema,
    ),
    shouldFocusError: true,
  });

  async function submitPassword(values) {
    setSubmissionError("");

    try {
      if (!session?.access_token) {
        throw new ApiError(
          "A valid staff session is required.",
          401,
        );
      }

      const response =
        await apiRequest(
          "/api/staff/session",
          {
            body: JSON.stringify(
              values,
            ),
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
            method: "PUT",
          },
        );

      if (
        response?.passwordChanged !==
          true ||
        response?.requiresSignIn !==
          true
      ) {
        throw new Error(
          "Password setup could not be verified.",
        );
      }

      setCompleted(true);

      await signOut().catch(
        () => undefined,
      );
    } catch (error) {
      setSubmissionError(
        getPasswordErrorMessage(
          error,
        ),
      );
    }
  }

  async function handleSignOut() {
    setSubmissionError("");
    setSigningOut(true);

    try {
      await signOut();

      navigate(
        "/staff/login",
        {
          replace: true,
        },
      );
    } catch (error) {
      setSubmissionError(
        error instanceof Error &&
          error.message
          ? error.message
          : "Sign-out could not be completed.",
      );

      setSigningOut(false);
    }
  }

  if (
    status === "loading" &&
    !completed
  ) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <LoadingState message="Checking account setup…" />
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-dvh bg-slate-50">
        <div aria-hidden="true" className="h-1.5 bg-accent" />

        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-4xl items-center px-4 py-4 sm:px-6 lg:px-8">
            <BrandIdentity />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-xl items-center px-4 py-12 sm:px-6 sm:py-16">
          <section aria-labelledby="password-created-heading" className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
              <CheckCircle2 aria-hidden="true" className="size-7" />
            </span>

            <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
              Account secured
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950" id="password-created-heading">
              Password created
            </h1>

            <p className="mt-4 leading-7 text-slate-600">
              Your temporary password has been replaced successfully. Sign in again using your new password.
            </p>

            <Link className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900" to="/staff/login">
              Sign in with your new password
            </Link>
          </section>
        </main>
      </div>
    );
  }

  if (
    status !== "authenticated" ||
    !session ||
    !profile
  ) {
    return (
      <div className="min-h-dvh bg-slate-50">
        <div aria-hidden="true" className="h-1.5 bg-accent" />

        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-4xl items-center px-4 py-4 sm:px-6 lg:px-8">
            <BrandIdentity />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-xl items-center px-4 py-12 sm:px-6 sm:py-16">
          <section aria-labelledby="sign-in-required-heading" className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-800">
              <KeyRound aria-hidden="true" className="size-6" />
            </span>

            <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-950" id="sign-in-required-heading">
              Sign in required
            </h1>

            <p className="mt-4 leading-7 text-slate-600">
              Sign in using the email address and temporary password provided in your staff account email.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900" to="/staff/login">
                Go to staff sign-in
              </Link>

              <Link className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50" to="/visit">
                Visitor portal
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (
    !profile.passwordChangeRequired
  ) {
    return (
      <Navigate
        replace
        to="/staff"
      />
    );
  }

  const expiryLabel =
    formatExpiry(
      profile
        .temporaryPasswordExpiresAt,
    );

  return (
    <div className="min-h-dvh bg-slate-50">
      <div aria-hidden="true" className="h-1.5 bg-accent" />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <BrandIdentity />

          <button aria-label={signingOut ? "Signing out…" : "Cancel setup"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={signingOut || isSubmitting} onClick={handleSignOut} type="button">
            {signingOut ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <LogOut aria-hidden="true" className="size-4" />
            )}

            <span className="hidden sm:inline">
              {signingOut
                ? "Signing out…"
                : "Cancel setup"}
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:px-8">
        <section className="hidden rounded-3xl bg-brand-900 p-8 text-white lg:block">
          <ShieldCheck aria-hidden="true" className="size-12 text-brand-100" />

          <h1 className="mt-6 text-3xl font-black tracking-tight">
            Secure your staff account
          </h1>

          <p className="mt-4 leading-7 text-brand-50">
            Replace the temporary password with a personal password that is unique to this application.
          </p>

          <ul className="mt-6 grid gap-3 text-sm leading-6 text-brand-100">
            <li>At least 12 characters</li>
            <li>At least one uppercase letter</li>
            <li>At least one lowercase letter</li>
            <li>At least one number</li>
            <li>At least one symbol</li>
          </ul>

          {expiryLabel ? (
            <div className="mt-7 rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-bold text-white">
                Temporary password expires
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-100">
                {expiryLabel}
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="staff-setup-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Password change required
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950" id="staff-setup-heading">
            Create your password
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Welcome, {profile.fullName}. You must replace your temporary password before accessing staff services.
          </p>

          {expiryLabel ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:hidden">
              <p className="text-sm font-bold text-amber-950">
                Temporary password expires
              </p>

              <p className="mt-1 text-sm leading-6 text-amber-900">
                {expiryLabel}
              </p>
            </div>
          ) : null}

          {submissionError ? (
            <div className="mt-6">
              <ErrorMessage message={submissionError} title="Password setup unsuccessful" />
            </div>
          ) : null}

          <form className="mt-7 grid gap-6" noValidate onSubmit={handleSubmit(submitPassword)}>
            <Field error={errors.password?.message} id="setup-password" label="New password" required>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

                <input aria-describedby={errors.password ? "setup-password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete="new-password" className={inputClassName} disabled={isSubmitting} id="setup-password" type={showPassword ? "text" : "password"} {...register("password")} />

                <button aria-label={showPassword ? "Hide passwords" : "Show passwords"} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" disabled={isSubmitting} onClick={() => setShowPassword((current) => !current)} type="button">
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-5" />
                  ) : (
                    <Eye aria-hidden="true" className="size-5" />
                  )}
                </button>
              </div>
            </Field>

            <Field error={errors.confirmPassword?.message} id="setup-confirm-password" label="Confirm new password" required>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

                <input aria-describedby={errors.confirmPassword ? "setup-confirm-password-error" : undefined} aria-invalid={Boolean(errors.confirmPassword)} autoComplete="new-password" className={inputClassName} disabled={isSubmitting} id="setup-confirm-password" type={showPassword ? "text" : "password"} {...register("confirmPassword")} />
              </div>
            </Field>

            <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-70" disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                  Creating password…
                </>
              ) : (
                <>
                  <KeyRound aria-hidden="true" className="size-5" />
                  Create password
                </>
              )}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}