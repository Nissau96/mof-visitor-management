import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  ClipboardList,
  Hash,
  Info,
  ListChecks,
  LoaderCircle,
  Mail,
  MapPin,
  Send,
  Type,
  UsersRound,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link, useOutletContext } from "react-router-dom";
import { DIALOG_INPUT } from "../components/AdminDialog.jsx";
import { ControlledAppSelect } from "../components/AppSelect.jsx";
import ministryLogo from "../assets/images/Asset-8.svg";
import BookingGuestRoster from "../components/BookingGuestRoster.jsx";
import BookingHeroArt from "../components/BookingHeroArt.jsx";
import BookingSentArt from "../components/BookingSentArt.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import InputWithIcon from "../components/InputWithIcon.jsx";
import SegmentedChoice from "../components/SegmentedChoice.jsx";
import WifiAccessField from "../components/WifiAccessField.jsx";
import { toOptions } from "../constants/selectOptions.js";
import {
  MEETING_WIFI_OPTIONS,
  MOF_DIVISIONS,
  MINISTRY_OF_FINANCE_AGENCY,
  VISIT_AGENCIES,
  getFloorLabel,
  getFloorOptions,
  resolveDestinationFloor,
  resolveVisitTower,
} from "../constants/visitorOptions.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { ApiError } from "../lib/api.js";
import { submitMeetingBooking } from "../lib/bookingApi.js";
import {
  addDays,
  WEEKDAYS,
  firstMeetingDay,
  formatBookingSchedule,
  formatDate,
  formatSchedule,
  isMultiDayBooking,
  toDate,
} from "../lib/meetingSchedule.js";
import { WorkEmailSignInRequiredError } from "../lib/workEmailSignIn.js";
import {
  BOOKING_MAX_DAYS_AHEAD,
  LATER_DAYS_NOTE,
  MAX_BOOKING_GUESTS,
  bookingFormSchema,
} from "../validation/meetingBookings.js";

const AGENCY_CHOICES = toOptions(VISIT_AGENCIES);
const DIVISION_CHOICES = toOptions(MOF_DIVISIONS);
const NOTES_LIMIT = 500;

// Bookers are Ministry staff, so most meetings are hosted by the
// Ministry itself.
const DEFAULT_VALUES = Object.freeze({
  consent: false,
  endsAt: "",
  endsOn: "",
  floor: "",
  guests: [],
  hostAgency: MINISTRY_OF_FINANCE_AGENCY,
  hostDivision: "",
  notes: "",
  recurrenceDays: [],
  scheduleType: "single",
  startsAt: "",
  startsOn: "",
  title: "",
  venue: "",
  wifiAccess: "",
});

// Same labels as reception's meeting form.
const SCHEDULE_CHOICES = Object.freeze([
  Object.freeze({ label: "One day", value: "single" }),
  Object.freeze({ label: "Date range", value: "continuous" }),
  Object.freeze({ label: "Weekly", value: "weekly" }),
]);

const UNSAVED_GUEST_MESSAGE =
  "Save or cancel the guest you are adding before sending the request.";

const CARD =
  "rounded-3xl border border-slate-200/70 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)]";

function Optional({ children }) {
  return (
    <>
      {children}{" "}
      <span className="font-normal text-slate-500">(optional)</span>
    </>
  );
}

function SectionHeading({ aside, description, id, number, title }) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-800 text-sm font-black text-white"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-black tracking-tight text-slate-950" id={id}>
          {title}
        </h2>
        <p className="mt-0.5 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {aside}
    </div>
  );
}

function HeroChip({ children, icon: Icon }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-900">
      <Icon aria-hidden="true" className="size-4 text-brand-700" />
      {children}
    </li>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="border-b border-slate-100 py-3 first:pt-0">
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="mt-1 wrap-break-word font-bold text-slate-950">
        {value || (
          <>
            <span aria-hidden="true">-</span>
            <span className="sr-only">Not entered yet</span>
          </>
        )}
      </dd>
    </div>
  );
}

const clockTime = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  timeZone: "UTC",
});

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// "12:30" -> "12:30 pm".
function formatClock(time) {
  if (!time) {
    return "";
  }

  const minutes = toMinutes(time);
  return clockTime
    .format(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))
    .toLowerCase()
    .replace(" ", " ");
}

// "2 h 30 min meeting" from the start and end times.
function formatLength(startsAt, endsAt) {
  if (!startsAt || !endsAt) {
    return "";
  }

  const total = toMinutes(endsAt) - toMinutes(startsAt);

  if (total <= 0) {
    return "";
  }

  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts = [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""];

  return `${parts.filter(Boolean).join(" ")} meeting`;
}

// "Today", "Tomorrow" or "In 5 days", counted in Accra time.
function describeDayFromToday(isoDate) {
  const days = Math.round(
    (toDate(isoDate) - toDate(getAccraIsoDate())) / 86_400_000,
  );

  if (days <= 0) {
    return "Today";
  }

  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

// Up to three guest names, then "+N more".
function describeGuests(guests) {
  if (!guests.length) {
    return "None listed yet";
  }

  const names = guests.slice(0, 3).map((guest) => guest.fullName);
  const more = guests.length - names.length;

  return more > 0 ? `${names.join(", ")} +${more} more` : names.join(", ");
}

function SentFact({ hint, icon: Icon, label, value, valueClassName = "text-slate-950" }) {
  return (
    <div className="relative min-w-0 border-slate-200/70 py-5 pl-17.5 pr-5 not-first:border-t sm:pl-19.5 sm:pr-6 sm:odd:border-r sm:nth-2:border-t-0 lg:border-t-0 lg:not-last:border-r">
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">
        <span
          aria-hidden="true"
          className="absolute left-5 top-5 grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-800 sm:left-6"
        >
          <Icon className="size-5" />
        </span>
        {label}
      </dt>
      <dd className={`mt-1 text-lg font-black leading-snug ${valueClassName}`}>
        {value}
      </dd>
      {hint ? (
        <dd className="mt-1 text-sm leading-5 text-slate-600">{hint}</dd>
      ) : null}
    </div>
  );
}

// Where the request is now. Amber marks the step that is waiting, as
// the "Waiting for approval" status does on My bookings.
const SENT_STEPS = [
  {
    badge: "bg-brand-800 text-white",
    detail: "Just now",
    detailTone: "text-slate-600",
    icon: Check,
    label: "Request sent",
    tone: "border-brand-100 bg-brand-50/60",
  },
  {
    badge: "bg-amber-100 text-amber-800",
    current: true,
    detail: "Awaiting approval",
    detailTone: "font-semibold text-amber-800",
    icon: Clock,
    label: "Reception review",
    tone: "border-amber-200 bg-amber-50",
  },
  {
    badge: "bg-white text-slate-600 ring-1 ring-slate-200",
    detail: "Approved or rejected",
    detailTone: "text-slate-600",
    icon: Mail,
    label: "Email confirmation",
    tone: "border-slate-200 bg-slate-50",
  },
];

const SENT_ACTION =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200";

function BookingSubmitted({ booking, onAnother }) {
  const firstDay = booking.meetingDate || firstMeetingDay(booking);
  const multiDay = isMultiDayBooking(booking);
  const guests = booking.guests || [];
  const timeRange = [formatClock(booking.startsAt), formatClock(booking.endsAt)]
    .filter(Boolean)
    .join(" – ");

  return (
    <section
      aria-labelledby="booking-submitted-heading"
      className={`mx-auto mt-5 w-full max-w-6xl overflow-hidden ${CARD}`}
    >
      <div className="relative bg-brand-50 px-5 py-7 sm:px-8 sm:py-10">
        <div className="relative z-10 max-w-2xl">
          <h1
            className="text-pretty text-3xl font-black tracking-tight text-brand-950 sm:text-4xl"
            id="booking-submitted-heading"
          >
            Request sent to reception
          </h1>
          <div className="mt-5 rounded-2xl border border-brand-100 bg-white px-4 py-3.5 sm:px-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">
              Meeting
            </p>
            <p className="mt-1 text-pretty text-lg font-black text-slate-950">
              {booking.title}
            </p>
          </div>
        </div>
        <BookingSentArt className="pointer-events-none absolute right-6 top-1/2 hidden h-[78%] w-auto -translate-y-1/2 lg:block xl:right-14" />
      </div>

      <dl className="grid border-y border-slate-200/70 sm:grid-cols-2 lg:grid-cols-4">
        <SentFact
          hint="Quote this if you call reception"
          icon={Hash}
          label="Reference"
          value={booking.referenceCode}
          valueClassName="tracking-wide text-brand-800"
        />
        <SentFact
          hint={multiDay ? formatSchedule(booking) : describeDayFromToday(firstDay)}
          icon={CalendarDays}
          label={multiDay ? "First day" : "Date"}
          value={formatDate(firstDay, { weekday: true })}
        />
        <SentFact
          hint={formatLength(booking.startsAt, booking.endsAt)}
          icon={Clock}
          label="Time"
          value={timeRange || "-"}
        />
        <SentFact
          hint={describeGuests(guests)}
          icon={UsersRound}
          label="Guests listed"
          value={guests.length}
        />
      </dl>

      <div className="px-5 py-6 sm:px-8 sm:py-7">
        <ol aria-label="What happens next" className="grid gap-3 lg:grid-cols-3">
          {SENT_STEPS.map(({ badge, current, detail, detailTone, icon: Icon, label, tone }) => (
            <li
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${tone}`}
              key={label}
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${badge}`}>
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-slate-950">{label}</span>
                <span className={`block text-sm ${detailTone}`}>{detail}</span>
              </span>
            </li>
          ))}
        </ol>

        {multiDay ? (
          <p className="mt-5 flex items-start gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-950">
            <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand-700" />
            {LATER_DAYS_NOTE}
          </p>
        ) : null}

        <p className="mt-5 flex items-start gap-2.5 leading-7 text-slate-700">
          <Mail aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-brand-700" />
          <span>
            You will get an email at{" "}
            <strong className="break-all font-bold text-slate-950">{booking.bookerEmail}</strong>{" "}
            when reception approves or rejects it.
          </span>
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            className={`${SENT_ACTION} bg-brand-800 text-white shadow-[0_14px_30px_-14px_rgba(15,118,110,0.6)] hover:bg-brand-900`}
            to="/book/mine"
          >
            <ListChecks aria-hidden="true" className="size-4" />
            See my bookings
          </Link>
          <button
            className={`${SENT_ACTION} border border-brand-800 bg-white text-brand-800 hover:bg-brand-50`}
            onClick={onAnother}
            type="button"
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Book another meeting
          </button>
        </div>
      </div>
    </section>
  );
}

export default function BookMeetingPage() {
  const { requireSignIn } = useOutletContext();
  const [submitted, setSubmitted] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [guestDraft, setGuestDraft] = useState(false);
  const [rosterKey, setRosterKey] = useState(0);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm({
    defaultValues: DEFAULT_VALUES,
    resolver: zodResolver(bookingFormSchema),
    shouldFocusError: true,
  });

  const values = useWatch({ control });
  const today = getAccraIsoDate();
  const isMinistry = values.hostAgency === MINISTRY_OF_FINANCE_AGENCY;
  const guestCount = values.guests?.length || 0;
  const notesLength = values.notes?.length || 0;

  const scheduleType = values.scheduleType || "single";
  const repeats = scheduleType !== "single";
  const firstDay = firstMeetingDay(values);
  const multiDay = isMultiDayBooking(values);

  const required = [
    values.title?.trim(),
    values.startsOn,
    ...(repeats ? [values.endsOn] : []),
    ...(scheduleType === "weekly" ? [values.recurrenceDays?.length] : []),
    values.startsAt,
    values.endsAt,
    values.hostAgency,
    ...(isMinistry ? [values.hostDivision] : []),
    values.floor,
    values.wifiAccess,
  ];
  const completed = required.filter(Boolean).length;

  const whenText =
    values.startsOn && (!repeats || values.endsOn)
      ? formatBookingSchedule(values)
      : "";

  // The tower follows the host; the floor starts from the host's own
  // floor and can be changed, for example to a conference room.
  const meetingTower = resolveVisitTower(
    values.hostAgency,
    values.hostDivision,
  );
  const floorChoices = getFloorOptions(meetingTower);

  function prefillFloor(agency, division) {
    setValue("floor", resolveDestinationFloor(agency, division), {
      shouldValidate: Boolean(errors.floor),
    });
  }

  const hostText = values.hostAgency
    ? [isMinistry ? values.hostDivision : "", values.hostAgency]
        .filter(Boolean)
        .join(", ")
    : "";

  const handleDraftChange = useCallback((hasDraft) => {
    setGuestDraft(hasDraft);
  }, []);

  async function submit(formValues) {
    setSubmitError("");

    if (guestDraft) {
      setSubmitError(UNSAVED_GUEST_MESSAGE);
      return;
    }

    try {
      const booking = await submitMeetingBooking(formValues);
      setSubmitted(booking);
      reset(DEFAULT_VALUES);
      setRosterKey((key) => key + 1);
      window.scrollTo({ top: 0 });
    } catch (error) {
      if (
        error instanceof WorkEmailSignInRequiredError ||
        (error instanceof ApiError && error.status === 401)
      ) {
        requireSignIn(error.message);
        return;
      }

      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "The meeting could not be booked. Please try again.",
      );
    }
  }

  if (submitted) {
    return (
      <BookingSubmitted
        booking={submitted}
        onAnother={() => setSubmitted(null)}
      />
    );
  }

  return (
    <div className="mx-auto mt-5 w-full max-w-6xl">
      <header className="relative overflow-hidden rounded-3xl border border-brand-100 bg-brand-50 px-5 py-6 sm:px-8 sm:py-7">
        <div className="relative z-10 max-w-xl">
          <img
            alt="Ministry of Finance, Republic of Ghana"
            className="h-12 w-auto rounded-md dark:bg-[#ffffff] dark:p-1 sm:h-14"
            decoding="async"
            height="141"
            src={ministryLogo}
            width="349"
          />
          <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-brand-800">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            Meeting bookings
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-brand-950 sm:text-5xl sm:leading-none">
            Book a meeting
          </h1>
          <p className="mt-3 max-w-lg text-pretty leading-7 text-slate-700">
            Reception approves each booking. Your guests are then expected at
            the front desk on the day.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            <HeroChip icon={Clock}>At least 2 hours ahead</HeroChip>
            <HeroChip icon={UsersRound}>Up to {MAX_BOOKING_GUESTS} guests</HeroChip>
          </ul>
        </div>
        <BookingHeroArt className="pointer-events-none absolute right-2 top-1/2 hidden h-[86%] w-auto -translate-y-1/2 lg:block xl:right-8" />
      </header>

      <form
        aria-busy={isSubmitting}
        className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]"
        id="booking-form"
        noValidate
        onSubmit={handleSubmit(submit)}
      >
        <div className={`${CARD} divide-y divide-slate-100`}>
          <section aria-labelledby="booking-details-heading" className="grid gap-5 p-5 sm:p-7">
            <SectionHeading
              description="What the meeting is, when and where."
              id="booking-details-heading"
              number={1}
              title="Meeting details"
            />

            <Field
              error={errors.title?.message}
              id="booking-title"
              label="Meeting title"
              required
            >
              <InputWithIcon
                aria-describedby={errors.title ? "booking-title-error" : undefined}
                aria-invalid={Boolean(errors.title)}
                autoComplete="off"
                disabled={isSubmitting}
                icon={Type}
                id="booking-title"
                maxLength="160"
                placeholder="e.g. Budget review with partners"
                {...register("title")}
              />
            </Field>

            <Controller
              control={control}
              name="scheduleType"
              render={({ field }) => (
                <SegmentedChoice
                  disabled={isSubmitting}
                  legend="How often"
                  name="booking-schedule"
                  onChange={field.onChange}
                  options={SCHEDULE_CHOICES}
                  required
                  value={field.value}
                />
              )}
            />

            <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                error={errors.startsOn?.message}
                id="booking-date"
                label={
                  scheduleType === "single"
                    ? "Date"
                    : scheduleType === "weekly"
                      ? "First week"
                      : "First day"
                }
                required
              >
                <InputWithIcon
                  aria-describedby={`booking-date-hint${errors.startsOn ? " booking-date-error" : ""}`}
                  aria-invalid={Boolean(errors.startsOn)}
                  disabled={isSubmitting}
                  icon={CalendarDays}
                  id="booking-date"
                  max={addDays(today, BOOKING_MAX_DAYS_AHEAD)}
                  min={today}
                  type="date"
                  {...register("startsOn")}
                />
              </Field>

              {repeats ? (
                <Field
                  error={errors.endsOn?.message}
                  id="booking-ends-on"
                  label={scheduleType === "weekly" ? "Last week" : "Last day"}
                  required
                >
                  <InputWithIcon
                    aria-describedby={`booking-date-hint${errors.endsOn ? " booking-ends-on-error" : ""}`}
                    aria-invalid={Boolean(errors.endsOn)}
                    disabled={isSubmitting}
                    icon={CalendarDays}
                    id="booking-ends-on"
                    max={addDays(today, BOOKING_MAX_DAYS_AHEAD)}
                    min={values.startsOn || today}
                    type="date"
                    {...register("endsOn")}
                  />
                </Field>
              ) : null}
            </div>

            {scheduleType === "weekly" ? (
              <Controller
                control={control}
                name="recurrenceDays"
                render={({ field }) => (
                  <fieldset
                    aria-describedby={errors.recurrenceDays ? "booking-days-error" : undefined}
                    className="grid gap-2"
                    disabled={isSubmitting}
                  >
                    <legend className="mb-2 text-sm font-semibold text-slate-800">
                      Meets on
                      <span aria-hidden="true" className="ml-1 text-red-700">
                        *
                      </span>
                    </legend>

                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const checked = field.value.includes(day.value);

                        return (
                          <label
                            className={`relative grid min-h-11 min-w-14 cursor-pointer place-items-center rounded-full border px-3 text-sm transition has-focus-visible:ring-4 has-focus-visible:ring-brand-200 ${
                              checked
                                ? "border-brand-800 bg-brand-800 font-black text-white"
                                : "border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                            }`}
                            key={day.value}
                          >
                            <input
                              aria-label={day.long}
                              checked={checked}
                              className="sr-only min-h-0"
                              onChange={() =>
                                field.onChange(
                                  checked
                                    ? field.value.filter((value) => value !== day.value)
                                    : [...field.value, day.value],
                                )
                              }
                              type="checkbox"
                            />
                            <span aria-hidden="true">{day.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    {errors.recurrenceDays?.message ? (
                      <p className="text-sm font-semibold text-red-700" id="booking-days-error" role="alert">
                        {errors.recurrenceDays.message}
                      </p>
                    ) : null}
                  </fieldset>
                )}
              />
            ) : null}

            <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                error={errors.startsAt?.message}
                id="booking-starts-at"
                label="Start time"
                required
              >
                <InputWithIcon
                  aria-describedby={`booking-date-hint${errors.startsAt ? " booking-starts-at-error" : ""}`}
                  aria-invalid={Boolean(errors.startsAt)}
                  disabled={isSubmitting}
                  icon={Clock}
                  id="booking-starts-at"
                  type="time"
                  {...register("startsAt")}
                />
              </Field>

              <Field
                error={errors.endsAt?.message}
                id="booking-ends-at"
                label="End time"
                required
              >
                <InputWithIcon
                  aria-describedby={errors.endsAt ? "booking-ends-at-error" : undefined}
                  aria-invalid={Boolean(errors.endsAt)}
                  disabled={isSubmitting}
                  icon={Clock}
                  id="booking-ends-at"
                  type="time"
                  {...register("endsAt")}
                />
              </Field>
            </div>

            <p className="-mt-2 flex items-center gap-1.5 text-sm text-slate-600" id="booking-date-hint">
              <Info aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
              Book at least 2 hours ahead and no more than {BOOKING_MAX_DAYS_AHEAD} days ahead.
            </p>

            {multiDay ? (
              <p className="flex items-start gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-950">
                <UsersRound aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand-700" />
                <span>
                  <strong className="font-bold">Tell your guests: </strong>
                  {LATER_DAYS_NOTE}
                </span>
              </p>
            ) : null}

            <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                error={errors.hostAgency?.message}
                id="booking-host-agency"
                label="Host agency"
                required
              >
                <ControlledAppSelect
                  control={control}
                  describedBy={errors.hostAgency ? "booking-host-agency-error" : undefined}
                  disabled={isSubmitting}
                  id="booking-host-agency"
                  invalid={Boolean(errors.hostAgency)}
                  labelledBy="booking-host-agency-label"
                  name="hostAgency"
                  onValueChange={(agency) => {
                    setValue("hostDivision", "");
                    prefillFloor(agency, "");
                  }}
                  options={AGENCY_CHOICES}
                  placeholder="Select an agency"
                />
              </Field>

              {isMinistry ? (
                <Field
                  error={errors.hostDivision?.message}
                  id="booking-host-division"
                  label="Host division"
                  required
                >
                  <ControlledAppSelect
                    control={control}
                    describedBy={errors.hostDivision ? "booking-host-division-error" : undefined}
                    disabled={isSubmitting}
                    id="booking-host-division"
                    invalid={Boolean(errors.hostDivision)}
                    labelledBy="booking-host-division-label"
                    name="hostDivision"
                    onValueChange={(division) =>
                      prefillFloor(MINISTRY_OF_FINANCE_AGENCY, division)
                    }
                    options={DIVISION_CHOICES}
                    placeholder="Select a division"
                    required
                  />
                </Field>
              ) : null}

              <Field
                description="Filled in from the host. Change it if the meeting is in a conference room."
                error={errors.floor?.message}
                id="booking-floor"
                label="Floor"
                required
              >
                <ControlledAppSelect
                  control={control}
                  describedBy={`booking-floor-description${errors.floor ? " booking-floor-error" : ""}`}
                  disabled={isSubmitting}
                  id="booking-floor"
                  invalid={Boolean(errors.floor)}
                  labelledBy="booking-floor-label"
                  name="floor"
                  options={floorChoices}
                  placeholder="Select a floor"
                />
              </Field>

              <div className={isMinistry ? "" : "sm:col-span-2"}>
                <Field
                  error={errors.venue?.message}
                  id="booking-venue"
                  label={<Optional>Venue or room</Optional>}
                >
                  <InputWithIcon
                    aria-describedby={errors.venue ? "booking-venue-error" : undefined}
                    aria-invalid={Boolean(errors.venue)}
                    autoComplete="off"
                    disabled={isSubmitting}
                    icon={MapPin}
                    id="booking-venue"
                    maxLength="120"
                    placeholder="For example, Conference Room B"
                    {...register("venue")}
                  />
                </Field>
              </div>
            </div>

            <Field
              error={errors.notes?.message}
              id="booking-notes"
              label={<Optional>Notes for reception</Optional>}
            >
              <textarea
                aria-describedby={`booking-notes-count${errors.notes ? " booking-notes-error" : ""}`}
                aria-invalid={Boolean(errors.notes)}
                className={`${DIALOG_INPUT} min-h-24 py-3`}
                disabled={isSubmitting}
                id="booking-notes"
                maxLength={NOTES_LIMIT}
                placeholder="Anything reception should know, such as parking or accessibility needs."
                {...register("notes")}
              />
              <p className="-mt-1 text-right text-xs tabular-nums text-slate-600" id="booking-notes-count">
                {notesLength}/{NOTES_LIMIT}
              </p>
            </Field>
          </section>

          <section aria-labelledby="booking-guests-heading" className="grid gap-5 p-5 sm:p-7">
            <SectionHeading
              aside={
                <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-sm font-black tabular-nums text-brand-800">
                  {guestCount}/{MAX_BOOKING_GUESTS}
                  <span className="sr-only"> guests listed</span>
                </span>
              }
              description={`Everyone from outside the Ministry, up to ${MAX_BOOKING_GUESTS}. Reception uses the mobile number to find returning visitors.`}
              id="booking-guests-heading"
              number={2}
              title="Guests"
            />

            <BookingGuestRoster
              control={control}
              disabled={isSubmitting}
              errors={errors}
              key={rosterKey}
              onDraftChange={handleDraftChange}
            />

            <WifiAccessField
              control={control}
              description="One answer for the whole meeting. The IT team sends the Wi-Fi details to each guest's mobile number or email."
              error={errors.wifiAccess}
              id="booking-wifi-access"
              label="Wi-Fi for guests"
              options={MEETING_WIFI_OPTIONS}
            />
          </section>

          <section aria-labelledby="booking-confirm-heading" className="grid gap-5 p-5 sm:p-7">
            <SectionHeading
              description="One last check before reception sees it."
              id="booking-confirm-heading"
              number={3}
              title="Confirm"
            />

            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 transition hover:border-brand-300">
                <input
                  aria-describedby={errors.consent ? "booking-consent-error" : undefined}
                  aria-invalid={Boolean(errors.consent)}
                  className="mt-1 size-5 min-h-0 shrink-0 border-0 p-0 shadow-none accent-brand-800"
                  disabled={isSubmitting}
                  type="checkbox"
                  {...register("consent")}
                />
                <span>
                  I have told my guests that their name, mobile number and
                  organisation will be shared with Ministry reception for
                  access and security.
                </span>
              </label>
              {errors.consent ? (
                <p className="text-sm font-semibold text-red-700" id="booking-consent-error" role="alert">
                  {errors.consent.message}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <aside aria-labelledby="booking-summary-heading" className={`${CARD} p-5 sm:p-6 lg:sticky lg:top-5`}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-800">
              <ClipboardList aria-hidden="true" className="size-5" />
            </span>
            <h2 className="text-lg font-black tracking-tight text-slate-950" id="booking-summary-heading">
              Booking summary
            </h2>
          </div>

          <dl className="mt-5">
            <SummaryRow label="Meeting" value={values.title?.trim()} />
            <SummaryRow label="When" value={whenText} />
            {multiDay && firstDay ? (
              <SummaryRow
                label="Guests expected"
                value={`${formatDate(firstDay, { weekday: true })} only`}
              />
            ) : null}
            <SummaryRow label="Host" value={hostText} />
            <SummaryRow
              label="Floor"
              value={getFloorLabel(values.floor, meetingTower)}
            />
            <SummaryRow label="Venue" value={values.venue?.trim() || "Not set"} />
            <SummaryRow
              label="Wi-Fi"
              value={
                values.wifiAccess === "yes"
                  ? "Guests need Wi-Fi"
                  : values.wifiAccess === "no"
                    ? "Not needed"
                    : ""
              }
            />
            <SummaryRow
              label="Guests"
              value={guestCount ? (guestCount === 1 ? "1 guest" : `${guestCount} guests`) : ""}
            />
          </dl>

          <div className="mt-4">
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-300 motion-reduce:transition-none"
                ref={(node) => {
                  // Width set through the DOM; inline style attributes are
                  // blocked by the Content-Security-Policy.
                  if (node) {
                    node.style.width = `${(completed / required.length) * 100}%`;
                  }
                }}
              />
            </div>
            <p className="mt-2 text-xs tabular-nums text-slate-600">
              {completed} of {required.length} required details
            </p>
          </div>

          {submitError ? (
            <div className="mt-4">
              <ErrorMessage message={submitError} title="Booking not sent" />
            </div>
          ) : null}

          <button
            className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-brand-800 px-6 text-base font-black text-white shadow-[0_10px_15px_-3px_rgba(15,118,110,0.25)] transition hover:bg-brand-900 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-wait disabled:opacity-70"
            disabled={isSubmitting}
            form="booking-form"
            type="submit"
          >
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-5" />
            )}
            {isSubmitting ? "Sending request…" : "Send booking request"}
          </button>
        </aside>
      </form>
    </div>
  );
}
