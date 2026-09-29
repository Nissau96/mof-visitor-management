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
import LoadingState from "../components/LoadingState.jsx";
import { TOWER_OPTIONS } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { staffLoginSchema } from "../validation/staffLogin.js";

const inputClassName =
  "min-h-12 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70";

function TowerIcon(props) {
  return <MapPin {...props} className="size-4 text-slate-400" />;
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
    control,
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

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#707d72] px-4">
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
    <div className="flex min-h-dvh items-center justify-center bg-[#707d72] px-3 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
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

            {/* <span className="rounded-full bg-[#f1f4ef] px-3 py-1 text-xs font-semibold text-brand-800">
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
                <span className="absolute left-0 top-0 size-8 rounded-full bg-[#bccbb8]" />
                <span className="absolute bottom-0 right-0 size-8 rounded-full bg-[#dbe5d7]/90" />
              </div>

              <div className="text-center">
                <h1
                  className="text-2xl font-semibold tracking-tight text-slate-950"
                  id="staff-login-heading"
                >
                  Sign In
                </h1>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enter your credentials and select your
                  current reception tower.
                </p>
              </div>

              {submissionError || authMessage ? (
                <div className="mt-6">
                  <ErrorMessage
                    message={submissionError || authMessage}
                    title="Sign-in unsuccessful"
                  />
                </div>
              ) : null}

              <form
                aria-busy={isSubmitting}
                className="mt-7 grid gap-4"
                noValidate
                onSubmit={handleSubmit(submitLogin)}
              >
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
                          disabled={isSubmitting}
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
              </form>

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
          className="relative isolate hidden min-w-0 overflow-hidden rounded-[1.75rem] bg-[#7d8b78] lg:flex lg:items-end"
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
            className="absolute inset-0 -z-10 bg-gradient-to-b from-[#263b2c]/10 via-transparent to-[#102418]/75"
          />

          {/* Curved white inset for the return button */}
          <div className="absolute left-0 top-0 rounded-br-[2.5rem] bg-white pb-3 pr-3">
            <Link
              aria-label="Return to the visitor portal"
              className="grid size-14 place-items-center rounded-full bg-[#f0f2ef] text-slate-600 transition hover:bg-[#e2e8df] hover:text-brand-900"
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
            <section className="rounded-2xl border border-white/35 bg-[#243b2d]/50 p-5 text-white shadow-lg backdrop-blur-md xl:p-6">
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
    </div>
  );
}