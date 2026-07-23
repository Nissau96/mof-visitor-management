import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
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
import {
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
} from "../constants/privacy.js";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";
import { apiRequest } from "../lib/api.js";
import { visitorRegistrationSchema } from "../validation/visitorRegistration.js";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  organization: "",
  agency: "",
  division: "",
  purpose: "",
  meetingId: "",
  customMeetingTitle: "",
  personVisiting: "",
  consent: false,
};

function describedBy(id, hasDescription, error) {
  return [
    hasDescription ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
}

export default function NewVisitorPage() {
  const [meetings, setMeetings] = useState([]);
  const [meetingStatus, setMeetingStatus] =
    useState("idle");
  const [meetingRequestKey, setMeetingRequestKey] =
    useState(0);
  const [submissionError, setSubmissionError] =
    useState("");
  const [reference, setReference] = useState("");

  const {
    control,
  register,
  handleSubmit,
  formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: EMPTY_FORM,
    resolver: zodResolver(visitorRegistrationSchema),
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

        const availableMeetings = Array.isArray(
          result.meetings,
        )
          ? result.meetings
          : [];

        setMeetings(availableMeetings);
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

  async function submitRegistration(values) {
    setSubmissionError("");

    try {
      const result = await apiRequest("/api/register", {
        body: JSON.stringify(values),
        method: "POST",
      });

      setReference(result.reference);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      setSubmissionError(
        error.message ||
          "Your registration could not be completed. Please try again.",
      );
    }
  }

  if (reference) {
    return <RegistrationSuccess reference={reference} />;
  }

  const meetingSelectionUnavailable =
    attendingMeeting &&
    meetingStatus !== "ready";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        backTo="/visit"
        description="Provide your details and information about today’s visit. Required fields are marked with an asterisk."
        eyebrow="First visit"
        title="Visitor time-in details"
      />

      <form
        className="mt-8 grid gap-8"
        noValidate
        onSubmit={handleSubmit(submitRegistration)}
      >
        {submissionError ? (
          <ErrorMessage message={submissionError} />
        ) : null}

        <FormSection
          description="Enter your first and last name as shown on your valid identification."
          title="Your details"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={errors.firstName?.message}
              id="firstName"
              label="First name"
              required
            >
              <input
                aria-describedby={describedBy(
                  "firstName",
                  false,
                  errors.firstName,
                )}
                aria-invalid={Boolean(errors.firstName)}
                autoCapitalize="words"
                autoComplete="given-name"
                id="firstName"
                maxLength="60"
                {...register("firstName")}
              />
            </Field>

            <Field
              error={errors.lastName?.message}
              id="lastName"
              label="Last name"
              required
            >
              <input
                aria-describedby={describedBy(
                  "lastName",
                  false,
                  errors.lastName,
                )}
                aria-invalid={Boolean(errors.lastName)}
                autoCapitalize="words"
                autoComplete="family-name"
                id="lastName"
                maxLength="60"
                {...register("lastName")}
              />
            </Field>
          </div>

          <Field
            description="Provide a reachable mobile number, for example 024 000 0000."
            error={errors.phone?.message}
            id="phone"
            label="Phone number"
            required
          >
            <input
              aria-describedby={describedBy(
                "phone",
                true,
                errors.phone,
              )}
              aria-invalid={Boolean(errors.phone)}
              autoComplete="tel"
              id="phone"
              inputMode="tel"
              maxLength="30"
              placeholder="024 000 0000"
              type="tel"
              {...register("phone")}
            />
          </Field>

          <Field
            error={errors.email?.message}
            id="email"
            label="Email address (optional)"
          >
            <input
              aria-describedby={describedBy(
                "email",
                false,
                errors.email,
              )}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              id="email"
              inputMode="email"
              maxLength="254"
              placeholder="name@example.com"
              type="email"
              {...register("email")}
            />
          </Field>

          <Field
            description="Enter the organisation you represent, if applicable."
            error={errors.organization?.message}
            id="organization"
            label="Your organisation (optional)"
          >
            <input
              aria-describedby={describedBy(
                "organization",
                true,
                errors.organization,
              )}
              aria-invalid={Boolean(errors.organization)}
              autoCapitalize="words"
              autoComplete="organization"
              id="organization"
              maxLength="160"
              {...register("organization")}
            />
          </Field>
        </FormSection>

        <FormSection
          description="Select the agency and provide information about the purpose of your visit."
          title="Visit details"
        >
          <Field
            description="If you are visiting a Ministry staff member or conducting business within the Ministry, select Ministry of Finance (MoF)."
            error={errors.agency?.message}
            id="agency"
            label="Agency being visited"
            required
          >
            <select
              aria-describedby={describedBy(
                "agency",
                true,
                errors.agency,
              )}
              aria-invalid={Boolean(errors.agency)}
              id="agency"
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
              id="division"
              label="Ministry of Finance division"
              required
            >
              <select
                aria-describedby={describedBy(
                  "division",
                  true,
                  errors.division,
                )}
                aria-invalid={Boolean(errors.division)}
                id="division"
                {...register("division")}
              >
                <option value="">Select a division</option>

                {MOF_DIVISIONS.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field
            description="Select the main reason for your visit."
            error={errors.purpose?.message}
            id="purpose"
            label="Purpose of visit"
            required
          >
            <select
              aria-describedby={describedBy(
                "purpose",
                true,
                errors.purpose,
              )}
              aria-invalid={Boolean(errors.purpose)}
              id="purpose"
              {...register("purpose", {
                onChange: (event) => {
                  if (
                    event.target.value === MEETING_PURPOSE
                  ) {
                    setMeetingStatus("loading");
                    setMeetingRequestKey(
                      (currentKey) => currentKey + 1,
                    );
                  }
                },
              })}
            >
              <option value="">Select a purpose</option>

              {VISIT_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
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
              id="personVisiting"
              label="Person being visited"
              required
            >
              <input
                aria-describedby={describedBy(
                  "personVisiting",
                  true,
                  errors.personVisiting,
                )}
                aria-invalid={Boolean(
                  errors.personVisiting,
                )}
                autoCapitalize="words"
                id="personVisiting"
                maxLength="120"
                {...register("personVisiting")}
              />
            </Field>
          ) : null}
        </FormSection>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-6 shrink-0 text-brand-800"
            />

            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Privacy notice
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {PRIVACY_NOTICE_SUMMARY}
              </p>

              <p className="mt-2 text-xs font-semibold text-slate-500">
                Notice version {PRIVACY_NOTICE_VERSION}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label
              className="flex cursor-pointer items-start gap-3 font-normal"
              htmlFor="consent"
            >
              <input
                aria-describedby={
                  errors.consent
                    ? "consent-error"
                    : undefined
                }
                aria-invalid={Boolean(errors.consent)}
                className="mt-0.5 size-5 min-h-0 w-5 shrink-0 accent-brand-800"
                id="consent"
                type="checkbox"
                {...register("consent")}
              />

              <span className="text-sm leading-6 text-slate-800">
                I have read and understood the privacy notice.
              </span>
            </label>

            {errors.consent ? (
              <p
                className="mt-2 text-sm font-semibold text-red-700"
                id="consent-error"
                role="alert"
              >
                {errors.consent.message}
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
            <LockKeyhole
              aria-hidden="true"
              className="size-5"
            />

            {isSubmitting
              ? "Registering…"
              : "Register and check in"}
          </button>
        </div>
      </form>
    </div>
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
              meeting for today. Enter the title supplied by
              the meeting organiser.
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
        id="meetingId"
        label="Title of meeting"
        required
      >
        <select
          aria-describedby={describedBy(
            "meetingId",
            true,
            errors.meetingId,
          )}
          aria-invalid={Boolean(errors.meetingId)}
          id="meetingId"
          {...register("meetingId")}
        >
          <option value="">Select a meeting</option>

          {meetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {meeting.title}
            </option>
          ))}

          <option value={CUSTOM_MEETING_OPTION}>
            Meeting not listed
          </option>
        </select>
      </Field>

      {selectedMeeting === CUSTOM_MEETING_OPTION ? (
        <CustomMeetingTitleField
          errors={errors}
          register={register}
        />
      ) : null}
    </>
  );
}

function CustomMeetingTitleField({ errors, register }) {
  return (
    <Field
      description="Enter the meeting title provided by the organiser. This will apply only to your visit."
      error={errors.customMeetingTitle?.message}
      id="customMeetingTitle"
      label="Enter meeting title"
      required
    >
      <input
        aria-describedby={describedBy(
          "customMeetingTitle",
          true,
          errors.customMeetingTitle,
        )}
        aria-invalid={Boolean(
          errors.customMeetingTitle,
        )}
        autoCapitalize="sentences"
        id="customMeetingTitle"
        maxLength="160"
        {...register("customMeetingTitle")}
      />
    </Field>
  );
}

function FormSection({ children, description, title }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-slate-950">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {description}
      </p>

      <div className="mt-6 grid gap-5">{children}</div>
    </section>
  );
}

function RegistrationSuccess({ reference }) {
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
          Welcome to the Ministry
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