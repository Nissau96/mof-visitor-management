import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useForm,
  useWatch,
} from "react-hook-form";
import { ControlledAppSelect } from "../components/AppSelect.jsx";
import {
  toOptions,
  VISIT_AGENCY_OPTIONS,
} from "../constants/selectOptions.js";
import useHostedMeetings from "../hooks/useHostedMeetings.js";
import WifiAccessField from "../components/WifiAccessField.jsx";
import useCountdown, { formatCountdown } from "../hooks/useCountdown.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import CheckInSuccess from "../components/CheckInSuccess.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PrivacyAgreement from "../components/PrivacyNotice.jsx";
import RecordSearchIllustration from "../components/RecordSearchIllustration.jsx";
import ReturningCodeLookup from "../components/ReturningCodeLookup.jsx";
import {
  FormSection,
  IconInput,
  RequiredProgress,
  SecondaryStepButton,
  StepButton,
  StepIndicator,
  VisitorCardHeader,
  VisitorCardShell,
  VisitorPrivacyFootnote,
} from "../components/VisitorFlow.jsx";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { formatMeetingDetails } from "../lib/meetingSchedule.js";
import SelectedMeeting from "../components/SelectedMeeting.jsx";
import { returningVisitCheckInSchema } from "../validation/returningVisit.js";

const STEPS = ["Find your record", "Visit details"];

const EMPTY_VISIT = {
  email: "",
  organization: "",
  agency: "",
  customMeetingTitle: "",
  division: "",
  meetingId: "",
  personVisiting: "",
  purpose: "",
  verificationToken: "",
  wifiAccess: "",
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
  const [verification, setVerification] =
    useState(null);

  const [reference, setReference] = useState("");
  const [workflowNotice, setWorkflowNotice] =
    useState("");
  // The number stays filled in when the visitor goes back a step.
  const [lastPhone, setLastPhone] = useState("");
  // Step 1 answers: the number, plus the code when SMS codes are on.
  const [lookupProgress, setLookupProgress] = useState({
    done: 0,
    total: 1,
  });
  const [lookupKey, setLookupKey] = useState(0);

  const step = verification ? 2 : 1;

  // Visit-detail answers come up from the step 2 form.
  const [visitProgress, setVisitProgress] = useState({
    done: 0,
    total: 3,
  });

  const progress = {
    done:
      (step === 2 ? lookupProgress.total : lookupProgress.done) +
      (step === 2 ? visitProgress.done : 0),
    total: lookupProgress.total + visitProgress.total,
  };

  // Each new step's heading takes focus, as on the first-visit form.
  const shownStep = useRef(1);

  useEffect(() => {
    if (shownStep.current === step) {
      return;
    }

    shownStep.current = step;

    requestAnimationFrame(() => {
      const heading = document.getElementById(
        `returning-step-${step}`,
      );

      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [step]);

  function handleVerified(response, phone) {
    setWorkflowNotice("");
    setLastPhone(phone);
    setVerification(response);
  }

  function startOver(notice = "") {
    setVerification(null);
    setReference("");
    setWorkflowNotice(notice);
    setLastPhone("");
    setLookupKey((key) => key + 1);
  }

  // Back to step 1 with the number filled in; a new code is needed.
  function goBack() {
    setVerification(null);
    setLookupKey((key) => key + 1);
  }

  function handleVerificationExpired(message) {
    startOver(
      message ||
        "Your verification expired. Enter your mobile number to get a new code.",
    );
  }

  function handleCheckInSuccess(visitReference) {
    setReference(visitReference);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  if (reference) {
    return (
      <ReturningCheckInSuccess
        reference={reference}
      />
    );
  }

  return (
    <VisitorCardShell>
      <VisitorCardHeader
        description="Confirm your mobile number with a code we send by SMS, then add today’s visit."
        eyebrow="Returning visitor"
        illustration={
          <RecordSearchIllustration className="hidden w-full sm:block" />
        }
        title="Continue your visit"
      >
        <RequiredProgress
          done={progress.done}
          idPrefix="returning"
          total={progress.total}
        />
      </VisitorCardHeader>

      <StepIndicator
        label="Check-in steps"
        step={step}
        steps={STEPS}
      />

      <div className="mt-5 grid gap-5">
        {workflowNotice ? (
          <div
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
            role="status"
          >
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />

            <p>{workflowNotice}</p>
          </div>
        ) : null}

        {step === 1 ? (
          <FormSection
            description="Use the mobile number from your first visit."
            icon={ShieldCheck}
            idPrefix="returning"
            number={1}
            title="Find your record"
          >
            <ReturningCodeLookup
              initialPhone={lastPhone}
              key={lookupKey}
              onProgress={setLookupProgress}
              onVerified={handleVerified}
            />
          </FormSection>
        ) : null}

        {step === 2 ? (
          <ReturningVisitForm
            onPrevious={goBack}
            onProgress={setVisitProgress}
            onSuccess={handleCheckInSuccess}
            onVerificationExpired={
              handleVerificationExpired
            }
            verification={verification}
          />
        ) : null}
      </div>

      <VisitorPrivacyFootnote />
    </VisitorCardShell>
  );
}

// Pressing "Complete check-in" is the privacy acknowledgement (see the
// line above the button), so every submission carries it.
const validateCheckIn = zodResolver(returningVisitCheckInSchema);

// context.meetingCoversWifi: the chosen meeting already asked for
// Wi-Fi, so the visitor is not asked.
function checkInResolver(values, context, options) {
  return validateCheckIn(
    {
      ...values,
      meetingCoversWifi: Boolean(context?.meetingCoversWifi),
      privacyAcknowledged: true,
    },
    context,
    options,
  );
}

function ReturningVisitForm({
  onPrevious,
  onProgress,
  onSuccess,
  onVerificationExpired,
  verification,
}) {
  const [submissionError, setSubmissionError] =
    useState("");

  const { profile } = verification;

  const verificationSeconds =
    Number(verification.expiresIn) > 0
      ? Number(verification.expiresIn)
      : 600;

  // Mirrors the chosen meeting's Wi-Fi request for the resolver; it
  // is updated below once the meeting list is known.
  const [meetingCoversWifi, setMeetingCoversWifi] =
    useState(false);

  const {
    control,
    formState: {
      errors,
      isSubmitting,
    },
    handleSubmit,
    register,
    setValue,
  } = useForm({
    context: { meetingCoversWifi },
    defaultValues: {
      ...EMPTY_VISIT,
      verificationToken:
        verification.verificationToken,
    },
    resolver: checkInResolver,
    shouldFocusError: true,
    shouldUnregister: true,
  });

  const [
    selectedAgency = "",
    selectedDivision = "",
    selectedPurpose = "",
    selectedMeeting = "",
    customMeetingTitle = "",
    personVisiting = "",
    wifiAccess = "",
  ] = useWatch({
    control,
    name: [
      "agency",
      "division",
      "purpose",
      "meetingId",
      "customMeetingTitle",
      "personVisiting",
      "wifiAccess",
    ],
  });

  const visitingMinistry =
    selectedAgency === MINISTRY_OF_FINANCE_AGENCY;

  const attendingMeeting =
    selectedPurpose === MEETING_PURPOSE;

  const purposeSelected = Boolean(selectedPurpose);



  const {
    meetings,
    retry: retryMeetings,
    status: meetingStatus,
  } = useHostedMeetings({
    agency: selectedAgency,
    attending: attendingMeeting,
    division: selectedDivision,
  });

  // A meeting belongs to its host; a new destination clears it.
  function clearMeeting() {
    setValue("meetingId", "");
    setValue("customMeetingTitle", "");
  }

  const coveredNow =
    attendingMeeting &&
    meetingStatus === "ready" &&
    meetings.some(
      (meeting) =>
        meeting.id === selectedMeeting &&
        meeting.wifiRequested === true,
    );

  if (coveredNow !== meetingCoversWifi) {
    setMeetingCoversWifi(coveredNow);
  }

  // The verification runs out on the server at the same time, so the
  // form starts over instead of failing on submit. A check-in already
  // being sent is left to finish.
  const secondsLeft = useCountdown(verificationSeconds, () => {
    if (!isSubmitting) {
      onVerificationExpired();
    }
  });

  const runningOut = secondsLeft <= 120;

  async function submitVisit(values) {
    setSubmissionError("");

    try {
      const result = await apiRequest(
        "/api/returning/check-in",
        {
          body: JSON.stringify({
            ...values,
            meetingCoversWifi: coveredNow,
          }),
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

  const meetingChosen =
    meetings.length === 0 ||
    selectedMeeting === CUSTOM_MEETING_OPTION
      ? customMeetingTitle.trim().length > 0
      : Boolean(selectedMeeting);

  const answers = [
    Boolean(selectedAgency),
    ...(visitingMinistry
      ? [Boolean(selectedDivision)]
      : []),
    purposeSelected,
    attendingMeeting
      ? meetingChosen
      : personVisiting.trim().length > 0,
    ...(purposeSelected && !coveredNow
      ? [Boolean(wifiAccess)]
      : []),
  ];

  const answered = answers.filter(Boolean).length;

  // Grey until every required answer is in, like the first-visit form.
  const ready = answered === answers.length;

  useEffect(() => {
    onProgress({
      done: answered,
      total: answers.length,
    });
  }, [answered, answers.length, onProgress]);

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={handleSubmit(submitVisit)}
    >
      <input
        type="hidden"
        {...register("verificationToken")}
      />

      <section
        aria-labelledby="verified-heading"
        className="overflow-hidden rounded-3xl border border-[#99e2d6] bg-white shadow-sm dark:border-[#14756d]"
      >
        <div className="flex flex-col gap-4 bg-linear-to-br from-[#f0fdfa] via-[#f7fefc] to-[#ffffff] p-5 sm:p-6 md:flex-row md:items-start md:justify-between dark:from-[#0a2f2c] dark:via-[#0d2430] dark:to-[#111a2b]">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-[#14b8a6] to-[#0f766e] text-[#ffffff] shadow-md shadow-[#0f766e]/25"
            >
              <ShieldCheck className="size-6" />
            </span>

            <div className="min-w-0">
              <h2
                className="text-xl font-black tracking-tight text-slate-950"
                id="verified-heading"
              >
                Identity verified
              </h2>

              <p className="mt-0.5 text-sm leading-6 text-slate-600">
                Check your saved details, then add today’s visit.
              </p>
            </div>
          </div>

          {verification.lastVisitAt ? (
            <LastVisitBadge value={verification.lastVisitAt} />
          ) : null}
        </div>

        <dl className="grid border-t border-slate-200 sm:grid-cols-2">
          <ProfileDetail
            icon={UserRound}
            label="Full name"
            value={profile.fullName}
          />

          <ProfileDetail
            icon={Building2}
            label="Organisation"
            value={profile.organization}
          />

          <ProfileDetail
            icon={Mail}
            label="Email address"
            value={profile.email}
          />

          <ProfileDetail
            icon={Phone}
            label="Mobile number"
            value={profile.phone}
          />
        </dl>

        {/* Missing details can be added; existing ones never change. */}
        {!profile.organization || !profile.email ? (
          <div className="grid gap-5 border-t border-slate-200 px-5 py-5 sm:grid-cols-2 sm:px-6">
            <p className="text-sm text-slate-600 sm:col-span-2">
              Your record is missing some details. Add them
              now if you like.
            </p>

            {!profile.organization ? (
              <Field
                error={errors.organization?.message}
                id="returning-organization"
                label={
                  <OptionalLabel>Organisation</OptionalLabel>
                }
              >
                <IconInput icon={Building2}>
                  <input
                    aria-describedby={describedBy(
                      "returning-organization",
                      false,
                      errors.organization,
                    )}
                    aria-invalid={Boolean(
                      errors.organization,
                    )}
                    autoComplete="organization"
                    className="pl-11"
                    id="returning-organization"
                    maxLength="160"
                    placeholder="Company or institution"
                    {...register("organization")}
                  />
                </IconInput>
              </Field>
            ) : null}

            {!profile.email ? (
              <Field
                error={errors.email?.message}
                id="returning-email"
                label={
                  <OptionalLabel>Email address</OptionalLabel>
                }
              >
                <IconInput icon={Mail}>
                  <input
                    aria-describedby={describedBy(
                      "returning-email",
                      false,
                      errors.email,
                    )}
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="email"
                    className="pl-11"
                    id="returning-email"
                    inputMode="email"
                    maxLength="254"
                    placeholder="name@example.com"
                    type="email"
                    {...register("email")}
                  />
                </IconInput>
              </Field>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:px-6">
          <p
            className={`flex items-start gap-2 text-sm leading-6 ${
              runningOut
                ? "text-amber-800 dark:text-[#fcd34d]"
                : "text-slate-700"
            }`}
            role="timer"
          >
            <Clock3
              aria-hidden="true"
              className={`mt-0.5 size-4 shrink-0 ${
                runningOut
                  ? "text-amber-600 dark:text-[#fcd34d]"
                  : "text-[#0f766e] dark:text-[#5eead4]"
              }`}
            />
            <span>
              Finish within{" "}
              <span className="font-bold tabular-nums">
                {formatCountdown(secondsLeft)}
              </span>
              , or you will need to find your record again.
            </span>
          </p>

          {/* Time left, shrinking each second. */}
          <div
            aria-hidden="true"
            className="mt-2.5 h-1 overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${
                runningOut
                  ? "bg-amber-500"
                  : "bg-[#0f766e] dark:bg-[#5eead4]"
              }`}
              style={{
                width: `${(secondsLeft / verificationSeconds) * 100}%`,
              }}
            />
          </div>

          {/* Screen readers hear one warning, not every second. */}
          <p aria-live="polite" className="sr-only">
            {secondsLeft <= 60 && secondsLeft > 0
              ? "Less than a minute left to finish your check-in."
              : ""}
          </p>
        </div>
      </section>

      {submissionError ? (
        <ErrorMessage
          message={submissionError}
          title="Check-in could not be completed"
        />
      ) : null}

      <FormSection
        description="Where you are going and why."
        icon={CalendarDays}
        idPrefix="returning"
        number={2}
        title="Today’s visit details"
      >
        <Field
          description="Visiting Ministry staff or doing business in the Ministry? Choose Ministry of Finance (MoF)."
          error={errors.agency?.message}
          id="returning-agency"
          label="Agency being visited"
          required
        >
          <ControlledAppSelect
            control={control}
            describedBy={describedBy(
              "returning-agency",
              true,
              errors.agency,
            )}
            id="returning-agency"
            invalid={Boolean(errors.agency)}
            labelledBy="returning-agency-label"
            name="agency"
            onValueChange={clearMeeting}
            options={VISIT_AGENCY_OPTIONS}
            placeholder="Select an agency"
          />
        </Field>

        {visitingMinistry ? (
          <Field
            description="The Ministry division connected to your visit."
            error={errors.division?.message}
            id="returning-division"
            label="Ministry of Finance division"
            required
          >
            <ControlledAppSelect
              control={control}
              describedBy={describedBy(
                "returning-division",
                true,
                errors.division,
              )}
              id="returning-division"
              invalid={Boolean(
                errors.division,
              )}
              labelledBy="returning-division-label"
              name="division"
              onValueChange={clearMeeting}
              options={toOptions(MOF_DIVISIONS)}
              placeholder="Select a division"
            />
          </Field>
        ) : null}

        <Field
          description="Select the main reason for your visit."
          error={errors.purpose?.message}
          id="returning-purpose"
          label="Purpose of visit"
          required
        >
          <ControlledAppSelect
            control={control}
            describedBy={describedBy(
              "returning-purpose",
              true,
              errors.purpose,
            )}
            id="returning-purpose"
            invalid={Boolean(errors.purpose)}
            labelledBy="returning-purpose-label"
            name="purpose"
            options={toOptions(VISIT_PURPOSES)}
            placeholder="Select a purpose"
          />
        </Field>

        {attendingMeeting ? (
          <div className="grid gap-5 rounded-2xl border border-[#99e2d6] bg-[#f0fdfa] p-4 dark:border-[#14756d] dark:bg-[#0b2b29]">
            <MeetingSelector
              control={control}
              errors={errors}
              meetingStatus={meetingStatus}
              meetings={meetings}
              register={register}
              retryMeetings={retryMeetings}
              selectedMeeting={selectedMeeting}
            />
          </div>
        ) : null}

        {purposeSelected && !attendingMeeting ? (
          <Field
            description="The staff member, officer or contact person you are visiting."
            error={errors.personVisiting?.message}
            id="returning-person-visiting"
            label="Person being visited"
            required
          >
            <IconInput icon={UserRound}>
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
                className="pl-11"
                id="returning-person-visiting"
                maxLength="120"
                placeholder="Name of the person"
                {...register("personVisiting")}
              />
            </IconInput>
          </Field>
        ) : null}

        {purposeSelected ? (
          <WifiAccessField
            control={control}
            covered={coveredNow}
            error={errors.wifiAccess}
            id="returning-wifi-access"
          />
        ) : null}
      </FormSection>

      <PrivacyAgreement>
        By checking in, you agree to how the Ministry
        handles your information.
      </PrivacyAgreement>

      <div className="flex flex-col-reverse gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)]">
        <SecondaryStepButton
          disabled={isSubmitting}
          onClick={onPrevious}
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-5"
          />
          Previous step
        </SecondaryStepButton>

        <StepButton
          disabled={
            isSubmitting ||
            meetingSelectionUnavailable
          }
          ready={ready}
          type="submit"
        >
          {isSubmitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin"
            />
          ) : (
            <Check
              aria-hidden="true"
              className="size-5"
            />
          )}

          {isSubmitting
            ? "Checking in…"
            : "Complete check-in"}
        </StepButton>
      </div>
    </form>
  );
}

// One cell of the 2 x 2 details grid. Cells after the first get a top
// rule; on wider screens the right-hand column gets a left rule instead
// of a second top rule on the first row.
function ProfileDetail({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 border-slate-200 px-5 py-4 not-first:border-t sm:px-6 sm:even:border-l sm:nth-2:border-t-0">
      <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        <Icon
          aria-hidden="true"
          className="size-4 text-[#0f766e] dark:text-[#5eead4]"
        />
        {label}
      </dt>

      <dd
        className={`mt-1.5 wrap-break-word ${
          value
            ? "text-base font-bold text-slate-950"
            : "text-sm font-semibold text-slate-500"
        }`}
      >
        {value || "Not on record"}
      </dd>
    </div>
  );
}

const lastVisitFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
  weekday: "short",
  year: "numeric",
});

// Whole Accra calendar days between the last visit and today.
function describeDaysSince(value) {
  const days = Math.round(
    (Date.parse(getAccraIsoDate()) -
      Date.parse(getAccraIsoDate(new Date(value)))) /
      86_400_000,
  );

  if (days <= 0) {
    return "today";
  }

  return days === 1 ? "yesterday" : `${days} days ago`;
}

function LastVisitBadge({ value }) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return (
    <p className="inline-flex max-w-full shrink-0 items-center gap-2.5 self-start rounded-2xl border border-[#99e2d6] bg-white py-1.5 pl-1.5 pr-4 text-sm text-slate-700 shadow-sm shadow-[#0f766e]/10 min-[420px]:rounded-full dark:border-[#14756d]">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#ccfbf1] text-[#0f766e] dark:bg-[#134e4a] dark:text-[#5eead4]"
      >
        <CalendarCheck className="size-4" />
      </span>

      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 md:flex-nowrap">
        <span>Last visit</span>
        <time
          className="whitespace-nowrap font-bold text-slate-950"
          dateTime={value}
        >
          {lastVisitFormatter.format(date)}
        </time>
        <span className="whitespace-nowrap font-semibold text-[#0f766e] dark:text-[#5eead4]">
          · {describeDaysSince(value)}
        </span>
      </span>
    </p>
  );
}

function OptionalLabel({ children }) {
  return (
    <>
      {children}{" "}
      <span className="font-normal text-slate-600">(optional)</span>
    </>
  );
}

function MeetingSelector({
  control,
  errors,
  meetingStatus,
  meetings,
  register,
  retryMeetings,
  selectedMeeting,
}) {
  if (meetingStatus === "needs-destination") {
    return (
      <p className="flex items-start gap-3 text-sm leading-6 text-[#134e4a] dark:text-[#ccfbf1]">
        <CalendarDays
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0"
        />
        Choose the agency you are visiting (and the division, for the
        Ministry) to see its meetings for today.
      </p>
    );
  }

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
              No meeting is listed for this agency today.
              Enter the title supplied by the meeting organiser.
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
        <ControlledAppSelect
          control={control}
          describedBy={describedBy(
            "returning-meeting",
            true,
            errors.meetingId,
          )}
          id="returning-meeting"
          invalid={Boolean(errors.meetingId)}
          labelledBy="returning-meeting-label"
          name="meetingId"
          options={[
            ...meetings.map((meeting) => ({
              // Title alone in the field; time and venue sit under it in
              // the list and in full below the field once chosen.
              description:
                formatMeetingDetails(meeting) || undefined,
              label: meeting.title,
              value: meeting.id,
            })),
            { label: "Meeting not listed", value: CUSTOM_MEETING_OPTION },
          ]}
          placeholder="Select a meeting"
        />
      </Field>

      <SelectedMeeting
        meeting={meetings.find(
          (meeting) => meeting.id === selectedMeeting,
        )}
      />

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

function ReturningCheckInSuccess({ reference }) {
  return (
    <CheckInSuccess
      description="Show this reference number at reception. Do not share it publicly."
      reference={reference}
      title="Welcome back"
    />
  );
}
