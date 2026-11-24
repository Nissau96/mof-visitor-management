import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  Mail,
  MapPin,
  Minus,
  Phone,
  Plus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { ControlledAppSelect } from "../components/AppSelect.jsx";
import {
  toOptions,
  VISIT_AGENCY_OPTIONS,
} from "../constants/selectOptions.js";
import useHostedMeetings from "../hooks/useHostedMeetings.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PrivacyAgreement from "../components/PrivacyNotice.jsx";
import CheckInSuccess from "../components/CheckInSuccess.jsx";
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
import VisitorPassIllustration from "../components/VisitorPassIllustration.jsx";
import WifiAccessField from "../components/WifiAccessField.jsx";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";
import { apiRequest } from "../lib/api.js";
import { formatMeetingDetails } from "../lib/meetingSchedule.js";
import SelectedMeeting from "../components/SelectedMeeting.jsx";
import {
  findRepeatedGuestPhones,
  MAX_VISIT_PARTY_SIZE,
  REPEATED_PHONE_MESSAGE,
  visitorRegistrationSchema,
} from "../validation/visitorRegistration.js";

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
  wifiAccess: "",
  guests: [],
};

const EMPTY_GUEST = {
  firstName: "",
  lastName: "",
  phone: "",
};

const GUEST_FIELDS = ["firstName", "lastName", "phone"];

const WATCHED_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "agency",
  "division",
  "purpose",
  "meetingId",
  "customMeetingTitle",
  "personVisiting",
  "wifiAccess",
];

const ICON_INPUT = "pl-11";

// Step 1 is "Your details"; step 2 is "Visit details" and submission.
const STEP_ONE_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "organization",
  "guests",
];

const STEPS = ["Your details", "Visit details"];

function describedBy(id, hasDescription, error) {
  return [
    hasDescription ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
}

function filled(value) {
  return typeof value === "string"
    ? value.trim() !== ""
    : Boolean(value);
}

// The required fields shown right now: the five basics, three per
// guest, plus the division for MoF and the meeting or person once a
// purpose is chosen.
function countRequired(values, guests, meetingCoversWifi) {
  const required = [
    values.firstName,
    values.lastName,
    values.phone,
    ...guests.flatMap((guest) =>
      GUEST_FIELDS.map((name) => guest?.[name]),
    ),
    values.agency,
    values.purpose,
  ];

  if (values.agency === MINISTRY_OF_FINANCE_AGENCY) {
    required.push(values.division);
  }

  if (values.purpose === MEETING_PURPOSE) {
    required.push(values.meetingId);

    if (values.meetingId === CUSTOM_MEETING_OPTION) {
      required.push(values.customMeetingTitle);
    }
  } else if (values.purpose) {
    required.push(values.personVisiting);
  }

  // Asked once a purpose is chosen, unless the meeting covers it.
  if (values.purpose && !meetingCoversWifi) {
    required.push(values.wifiAccess);
  }

  return {
    done: required.filter(filled).length,
    total: required.length,
  };
}

// Pressing "Register and check in" is the privacy acknowledgement (see
// the line above the button), so every submission carries consent.
const validateRegistration = zodResolver(visitorRegistrationSchema);

// context.meetingCoversWifi: the chosen meeting already asked for
// Wi-Fi, so the visitor is not asked.
function registrationResolver(values, context, options) {
  return validateRegistration(
    {
      ...values,
      consent: true,
      meetingCoversWifi: Boolean(context?.meetingCoversWifi),
    },
    context,
    options,
  );
}

export default function NewVisitorPage() {
  const [submissionError, setSubmissionError] =
    useState("");
  const [registration, setRegistration] = useState(null);
  const [step, setStep] = useState(1);

  // Mirrors the chosen meeting's Wi-Fi request for the resolver; it
  // is updated below once the meeting list is known.
  const [meetingCoversWifi, setMeetingCoversWifi] =
    useState(false);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setError,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm({
    context: { meetingCoversWifi },
    defaultValues: EMPTY_FORM,
    resolver: registrationResolver,
    shouldFocusError: true,
    shouldUnregister: true,
  });

  const watched = useWatch({
    control,
    name: WATCHED_FIELDS,
  });

  const {
    fields: guestFields,
    append: addGuest,
    remove: removeGuest,
  } = useFieldArray({ control, name: "guests" });

  const guests =
    useWatch({ control, name: "guests" }) ?? [];

  const organization =
    useWatch({ control, name: "organization" }) ?? "";

  const partySize = guestFields.length + 1;

  const values = Object.fromEntries(
    WATCHED_FIELDS.map((name, index) => [
      name,
      watched[index] ?? "",
    ]),
  );

  const visitingMinistry =
    values.agency === MINISTRY_OF_FINANCE_AGENCY;

  const attendingMeeting =
    values.purpose === MEETING_PURPOSE;

  const purposeSelected = Boolean(values.purpose);

  const {
    meetings,
    retry: retryMeetings,
    status: meetingStatus,
  } = useHostedMeetings({
    agency: values.agency,
    attending: attendingMeeting,
    division: values.division,
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
        meeting.id === values.meetingId &&
        meeting.wifiRequested === true,
    );

  if (coveredNow !== meetingCoversWifi) {
    setMeetingCoversWifi(coveredNow);
  }

  const progress = countRequired(
    values,
    guests,
    coveredNow,
  );
  const ready = progress.done === progress.total;




  // Step 1 inputs stay mounted while hidden: the form drops the values
  // of unmounted fields.
  function showStep(nextStep) {
    setStep(nextStep);
    requestAnimationFrame(() => {
      const heading = document.getElementById(
        `registration-step-${nextStep}`,
      );

      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Fewer people drops guests from the end; the per-guest remove
  // button drops a specific one.
  function changePartySize(nextSize) {
    if (nextSize > partySize) {
      addGuest(EMPTY_GUEST, { shouldFocus: false });
    } else if (nextSize < partySize) {
      removeGuest(guestFields.length - 1);
    }
  }

  async function continueToVisitDetails() {
    if (!(await trigger(STEP_ONE_FIELDS, { shouldFocus: true }))) {
      return;
    }

    // The schema's cross-field checks only run once the whole form is
    // valid, so repeated phones are checked here before moving on.
    const repeated = findRepeatedGuestPhones(
      getValues("phone"),
      getValues("guests"),
    );

    if (repeated.length > 0) {
      repeated.forEach((index, position) => {
        setError(
          `guests.${index}.phone`,
          { message: REPEATED_PHONE_MESSAGE, type: "custom" },
          { shouldFocus: position === 0 },
        );
      });
      return;
    }

    showStep(2);
  }

  function handleInvalid(invalidFields) {
    if (STEP_ONE_FIELDS.some((name) => invalidFields[name])) {
      showStep(1);
    }
  }

  async function submitRegistration(formValues) {
    setSubmissionError("");

    try {
      const result = await apiRequest("/api/register", {
        body: JSON.stringify({
          ...formValues,
          meetingCoversWifi: coveredNow,
        }),
        method: "POST",
      });

      setRegistration({
        guestCount: result.guestCount ?? 0,
        reference: result.reference,
      });

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

  if (registration) {
    return <RegistrationSuccess {...registration} />;
  }

  const meetingSelectionUnavailable =
    attendingMeeting &&
    meetingStatus !== "ready";

  const stepOneReady =
    ["firstName", "lastName", "phone"].every(
      (name) => filled(values[name]),
    ) &&
    guests.every((guest) =>
      GUEST_FIELDS.every((name) => filled(guest?.[name])),
    );

  return (
    <VisitorCardShell>
      <VisitorCardHeader
        description={
          <>
            It takes about two minutes. Fields marked{" "}
            <span aria-hidden="true" className="text-red-700">*</span>
            <span className="sr-only">with an asterisk</span>{" "}
            are required.
          </>
        }
        eyebrow="First visit"
        illustration={
          <VisitorPassIllustration className="hidden w-full sm:block" />
        }
        title="Register your visit"
      >
        <RequiredProgress
          done={progress.done}
          idPrefix="registration"
          total={progress.total}
        />
      </VisitorCardHeader>

      <StepIndicator
        label="Registration steps"
        step={step}
        steps={STEPS}
      />

      <form
        className="mt-5 grid gap-5"
        noValidate
        onSubmit={(event) => {
          // Enter on step 1 moves on instead of submitting.
          if (step === 1) {
            event.preventDefault();
            void continueToVisitDetails();
            return;
          }

          void handleSubmit(submitRegistration, handleInvalid)(event);
        }}
      >
        {submissionError ? (
          <ErrorMessage message={submissionError} />
        ) : null}

        <div className="grid gap-5" hidden={step !== 1}>
          <PartySizePicker
            onChange={changePartySize}
            size={partySize}
          />

          <FormSection
            description="As shown on your valid ID."
            icon={UserRound}
            number={1}
            title="Your details"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                error={errors.firstName?.message}
                id="firstName"
                label="First name"
                required
              >
                <IconInput icon={UserRound}>
                  <input
                    aria-describedby={describedBy(
                      "firstName",
                      false,
                      errors.firstName,
                    )}
                    aria-invalid={Boolean(errors.firstName)}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    className={ICON_INPUT}
                    id="firstName"
                    maxLength="60"
                    placeholder="Enter your first name"
                    {...register("firstName")}
                  />
                </IconInput>
              </Field>

              <Field
                error={errors.lastName?.message}
                id="lastName"
                label="Last name"
                required
              >
                <IconInput icon={UserRound}>
                  <input
                    aria-describedby={describedBy(
                      "lastName",
                      false,
                      errors.lastName,
                    )}
                    aria-invalid={Boolean(errors.lastName)}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    className={ICON_INPUT}
                    id="lastName"
                    maxLength="60"
                    placeholder="Enter your last name"
                    {...register("lastName")}
                  />
                </IconInput>
              </Field>
            </div>

            <Field
              description="For example 024 000 0000. Ministry of Finance will send your booking details on WhatsApp, or by SMS if WhatsApp isn't available. Wi-Fi details come by SMS."
              error={errors.phone?.message}
              id="phone"
              label="Phone/WhatsApp number"
              required
            >
              <IconInput icon={Phone}>
                <input
                  aria-describedby={describedBy(
                    "phone",
                    true,
                    errors.phone,
                  )}
                  aria-invalid={Boolean(errors.phone)}
                  autoComplete="tel"
                  className={ICON_INPUT}
                  id="phone"
                  inputMode="tel"
                  maxLength="30"
                  placeholder="024 000 0000"
                  type="tel"
                  {...register("phone")}
                />
              </IconInput>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                error={errors.email?.message}
                id="email"
                label={<OptionalLabel>Email</OptionalLabel>}
              >
                <IconInput icon={Mail}>
                  <input
                    aria-describedby={describedBy(
                      "email",
                      false,
                      errors.email,
                    )}
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="email"
                    className={ICON_INPUT}
                    id="email"
                    inputMode="email"
                    maxLength="254"
                    placeholder="name@example.com"
                    type="email"
                    {...register("email")}
                  />
                </IconInput>
              </Field>

              <Field
                error={errors.organization?.message}
                id="organization"
                label={<OptionalLabel>Organisation</OptionalLabel>}
              >
                <IconInput icon={Building2}>
                  <input
                    aria-describedby={describedBy(
                      "organization",
                      false,
                      errors.organization,
                    )}
                    aria-invalid={Boolean(errors.organization)}
                    autoCapitalize="words"
                    autoComplete="organization"
                    className={ICON_INPUT}
                    id="organization"
                    maxLength="160"
                    placeholder="Who you represent"
                    {...register("organization")}
                  />
                </IconInput>
              </Field>
            </div>
          </FormSection>

          {guestFields.length > 0 ? (
            <GuestsSection
              errors={errors.guests}
              fields={guestFields}
              onRemove={removeGuest}
              organization={organization.trim()}
              register={register}
            />
          ) : null}

          <StepButton
            onClick={continueToVisitDetails}
            ready={stepOneReady}
            type="button"
          >
            Continue to visit details
            <ArrowRight aria-hidden="true" className="size-5" />
          </StepButton>
        </div>

        <div className="grid gap-5" hidden={step !== 2}>
          <FormSection
            description="Where you are going and why."
            icon={CalendarDays}
            number={2}
            title="Visit details"
          >
            <Field
              description="Visiting Ministry staff or doing business in the Ministry? Choose Ministry of Finance (MoF)."
              error={errors.agency?.message}
              id="agency"
              label="Agency being visited"
              required
            >
              <ControlledAppSelect
                control={control}
                describedBy={describedBy(
                  "agency",
                  true,
                  errors.agency,
                )}
                id="agency"
                invalid={Boolean(errors.agency)}
                labelledBy="agency-label"
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
                id="division"
                label="Ministry of Finance division"
                required
              >
                <ControlledAppSelect
                  control={control}
                  describedBy={describedBy(
                    "division",
                    true,
                    errors.division,
                  )}
                  id="division"
                  invalid={Boolean(errors.division)}
                  labelledBy="division-label"
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
              id="purpose"
              label="Purpose of visit"
              required
            >
              <ControlledAppSelect
                control={control}
                describedBy={describedBy(
                  "purpose",
                  true,
                  errors.purpose,
                )}
                id="purpose"
                invalid={Boolean(errors.purpose)}
                labelledBy="purpose-label"
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
                  selectedMeeting={values.meetingId}
                />
              </div>
            ) : null}

            {purposeSelected && !attendingMeeting ? (
              <Field
                description="The staff member, officer or contact person you are visiting."
                error={errors.personVisiting?.message}
                id="personVisiting"
                label="Person being visited"
                required
              >
                <IconInput icon={UserRound}>
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
                    className={ICON_INPUT}
                    id="personVisiting"
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
                description={
                  guestFields.length > 0
                    ? "Your answer applies to your guests too. The IT team uses your mobile number and email to send the Wi-Fi details."
                    : undefined
                }
                error={errors.wifiAccess}
              />
            ) : null}
          </FormSection>

          <PrivacyAgreement>
            {guestFields.length > 0
              ? "By registering, you confirm you and your guests agree to how the Ministry handles your information."
              : "By registering, you agree to how the Ministry handles your information."}
          </PrivacyAgreement>

          <div className="flex flex-col-reverse gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)]">
            <SecondaryStepButton
              disabled={isSubmitting}
              onClick={() => showStep(1)}
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
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
              <Check aria-hidden="true" className="size-5" />
              {isSubmitting
                ? "Registering…"
                : "Register and check in"}
            </StepButton>
          </div>
        </div>
      </form>

      <VisitorPrivacyFootnote />

    </VisitorCardShell>
  );
}

function PartySizePicker({ onChange, size }) {
  const atMinimum = size <= 1;
  const atMaximum = size >= MAX_VISIT_PARTY_SIZE;

  // aria-disabled keeps the button focusable at the limit, so keyboard
  // focus does not jump back to the page.
  function step(change, blocked) {
    if (!blocked) {
      onChange(size + change);
    }
  }

  const buttonClass =
    "grid size-11 place-items-center rounded-full text-[#0f766e] transition hover:bg-[#e6f7f4] focus-visible:ring-4 focus-visible:ring-brand-200 aria-disabled:cursor-not-allowed aria-disabled:text-slate-400 aria-disabled:hover:bg-transparent dark:text-[#5eead4] dark:hover:bg-[#0b2b29]";

  return (
    <section
      aria-labelledby="party-size-title"
      className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]"
        >
          <UsersRound className="size-5" />
        </span>

        <div>
          <h2
            className="text-lg font-black tracking-tight text-slate-950"
            id="party-size-title"
          >
            How many people are visiting?
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Including you. Up to {MAX_VISIT_PARTY_SIZE} people.
          </p>
        </div>
      </div>

      <div
        aria-labelledby="party-size-title"
        className="flex items-center self-start rounded-full border border-slate-200 bg-slate-50 p-1 sm:self-auto dark:bg-[#0d1626]"
        role="group"
      >
        <button
          aria-disabled={atMinimum}
          aria-label="Remove a person"
          className={buttonClass}
          onClick={() => step(-1, atMinimum)}
          type="button"
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>

        <output
          aria-live="polite"
          className="min-w-16 text-center"
        >
          <span className="text-2xl font-black text-slate-950">
            {size}
          </span>
          <span className="sr-only">
            {size === 1 ? " person" : " people"}
          </span>
        </output>

        <button
          aria-disabled={atMaximum}
          aria-label="Add a person"
          className={buttonClass}
          onClick={() => step(1, atMaximum)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
    </section>
  );
}

function GuestsSection({
  errors,
  fields,
  onRemove,
  organization,
  register,
}) {
  return (
    <section
      aria-labelledby="guests-title"
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]"
        >
          <UsersRound className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <h2
            className="text-xl font-black tracking-tight text-slate-950"
            id="guests-title"
          >
            Your guests
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Each guest collects their own visitor card at reception.
          </p>
        </div>
      </div>

      {/* The database records guests under the lead's organisation. */}
      {organization ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#f0fdfa] px-4 py-3 text-sm text-slate-700 dark:bg-[#0b2b29]">
          <Building2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]"
          />
          <span>
            Guests are recorded under{" "}
            <strong className="font-bold text-slate-950">
              {organization}
            </strong>
            .
          </span>
        </p>
      ) : null}

      <div className="mt-6 grid gap-4">
        {fields.map((field, index) => (
          <GuestFields
            errors={errors?.[index]}
            index={index}
            key={field.id}
            onRemove={() => onRemove(index)}
            register={register}
          />
        ))}
      </div>
    </section>
  );
}

function GuestFields({ errors, index, onRemove, register }) {
  const label = `Guest ${index + 2}`;
  const fieldId = (name) => `guest-${index}-${name}`;

  return (
    <fieldset className="relative rounded-2xl border border-[#99e2d6] bg-[#f0fdfa] p-4 dark:border-[#14756d] dark:bg-[#0b2b29]">
      <legend className="float-left flex min-h-11 items-center font-black text-[#134e4a] dark:text-[#ccfbf1]">
        {label}
      </legend>

      <button
        aria-label={`Remove ${label.toLowerCase()}`}
        className="absolute right-3 top-4 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-slate-700 transition hover:bg-[#ffffff] focus-visible:ring-4 focus-visible:ring-brand-200 dark:text-slate-300 dark:hover:bg-[#0d1626]"
        onClick={onRemove}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
        Remove
      </button>

      <div className="clear-both grid gap-4 pt-3 md:grid-cols-3">
        <Field
          error={errors?.firstName?.message}
          id={fieldId("firstName")}
          label="First name"
          required
        >
          <IconInput icon={UserRound}>
            <input
              aria-describedby={describedBy(
                fieldId("firstName"),
                false,
                errors?.firstName,
              )}
              aria-invalid={Boolean(errors?.firstName)}
              autoCapitalize="words"
              autoComplete="off"
              className={ICON_INPUT}
              id={fieldId("firstName")}
              maxLength="60"
              placeholder="First name"
              {...register(`guests.${index}.firstName`)}
            />
          </IconInput>
        </Field>

        <Field
          error={errors?.lastName?.message}
          id={fieldId("lastName")}
          label="Last name"
          required
        >
          <IconInput icon={UserRound}>
            <input
              aria-describedby={describedBy(
                fieldId("lastName"),
                false,
                errors?.lastName,
              )}
              aria-invalid={Boolean(errors?.lastName)}
              autoCapitalize="words"
              autoComplete="off"
              className={ICON_INPUT}
              id={fieldId("lastName")}
              maxLength="60"
              placeholder="Last name"
              {...register(`guests.${index}.lastName`)}
            />
          </IconInput>
        </Field>

        <Field
          error={errors?.phone?.message}
          id={fieldId("phone")}
          label="Phone/WhatsApp number"
          required
        >
          <IconInput icon={Phone}>
            <input
              aria-describedby={describedBy(
                fieldId("phone"),
                false,
                errors?.phone,
              )}
              aria-invalid={Boolean(errors?.phone)}
              autoComplete="off"
              className={ICON_INPUT}
              id={fieldId("phone")}
              inputMode="tel"
              maxLength="30"
              placeholder="024 000 0000"
              type="tel"
              {...register(`guests.${index}.phone`)}
            />
          </IconInput>
        </Field>
      </div>
    </fieldset>
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
      <>
        <div className="flex items-start gap-3 text-[#134e4a] dark:text-[#ccfbf1]">
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
      </>
    );
  }

  return (
    <>
      <Field
        description="Select the meeting on your invitation. If it is not there, select Meeting not listed."
        error={errors.meetingId?.message}
        id="meetingId"
        label="Title of meeting"
        required
      >
        <ControlledAppSelect
          control={control}
          describedBy={describedBy(
            "meetingId",
            true,
            errors.meetingId,
          )}
          id="meetingId"
          invalid={Boolean(errors.meetingId)}
          labelledBy="meetingId-label"
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
      description="The meeting title on your invitation. It applies only to your visit."
      error={errors.customMeetingTitle?.message}
      id="customMeetingTitle"
      label="Enter meeting title"
      required
    >
      <IconInput icon={MapPin}>
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
          className={ICON_INPUT}
          id="customMeetingTitle"
          maxLength="160"
          placeholder="Meeting title"
          {...register("customMeetingTitle")}
        />
      </IconInput>
    </Field>
  );
}

function RegistrationSuccess({ guestCount, reference }) {
  return (
    <CheckInSuccess
      description={
        guestCount > 0
          ? "Show this reference number at reception. Each person collects their own visitor card."
          : "Show this reference number at reception. Do not share it publicly."
      }
      guestCount={guestCount}
      reference={reference}
      title="Welcome to the Ministry"
    />
  );
}
