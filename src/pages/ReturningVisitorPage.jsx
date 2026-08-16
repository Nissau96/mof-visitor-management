import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  useForm,
  useWatch,
} from "react-hook-form";
import { Link } from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PrivacyNotice from "../components/PrivacyNotice.jsx";
import { PRIVACY_NOTICE_VERSION } from "../constants/privacy.js";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";
import {
  returningVisitorSearchSchema,
  returningVisitorVerificationSchema,
} from "../validation/returningVisitor.js";
import { returningVisitCheckInSchema } from "../validation/returningVisit.js";

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const EMPTY_VISIT = {
  agency: "",
  customMeetingTitle: "",
  division: "",
  meetingId: "",
  personVisiting: "",
  privacyAcknowledged: false,
  purpose: "",
  verificationToken: "",
};

function describedBy(id, hasDescription, error) {
  return (
    [
      hasDescription
        ? `${id}-description`
        : null,
      error ? `${id}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

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

  const [reference, setReference] = useState("");
  const [searchError, setSearchError] = useState("");
  const [verificationError, setVerificationError] =
    useState("");
  const [workflowNotice, setWorkflowNotice] =
    useState("");

  const searchForm = useForm({
    defaultValues: {
      query: "",
    },
    resolver: zodResolver(
      returningVisitorSearchSchema,
    ),
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

  function resetWorkflow() {
    setLookup({
      hasMore: false,
      results: [],
      submitted: false,
    });

    setSelectedResult(null);
    setVerification(null);
    setReference("");
    setSearchError("");
    setVerificationError("");

    searchForm.reset({
      query: "",
    });

    verificationForm.reset({
      lookupToken: "",
      phone: "",
    });
  }

  async function handleSearch(values) {
    setSearchError("");
    setVerificationError("");
    setWorkflowNotice("");
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
  }

  function handleSelectResult(result) {
    setSelectedResult(result);
    setVerification(null);
    setVerificationError("");
    setWorkflowNotice("");

    verificationForm.reset({
      lookupToken: result.lookupToken,
      phone: "",
    });
  }

  async function handleVerification(values) {
    setVerificationError("");
    setWorkflowNotice("");

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

      window.scrollTo({
        behavior: "smooth",
        top: 0,
      });
    } catch (error) {
      setVerificationError(
        getRequestError(
          error,
          "The visitor record could not be verified. Please try again.",
        ),
      );
    }
  }

  function handleDifferentRecord() {
    setSelectedResult(null);
    setVerification(null);
    setVerificationError("");
    setWorkflowNotice("");

    verificationForm.reset({
      lookupToken: "",
      phone: "",
    });
  }

  function handleNewSearch() {
    resetWorkflow();
    setWorkflowNotice("");
  }

  function handleVerificationExpired(message) {
    resetWorkflow();

    setWorkflowNotice(
      message ||
        "Your verification expired. Search for your visitor record and verify your mobile number again.",
    );

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  function handleCheckInSuccess(visitReference) {
    setReference(visitReference);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  const searchErrors = searchForm.formState.errors;

  const verificationErrors =
    verificationForm.formState.errors;

  const searching =
    searchForm.formState.isSubmitting;

  const verifying =
    verificationForm.formState.isSubmitting;

  if (reference) {
    return (
      <ReturningCheckInSuccess
        reference={reference}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        backTo="/visit"
        description="Find your masked visitor record, verify your registered mobile number and provide today’s visit details."
        eyebrow="Returning visitor"
        title="Continue your visit"
      />

      {workflowNotice ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
          role="status"
        >
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0"
          />

          <p>{workflowNotice}</p>
        </div>
      ) : null}

      {verification ? (
        <VerifiedVisitorCheckIn
          onNewSearch={handleNewSearch}
          onSuccess={handleCheckInSuccess}
          onVerificationExpired={
            handleVerificationExpired
          }
          verification={verification}
        />
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
                    aria-describedby={describedBy(
                      "returning-query",
                      true,
                      searchErrors.query,
                    )}
                    aria-invalid={Boolean(
                      searchErrors.query,
                    )}
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
            <SearchResults
              lookup={lookup}
              onNewSearch={handleNewSearch}
              onSelect={handleSelectResult}
              selectedResult={selectedResult}
            />
          ) : null}

          {selectedResult ? (
            <VerificationForm
              errors={verificationErrors}
              form={verificationForm}
              onDifferentRecord={
                handleDifferentRecord
              }
              onSubmit={handleVerification}
              selectedResult={selectedResult}
              verifying={verifying}
              verificationError={
                verificationError
              }
            />
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

function SearchResults({
  lookup,
  onNewSearch,
  onSelect,
  selectedResult,
}) {
  return (
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
            Check the spelling or search with another part
            of your registered name.
          </p>

          <button
            className="mt-4 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
            onClick={onNewSearch}
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
                  onClick={() => onSelect(result)}
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
  );
}

function VerificationForm({
  errors,
  form,
  onDifferentRecord,
  onSubmit,
  selectedResult,
  verificationError,
  verifying,
}) {
  return (
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
            Enter the complete mobile number used during
            your first registration.
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
          Phone ending: {selectedResult.maskedPhone}
        </p>
      </div>

      <form
        className="mt-6 grid gap-6"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <input
          type="hidden"
          {...form.register("lookupToken")}
        />

        <Field
          description="Enter the full number, including the country code when applicable."
          error={errors.phone?.message}
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
              aria-describedby={describedBy(
                "returning-phone",
                true,
                errors.phone,
              )}
              aria-invalid={Boolean(errors.phone)}
              autoComplete="tel"
              className={`${inputClassName} pl-12`}
              disabled={verifying}
              id="returning-phone"
              inputMode="tel"
              placeholder="+233 24 000 0000"
              type="tel"
              {...form.register("phone")}
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
            onClick={onDifferentRecord}
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
  );
}

function VerifiedVisitorCheckIn({
  onNewSearch,
  onSuccess,
  onVerificationExpired,
  verification,
}) {
  const verificationMinutes = verification.expiresIn
    ? Math.max(
        1,
        Math.floor(verification.expiresIn / 60),
      )
    : 10;

  return (
    <>
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
                Provide the details for today’s visit to
                complete your check-in.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <h3 className="text-lg font-bold text-slate-950">
            Visitor profile
          </h3>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
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

          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm leading-6 text-brand-950">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-brand-800"
            />

            <p>
              Complete your check-in within approximately{" "}
              {verificationMinutes} minutes. If verification
              expires, you will need to verify again.
            </p>
          </div>

          <button
            className="mt-5 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-brand-100 sm:w-auto"
            onClick={onNewSearch}
            type="button"
          >
            Search for a different record
          </button>
        </div>
      </section>

      <ReturningVisitForm
        onSuccess={onSuccess}
        onVerificationExpired={
          onVerificationExpired
        }
        verificationToken={
          verification.verificationToken
        }
      />
    </>
  );
}

function ReturningVisitForm({
  onSuccess,
  onVerificationExpired,
  verificationToken,
}) {
  const [meetings, setMeetings] = useState([]);
  const [meetingStatus, setMeetingStatus] =
    useState("idle");
  const [meetingRequestKey, setMeetingRequestKey] =
    useState(0);
  const [submissionError, setSubmissionError] =
    useState("");

  const {
    control,
    formState: {
      errors,
      isSubmitting,
    },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      ...EMPTY_VISIT,
      verificationToken,
    },
    resolver: zodResolver(
      returningVisitCheckInSchema,
    ),
    shouldFocusError: true,
    shouldUnregister: true,
  });

  const selectedAgency =
    useWatch({
      control,
      name: "agency",
    }) || "";

  const selectedPurpose =
    useWatch({
      control,
      name: "purpose",
    }) || "";

  const selectedMeeting =
    useWatch({
      control,
      name: "meetingId",
    }) || "";

  const visitingMinistry =
    selectedAgency === MINISTRY_OF_FINANCE_AGENCY;

  const attendingMeeting =
    selectedPurpose === MEETING_PURPOSE;

  const purposeSelected = Boolean(selectedPurpose);

  useEffect(() => {
    if (!attendingMeeting) {
      return undefined;
    }

    const controller = new AbortController();

    void apiRequest("/api/meetings", {
      method: "GET",
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setMeetings(
          Array.isArray(result.meetings)
            ? result.meetings
            : [],
        );

        setMeetingStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setMeetings([]);
        setMeetingStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [attendingMeeting, meetingRequestKey]);

  function retryMeetings() {
    setMeetingStatus("loading");

    setMeetingRequestKey(
      (currentKey) => currentKey + 1,
    );
  }

  async function submitVisit(values) {
    setSubmissionError("");

    try {
      const result = await apiRequest(
        "/api/returning/check-in",
        {
          body: JSON.stringify(values),
          method: "POST",
        },
      );

      if (!result?.reference) {
        throw new Error(
          "Your check-in could not be completed. Please try again.",
        );
      }

      onSuccess(result.reference);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        onVerificationExpired(error.message);
        return;
      }

      setSubmissionError(
        getRequestError(
          error,
          "Your check-in could not be completed. Please try again.",
        ),
      );
    }
  }

  const meetingSelectionUnavailable =
    attendingMeeting &&
    meetingStatus !== "ready";

  return (
    <form
      className="mt-8 grid gap-8"
      noValidate
      onSubmit={handleSubmit(submitVisit)}
    >
      <input
        type="hidden"
        {...register("verificationToken")}
      />

      {submissionError ? (
        <ErrorMessage
          message={submissionError}
          title="Check-in could not be completed"
        />
      ) : null}

      <FormSection
        description="Select the agency and provide information about the purpose of today’s visit."
        title="Today’s visit details"
      >
        <Field
          description="If you are visiting a Ministry staff member or conducting business within the Ministry, select Ministry of Finance (MoF)."
          error={errors.agency?.message}
          id="returning-agency"
          label="Agency being visited"
          required
        >
          <select
            aria-describedby={describedBy(
              "returning-agency",
              true,
              errors.agency,
            )}
            aria-invalid={Boolean(errors.agency)}
            id="returning-agency"
            {...register("agency")}
          >
            <option value="">Select an agency</option>

            {VISIT_AGENCIES.map((agency) => (
              <option key={agency} value={agency}>
                {agency}
              </option>
            ))}
          </select>
        </Field>

        {visitingMinistry ? (
          <Field
            description="Select the Ministry division connected to your visit."
            error={errors.division?.message}
            id="returning-division"
            label="Ministry of Finance division"
            required
          >
            <select
              aria-describedby={describedBy(
                "returning-division",
                true,
                errors.division,
              )}
              aria-invalid={Boolean(
                errors.division,
              )}
              id="returning-division"
              {...register("division")}
            >
              <option value="">
                Select a division
              </option>

              {MOF_DIVISIONS.map((division) => (
                <option
                  key={division}
                  value={division}
                >
                  {division}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field
          description="Select the main reason for today’s visit."
          error={errors.purpose?.message}
          id="returning-purpose"
          label="Purpose of visit"
          required
        >
          <select
            aria-describedby={describedBy(
              "returning-purpose",
              true,
              errors.purpose,
            )}
            aria-invalid={Boolean(errors.purpose)}
            id="returning-purpose"
            {...register("purpose", {
              onChange: (event) => {
                if (
                  event.target.value ===
                  MEETING_PURPOSE
                ) {
                  setMeetingStatus("loading");

                  setMeetingRequestKey(
                    (currentKey) =>
                      currentKey + 1,
                  );
                }
              },
            })}
          >
            <option value="">
              Select a purpose
            </option>

            {VISIT_PURPOSES.map((purpose) => (
              <option
                key={purpose}
                value={purpose}
              >
                {purpose}
              </option>
            ))}
          </select>
        </Field>

        {attendingMeeting ? (
          <MeetingSelector
            errors={errors}
            meetingStatus={meetingStatus}
            meetings={meetings}
            register={register}
            retryMeetings={retryMeetings}
            selectedMeeting={selectedMeeting}
          />
        ) : null}

        {purposeSelected && !attendingMeeting ? (
          <Field
            description="Enter the name of the staff member, officer or contact person you are visiting."
            error={errors.personVisiting?.message}
            id="returning-person-visiting"
            label="Person being visited"
            required
          >
            <input
              aria-describedby={describedBy(
                "returning-person-visiting",
                true,
                errors.personVisiting,
              )}
              aria-invalid={Boolean(
                errors.personVisiting,
              )}
              autoCapitalize="words"
              id="returning-person-visiting"
              maxLength="120"
              {...register("personVisiting")}
            />
          </Field>
        ) : null}
      </FormSection>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <PrivacyNotice />

        <div className="mt-5">
          <label className="flex cursor-pointer items-start gap-3 font-normal" htmlFor="privacyAcknowledged">
            <input
              aria-describedby={errors.privacyAcknowledged ? "privacyAcknowledged-error" : undefined}
              aria-invalid={Boolean(errors.privacyAcknowledged)}
              className="mt-0.5 size-5 min-h-0 w-5 shrink-0 accent-brand-800"
              id="privacyAcknowledged"
              type="checkbox"
              {...register("privacyAcknowledged")}
            />

            <span className="text-sm leading-6 text-slate-800">
              I acknowledge that I have read and understood privacy notice version {PRIVACY_NOTICE_VERSION}, including the two-year retention period and the reuse of my verified visitor profile for future visits.
            </span>
          </label>

          {errors.privacyAcknowledged ? (
            <p className="mt-2 text-sm font-semibold text-red-700" id="privacyAcknowledged-error" role="alert">
              {errors.privacyAcknowledged.message}
            </p>
          ) : null}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:p-5 sm:shadow-sm">
        <button
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-800 px-6 font-bold text-white shadow-sm hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={
            isSubmitting ||
            meetingSelectionUnavailable
          }
          type="submit"
        >
          {isSubmitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin"
            />
          ) : (
            <LockKeyhole
              aria-hidden="true"
              className="size-5"
            />
          )}

          {isSubmitting
            ? "Checking in…"
            : "Complete check-in"}
        </button>
      </div>
    </form>
  );
}

function MeetingSelector({
  errors,
  meetingStatus,
  meetings,
  register,
  retryMeetings,
  selectedMeeting,
}) {
  if (
    meetingStatus === "idle" ||
    meetingStatus === "loading"
  ) {
    return (
      <LoadingState message="Loading today’s meetings…" />
    );
  }

  if (meetingStatus === "error") {
    return (
      <ErrorMessage
        message="Available meetings could not be loaded. Check your connection and try again."
        onRetry={retryMeetings}
        title="Meetings unavailable"
      />
    );
  }

  if (meetings.length === 0) {
    return (
      <section className="grid gap-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3 text-amber-950">
          <CalendarDays
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0"
          />

          <div>
            <h3 className="font-bold">
              Meeting not listed
            </h3>

            <p className="mt-1 text-sm leading-6">
              Client Service has not published an active
              meeting for today. Enter the title supplied
              by the meeting organiser.
            </p>
          </div>
        </div>

        <input
          {...register("meetingId")}
          type="hidden"
          value={CUSTOM_MEETING_OPTION}
        />

        <CustomMeetingTitleField
          errors={errors}
          register={register}
        />
      </section>
    );
  }

  return (
    <>
      <Field
        description="Select the meeting title supplied by Client Service. If it is unavailable, select Meeting not listed."
        error={errors.meetingId?.message}
        id="returning-meeting"
        label="Title of meeting"
        required
      >
        <select
          aria-describedby={describedBy(
            "returning-meeting",
            true,
            errors.meetingId,
          )}
          aria-invalid={Boolean(errors.meetingId)}
          id="returning-meeting"
          {...register("meetingId")}
        >
          <option value="">
            Select a meeting
          </option>

          {meetings.map((meeting) => (
            <option
              key={meeting.id}
              value={meeting.id}
            >
              {meeting.title}
            </option>
          ))}

          <option value={CUSTOM_MEETING_OPTION}>
            Meeting not listed
          </option>
        </select>
      </Field>

      {selectedMeeting ===
      CUSTOM_MEETING_OPTION ? (
        <CustomMeetingTitleField
          errors={errors}
          register={register}
        />
      ) : null}
    </>
  );
}

function CustomMeetingTitleField({
  errors,
  register,
}) {
  return (
    <Field
      description="Enter the meeting title provided by the organiser. This applies only to today’s visit."
      error={errors.customMeetingTitle?.message}
      id="returning-custom-meeting-title"
      label="Enter meeting title"
      required
    >
      <input
        aria-describedby={describedBy(
          "returning-custom-meeting-title",
          true,
          errors.customMeetingTitle,
        )}
        aria-invalid={Boolean(
          errors.customMeetingTitle,
        )}
        autoCapitalize="sentences"
        id="returning-custom-meeting-title"
        maxLength="160"
        {...register("customMeetingTitle")}
      />
    </Field>
  );
}

function FormSection({
  children,
  description,
  title,
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-slate-950">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {description}
      </p>

      <div className="mt-6 grid gap-5">
        {children}
      </div>
    </section>
  );
}

function ReturningCheckInSuccess({ reference }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <section
        className="w-full rounded-3xl border border-brand-100 bg-white p-6 text-center shadow-lg sm:p-10"
        role="status"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-50 text-brand-800">
          <CheckCircle2
            aria-hidden="true"
            className="size-9"
          />
        </span>

        <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-brand-800">
          Check-in complete
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
          Welcome back
        </h1>

        <p className="mt-4 leading-7 text-slate-600">
          Please show the following reference to reception.
          Do not share it publicly.
        </p>

        <p
          aria-label={`Visit reference ${reference}`}
          className="mt-6 rounded-2xl bg-slate-950 px-4 py-5 font-mono text-3xl font-black tracking-wider text-white"
        >
          {reference}
        </p>

        <Link
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-brand-800 px-5 font-bold text-brand-900 hover:bg-brand-50"
          to="/visit"
        >
          Return to visitor home
        </Link>
      </section>
    </div>
  );
}