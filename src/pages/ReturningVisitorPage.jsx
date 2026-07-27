import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgeCheck,
  Building2,
  LoaderCircle,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { apiRequest } from "../lib/api.js";
import {
  returningVisitorSearchSchema,
  returningVisitorVerificationSchema,
} from "../validation/returningVisitor.js";

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function getRequestError(error, fallbackMessage) {
  return error instanceof Error && error.message
    ? error.message
    : fallbackMessage;
}

export default function ReturningVisitorPage() {
  const [lookup, setLookup] = useState({
    hasMore: false,
    results: [],
    submitted: false,
  });

  const [selectedResult, setSelectedResult] =
    useState(null);

  const [verification, setVerification] =
    useState(null);

  const [searchError, setSearchError] = useState("");
  const [verificationError, setVerificationError] =
    useState("");

  const searchForm = useForm({
    defaultValues: {
      query: "",
    },
    resolver: zodResolver(returningVisitorSearchSchema),
  });

  const verificationForm = useForm({
    defaultValues: {
      lookupToken: "",
      phone: "",
    },
    resolver: zodResolver(
      returningVisitorVerificationSchema,
    ),
  });

  const handleSearch = async (values) => {
    setSearchError("");
    setVerificationError("");
    setSelectedResult(null);
    setVerification(null);

    verificationForm.reset({
      lookupToken: "",
      phone: "",
    });

    setLookup({
      hasMore: false,
      results: [],
      submitted: false,
    });

    try {
      const response = await apiRequest(
        "/api/returning/search",
        {
          body: JSON.stringify(values),
          method: "POST",
        },
      );

      setLookup({
        hasMore: Boolean(response.hasMore),
        results: Array.isArray(response.results)
          ? response.results
          : [],
        submitted: true,
      });
    } catch (error) {
      setSearchError(
        getRequestError(
          error,
          "Visitor records could not be searched. Please try again.",
        ),
      );
    }
  };

  const handleSelectResult = (result) => {
    setSelectedResult(result);
    setVerification(null);
    setVerificationError("");

    verificationForm.reset({
      lookupToken: result.lookupToken,
      phone: "",
    });
  };

  const handleVerification = async (values) => {
    setVerificationError("");

    try {
      const response = await apiRequest(
        "/api/returning/verify",
        {
          body: JSON.stringify(values),
          method: "POST",
        },
      );

      if (
        !response?.profile?.fullName ||
        !response?.verificationToken
      ) {
        throw new Error(
          "The visitor record could not be verified. Please try again.",
        );
      }

      setVerification(response);
    } catch (error) {
      setVerificationError(
        getRequestError(
          error,
          "The visitor record could not be verified. Please try again.",
        ),
      );
    }
  };

  const handleDifferentRecord = () => {
    setSelectedResult(null);
    setVerification(null);
    setVerificationError("");

    verificationForm.reset({
      lookupToken: "",
      phone: "",
    });
  };

  const handleNewSearch = () => {
    setLookup({
      hasMore: false,
      results: [],
      submitted: false,
    });

    setSelectedResult(null);
    setVerification(null);
    setSearchError("");
    setVerificationError("");

    searchForm.reset({
      query: "",
    });

    verificationForm.reset({
      lookupToken: "",
      phone: "",
    });
  };

  const searchErrors = searchForm.formState.errors;
  const verificationErrors =
    verificationForm.formState.errors;

  const searching = searchForm.formState.isSubmitting;
  const verifying =
    verificationForm.formState.isSubmitting;

  const verificationMinutes = verification?.expiresIn
    ? Math.max(
        1,
        Math.floor(verification.expiresIn / 60),
      )
    : 10;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        backTo="/visit"
        description="Find your masked visitor record, verify your registered mobile number and securely continue your visit."
        eyebrow="Returning visitor"
        title="Find your visitor record"
      />

      {verification ? (
        <section
          aria-labelledby="verified-heading"
          className="mt-8 overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm"
        >
          <div className="bg-emerald-50 p-5 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white">
                <BadgeCheck
                  aria-hidden="true"
                  className="size-6"
                />
              </span>

              <div>
                <h2
                  className="text-xl font-black text-emerald-950"
                  id="verified-heading"
                >
                  Identity verified
                </h2>

                <p className="mt-2 leading-7 text-emerald-900">
                  Your visitor profile has been securely
                  loaded.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <h3 className="text-lg font-bold text-slate-950">
              Visitor profile
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Review the information associated with your
              visitor record.
            </p>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <UserRound
                    aria-hidden="true"
                    className="size-4"
                  />
                  Full name
                </dt>

                <dd className="mt-2 break-words font-bold text-slate-950">
                  {verification.profile.fullName}
                </dd>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <Building2
                    aria-hidden="true"
                    className="size-4"
                  />
                  Organisation
                </dt>

                <dd className="mt-2 break-words font-bold text-slate-950">
                  {verification.profile.organization ||
                    "Not provided"}
                </dd>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <dt className="text-sm font-semibold text-slate-600">
                  Email address
                </dt>

                <dd className="mt-2 break-all font-bold text-slate-950">
                  {verification.profile.email ||
                    "Not provided"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm leading-6 text-brand-950">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-brand-800"
              />

              <p>
                This verification is valid for approximately{" "}
                {verificationMinutes} minutes. Do not refresh
                the page while continuing your visit.
              </p>
            </div>

            <button
              className="mt-6 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-brand-100 sm:w-auto"
              onClick={handleNewSearch}
              type="button"
            >
              Search for a different record
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-800">
                <Search
                  aria-hidden="true"
                  className="size-6"
                />
              </span>

              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Secure lookup
                </h2>

                <p className="mt-2 leading-7 text-slate-600">
                  Enter at least three characters from your
                  registered name. Results are masked and do
                  not display complete contact information.
                </p>
              </div>
            </div>

            <form
              className="mt-8 grid gap-6"
              noValidate
              onSubmit={searchForm.handleSubmit(
                handleSearch,
              )}
            >
              <Field
                description="Use part of the first name or last name entered during your first visit."
                error={searchErrors.query?.message}
                id="returning-query"
                label="Name search"
                required
              >
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    aria-describedby={[
                      "returning-query-description",
                      searchErrors.query
                        ? "returning-query-error"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={
                      searchErrors.query ? "true" : "false"
                    }
                    autoComplete="name"
                    className={`${inputClassName} pl-12`}
                    disabled={searching}
                    id="returning-query"
                    placeholder="For example, Ibrahim"
                    spellCheck="false"
                    type="search"
                    {...searchForm.register("query")}
                  />
                </div>
              </Field>

              <button
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                disabled={searching}
                type="submit"
              >
                {searching ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                    Searching…
                  </>
                ) : (
                  <>
                    <Search
                      aria-hidden="true"
                      className="size-5"
                    />
                    Search records
                  </>
                )}
              </button>
            </form>

            {searchError ? (
              <div className="mt-6">
                <ErrorMessage
                  message={searchError}
                  title="Search could not be completed"
                />
              </div>
            ) : null}
          </section>

          {lookup.submitted ? (
            <section
              aria-labelledby="search-results-heading"
              aria-live="polite"
              className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
            >
              <h2
                className="text-xl font-black text-slate-950"
                id="search-results-heading"
              >
                Search results
              </h2>

              {lookup.results.length === 0 ? (
                <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                  <p className="font-bold text-slate-950">
                    No matching visitor record was found.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Check the spelling or search with another
                    part of your registered name.
                  </p>

                  <button
                    className="mt-4 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
                    onClick={handleNewSearch}
                    type="button"
                  >
                    Start a new search
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Select the masked record that matches your
                    details.
                  </p>

                  <div className="mt-5 grid gap-3">
                    {lookup.results.map((result) => {
                      const selected =
                        selectedResult?.lookupToken ===
                        result.lookupToken;

                      return (
                        <button
                          aria-pressed={selected}
                          className={`min-h-20 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-brand-100 ${
                            selected
                              ? "border-brand-700 bg-brand-50"
                              : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
                          }`}
                          key={result.lookupToken}
                          onClick={() =>
                            handleSelectResult(result)
                          }
                          type="button"
                        >
                          <span className="flex items-start gap-3">
                            <span
                              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                                selected
                                  ? "bg-brand-800 text-white"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              <UserRound
                                aria-hidden="true"
                                className="size-5"
                              />
                            </span>

                            <span className="min-w-0">
                              <span className="block break-words font-bold text-slate-950">
                                {result.maskedName}
                              </span>

                              <span className="mt-1 block break-words text-sm text-slate-600">
                                {result.maskedOrganization}
                              </span>

                              <span className="mt-1 block text-sm font-semibold text-slate-700">
                                Phone ending:{" "}
                                {result.maskedPhone}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {lookup.hasMore ? (
                    <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                      More records matched this search. Use
                      additional name characters to narrow the
                      results.
                    </p>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {selectedResult ? (
            <section
              aria-labelledby="verification-heading"
              className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
            >
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-800">
                  <ShieldCheck
                    aria-hidden="true"
                    className="size-6"
                  />
                </span>

                <div>
                  <h2
                    className="text-xl font-black text-slate-950"
                    id="verification-heading"
                  >
                    Verify your record
                  </h2>

                  <p className="mt-2 leading-7 text-slate-600">
                    Enter the complete mobile number used
                    during your first registration.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">
                  Selected record
                </p>

                <p className="mt-1 font-bold text-slate-950">
                  {selectedResult.maskedName}
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  Phone ending:{" "}
                  {selectedResult.maskedPhone}
                </p>
              </div>

              <form
                className="mt-6 grid gap-6"
                noValidate
                onSubmit={verificationForm.handleSubmit(
                  handleVerification,
                )}
              >
                <input
                  type="hidden"
                  {...verificationForm.register(
                    "lookupToken",
                  )}
                />

                <Field
                  description="Enter the full number, including the country code when applicable."
                  error={verificationErrors.phone?.message}
                  id="returning-phone"
                  label="Registered mobile number"
                  required
                >
                  <div className="relative">
                    <Phone
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      aria-describedby={[
                        "returning-phone-description",
                        verificationErrors.phone
                          ? "returning-phone-error"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-invalid={
                        verificationErrors.phone
                          ? "true"
                          : "false"
                      }
                      autoComplete="tel"
                      className={`${inputClassName} pl-12`}
                      disabled={verifying}
                      id="returning-phone"
                      inputMode="tel"
                      placeholder="+233 24 000 0000"
                      type="tel"
                      {...verificationForm.register("phone")}
                    />
                  </div>
                </Field>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                    disabled={verifying}
                    type="submit"
                  >
                    {verifying ? (
                      <>
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-5 animate-spin"
                        />
                        Verifying…
                      </>
                    ) : (
                      <>
                        <ShieldCheck
                          aria-hidden="true"
                          className="size-5"
                        />
                        Verify mobile number
                      </>
                    )}
                  </button>

                  <button
                    className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                    disabled={verifying}
                    onClick={handleDifferentRecord}
                    type="button"
                  >
                    Choose another record
                  </button>
                </div>
              </form>

              {verificationError ? (
                <div className="mt-6">
                  <ErrorMessage
                    message={verificationError}
                    title="Verification unsuccessful"
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-100 p-4 text-sm leading-6 text-slate-700">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-brand-800"
            />

            <p>
              Selecting a result does not reveal the visitor
              profile until the registered mobile number has
              been verified.
            </p>
          </div>
        </>
      )}
    </div>
  );
}