import { zodResolver } from "@hookform/resolvers/zod";
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
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Link,
  useNavigate,
} from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
import useAuth from "../hooks/useAuth.js";
import { supabase } from "../lib/supabase.js";
import { staffPasswordSetupSchema } from "../validation/adminManagement.js";

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-12 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

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
    formState: { errors, isSubmitting },
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
      const { error } =
        await supabase.auth.updateUser({
          password: values.password,
        });

      if (error) {
        throw error;
      }

      setCompleted(true);
    } catch {
      setSubmissionError(
        "Your password could not be set. The invitation may have expired. Request a new invitation from an administrator.",
      );
    }
  }

  async function handleSignOut() {
    setSubmissionError("");
    setSigningOut(true);

    try {
      await signOut();
    } catch (error) {
      setSubmissionError(
        error instanceof Error && error.message
          ? error.message
          : "Sign-out could not be completed.",
      );
      setSigningOut(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <LoadingState message="Verifying your invitation…" />
        </div>
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
        <div
          aria-hidden="true"
          className="h-1.5 bg-accent"
        />

        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-4xl items-center px-4 py-4 sm:px-6 lg:px-8">
            <Link
              aria-label="Visitor Management home"
              className="inline-flex min-h-12 items-center gap-3 rounded-xl"
              to="/visit"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand-800 text-white">
                <Building2
                  aria-hidden="true"
                  className="size-6"
                />
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

        <main className="mx-auto flex w-full max-w-xl items-center px-4 py-12 sm:px-6 sm:py-16">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-800">
              <KeyRound
                aria-hidden="true"
                className="size-6"
              />
            </span>

            <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-950">
              Invitation unavailable
            </h1>

            <p className="mt-4 leading-7 text-slate-600">
              This invitation link is invalid, has expired
              or has already been used. Ask an administrator
              to review your staff account.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900"
                to="/staff/login"
              >
                Go to staff sign-in
              </Link>

              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50"
                to="/visit"
              >
                Visitor portal
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <div
        aria-hidden="true"
        className="h-1.5 bg-accent"
      />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            aria-label="Visitor Management home"
            className="inline-flex min-h-12 items-center gap-3 rounded-xl"
            to="/visit"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-brand-800 text-white">
              <Building2
                aria-hidden="true"
                className="size-6"
              />
            </span>

            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-800">
                Ministry of Finance
              </span>
              <span className="block font-bold text-slate-950">
                Staff account setup
              </span>
            </span>
          </Link>

          <button
  aria-label={
    signingOut
      ? "Signing out…"
      : "Cancel setup"
  }
  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
  disabled={
    signingOut || isSubmitting
  }
  onClick={handleSignOut}
  type="button"
>
            {signingOut ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <LogOut
                aria-hidden="true"
                className="size-4"
              />
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
          <ShieldCheck
            aria-hidden="true"
            className="size-12 text-brand-100"
          />

          <h1 className="mt-6 text-3xl font-black tracking-tight">
            Secure your staff account
          </h1>

          <p className="mt-4 leading-7 text-brand-50">
            Choose a strong password that is unique to this
            application and is not shared with anyone else.
          </p>

          <ul className="mt-6 grid gap-3 text-sm leading-6 text-brand-100">
            <li>At least 12 characters</li>
            <li>At least one uppercase letter</li>
            <li>At least one lowercase letter</li>
            <li>At least one number</li>
            <li>At least one symbol</li>
          </ul>
        </section>

        <section
          aria-labelledby="staff-setup-heading"
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
        >
          {completed ? (
            <>
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
                <CheckCircle2
                  aria-hidden="true"
                  className="size-7"
                />
              </span>

              <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                Account ready
              </p>

              <h1
                className="mt-2 text-3xl font-black tracking-tight text-slate-950"
                id="staff-setup-heading"
              >
                Password created
              </h1>

              <p className="mt-4 leading-7 text-slate-600">
                Your staff account has been secured
                successfully. You can now continue to the
                authorised staff portal.
              </p>

              <button
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900"
                onClick={() =>
                  navigate("/staff", {
                    replace: true,
                  })
                }
                type="button"
              >
                Continue to staff portal
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
                Invitation accepted
              </p>

              <h1
                className="mt-2 text-3xl font-black tracking-tight text-slate-950"
                id="staff-setup-heading"
              >
                Create your password
              </h1>

              <p className="mt-3 leading-7 text-slate-600">
                Welcome, {profile.fullName}. Complete your
                account setup by choosing a secure password.
              </p>

              {submissionError ? (
                <div className="mt-6">
                  <ErrorMessage
                    message={submissionError}
                    title="Password setup unsuccessful"
                  />
                </div>
              ) : null}

              <form
                className="mt-7 grid gap-6"
                noValidate
                onSubmit={handleSubmit(
                  submitPassword,
                )}
              >
                <Field
                  error={
                    errors.password?.message
                  }
                  id="setup-password"
                  label="New password"
                  required
                >
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      aria-describedby={
                        errors.password
                          ? "setup-password-error"
                          : undefined
                      }
                      aria-invalid={Boolean(
                        errors.password,
                      )}
                      autoComplete="new-password"
                      className={inputClassName}
                      disabled={isSubmitting}
                      id="setup-password"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      {...register("password")}
                    />

                    <button
                      aria-label={
                        showPassword
                          ? "Hide passwords"
                          : "Show passwords"
                      }
                      className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
                      disabled={isSubmitting}
                      onClick={() =>
                        setShowPassword(
                          (current) => !current,
                        )
                      }
                      type="button"
                    >
                      {showPassword ? (
                        <EyeOff
                          aria-hidden="true"
                          className="size-5"
                        />
                      ) : (
                        <Eye
                          aria-hidden="true"
                          className="size-5"
                        />
                      )}
                    </button>
                  </div>
                </Field>

                <Field
                  error={
                    errors.confirmPassword
                      ?.message
                  }
                  id="setup-confirm-password"
                  label="Confirm new password"
                  required
                >
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      aria-describedby={
                        errors.confirmPassword
                          ? "setup-confirm-password-error"
                          : undefined
                      }
                      aria-invalid={Boolean(
                        errors.confirmPassword,
                      )}
                      autoComplete="new-password"
                      className={inputClassName}
                      disabled={isSubmitting}
                      id="setup-confirm-password"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      {...register(
                        "confirmPassword",
                      )}
                    />
                  </div>
                </Field>

                <button
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-5 animate-spin"
                      />
                      Securing account…
                    </>
                  ) : (
                    <>
                      <KeyRound
                        aria-hidden="true"
                        className="size-5"
                      />
                      Create password
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}