import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  CalendarDays,
  Check,
  Copy,
  Link2Off,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useParams } from "react-router-dom";
import ministryLogo from "../assets/images/mof-logo.webp";
import { ControlledAppSelect } from "../components/AppSelect.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PrivacyAgreement from "../components/PrivacyNotice.jsx";
import {
  FormSection,
  IconInput,
  RequiredProgress,
  StepButton,
  VisitorCardHeader,
  VisitorCardShell,
} from "../components/VisitorFlow.jsx";
import VisitorPassIllustration from "../components/VisitorPassIllustration.jsx";
import WifiAccessField from "../components/WifiAccessField.jsx";
import { toOptions } from "../constants/selectOptions.js";
import {
  VISIT_AGENCY_LABELS,
  getFloorLabel,
  getTowerLabel,
} from "../constants/visitorOptions.js";
import { addDays, formatDate } from "../lib/meetingSchedule.js";
import { submitInvite, viewInvite } from "../lib/visitorInviteApi.js";
import {
  INVITE_MAX_DAYS_AHEAD,
  INVITE_PURPOSES,
  accraToday,
  createInviteSubmitSchema,
} from "../validation/visitorInvites.js";

const ICON_INPUT = "pl-11";
const PURPOSE_CHOICES = toOptions(INVITE_PURPOSES);
const REQUIRED_FIELDS = ["firstName", "lastName", "phone", "visitDate", "purpose", "wifiAccess"];

// Pressing "Book my visit" is the privacy acknowledgement (see the line
// above the button), so every submission carries consent.
const validateInvite = zodResolver(createInviteSubmitSchema());

function inviteResolver(values, context, options) {
  return validateInvite({ ...values, consent: true }, context, options);
}

function describedBy(id, hasDescription, error) {
  return [hasDescription ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;
}

function placeOf(details) {
  return [
    details.division || VISIT_AGENCY_LABELS[details.agency] || details.agency,
    getTowerLabel(details.tower),
    getFloorLabel(details.floor || "", details.tower),
  ]
    .filter(Boolean)
    .join(" · ");
}

function CenteredCard({ children, labelledBy }) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-8 sm:px-6">
      <section
        aria-labelledby={labelledBy}
        className="flex w-full max-w-[37.5rem] flex-col items-center rounded-[2rem] border border-[#ffffff]/80 bg-white/95 px-5 py-8 text-center shadow-2xl shadow-slate-900/10 backdrop-blur sm:px-12 sm:py-10 dark:border-[#1f2d40]"
      >
        <img
          alt="Ministry of Finance, Republic of Ghana"
          className="h-14 w-auto sm:h-16 dark:rounded-xl dark:bg-[#ffffff] dark:p-1.5"
          decoding="async"
          height="66"
          src={ministryLogo}
          width="166"
        />
        {children}
      </section>
    </div>
  );
}

function LinkUnavailable({ state }) {
  const message =
    state === "used"
      ? "This link was already used to book a visit. If that was you, show the reference code you were given at reception."
      : state === "cancelled"
        ? "Your host cancelled this link."
        : state === "invalid"
          ? "This link is not valid. Check that you copied all of it."
          : "This link has expired. Booking links work for 24 hours.";

  return (
    <CenteredCard labelledBy="invite-unavailable-heading">
      <span className="mt-6 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-700">
        <Link2Off aria-hidden="true" className="size-7" />
      </span>
      <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950" id="invite-unavailable-heading">
        This link cannot be used
      </h1>
      <p className="mt-3 max-w-md text-base leading-7 text-slate-600">{message}</p>
      <p className="mt-2 max-w-md text-base leading-7 text-slate-600">
        Ask your host for a new link, or register at the reception kiosk when you arrive.
      </p>
    </CenteredCard>
  );
}

function BookingConfirmed({ booking, emailSent }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(booking.referenceCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <CenteredCard labelledBy="invite-booked-heading">
      <VisitorPassIllustration className="mt-5 w-36 sm:w-40" />

      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#99e2d6] bg-[#f0fdfa] px-4 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#0f766e] dark:border-[#14756d] dark:bg-[#0b2b29] dark:text-[#5eead4]">
        <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
        Visit booked
      </p>

      <h1
        className="mt-4 text-3xl font-black tracking-tight text-[#134e4a] sm:text-4xl dark:text-[#ffffff]"
        id="invite-booked-heading"
      >
        See you on {formatDate(booking.visitDate, { weekday: true })}
      </h1>

      <p className="mt-3 max-w-md text-base leading-7 text-slate-600" role="status">
        Show this code at reception when you arrive. Reception will give you a
        visitor card; you do not need to register at the kiosk.
      </p>

      <div className="mt-6 w-full max-w-md rounded-3xl border-2 border-dashed border-[#5eead4] bg-[#f0fdfa] px-4 py-5 dark:border-[#14756d] dark:bg-[#0b2b29]">
        <p aria-hidden="true" className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">
          Reference code
        </p>
        <p
          aria-label={`Visit reference ${booking.referenceCode}`}
          className="mt-1 break-all font-mono text-3xl font-black tracking-[0.14em] text-[#134e4a] sm:text-4xl dark:text-[#ccfbf1]"
        >
          {booking.referenceCode}
        </p>
        <button
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#99e2d6] bg-white px-4 text-sm font-bold text-[#115e59] hover:bg-[#f0fdfa] focus-visible:ring-4 focus-visible:ring-brand-200"
          onClick={copy}
          type="button"
        >
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>

      <dl className="mt-6 grid w-full max-w-md gap-2 text-left text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Visiting</dt>
          <dd className="text-right font-bold text-slate-950">{booking.hostName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Where</dt>
          <dd className="text-right font-bold text-slate-950">{placeOf(booking)}</dd>
        </div>
      </dl>

      {emailSent ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-600">
          <Mail aria-hidden="true" className="size-4" />
          We also emailed you the code.
        </p>
      ) : (
        <p className="mt-5 text-sm text-slate-600">Take a screenshot or write the code down.</p>
      )}
    </CenteredCard>
  );
}

function InviteForm({ invite, token, onBooked }) {
  const [submissionError, setSubmissionError] = useState("");
  const today = accraToday();
  const lastDay = addDays(today, INVITE_MAX_DAYS_AHEAD);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      organization: "",
      phone: "",
      purpose: "",
      token,
      visitDate: "",
      wifiAccess: "",
    },
    resolver: inviteResolver,
    shouldFocusError: true,
  });

  const values = useWatch({ control });
  const done = REQUIRED_FIELDS.filter((name) => String(values[name] || "").trim()).length;

  async function book(input) {
    setSubmissionError("");

    try {
      onBooked(
        await submitInvite({
          consent: true,
          email: input.email || "",
          firstName: input.firstName,
          lastName: input.lastName,
          organization: input.organization || "",
          phone: input.phone,
          purpose: input.purpose,
          token,
          visitDate: input.visitDate,
          wifiAccess: input.wifiAccess,
        }),
      );
    } catch (error) {
      if (error?.status === 410 || error?.status === 404) {
        onBooked({ unavailable: error.status === 404 ? "invalid" : "expired" });
        return;
      }

      setSubmissionError(error?.message || "Your visit could not be booked. Please try again.");
    }
  }

  return (
    <VisitorCardShell>
      <VisitorCardHeader
        description={
          <>
            {invite.hostName} invited you. Fields marked{" "}
            <span aria-hidden="true" className="text-red-700">*</span>
            <span className="sr-only">with an asterisk</span> are required.
          </>
        }
        eyebrow="Book your visit"
        illustration={<VisitorPassIllustration className="hidden w-full sm:block" />}
        title="Book your visit"
      >
        <RequiredProgress done={done} idPrefix="invite" total={REQUIRED_FIELDS.length} />
      </VisitorCardHeader>

      <p className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f0fdfa] px-4 py-3 text-sm leading-6 text-slate-700 dark:bg-[#0b2b29]">
        <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
        <span>
          Visiting <strong className="font-bold text-slate-950">{invite.hostName}</strong>
          <br />
          {placeOf(invite)}
        </span>
      </p>

      <form className="mt-5 grid gap-5" noValidate onSubmit={handleSubmit(book)}>
        {submissionError ? <ErrorMessage message={submissionError} title="Not booked" /> : null}

        <FormSection description="As shown on your valid ID." icon={UserRound} idPrefix="invite" number={1} title="Your details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field error={errors.firstName?.message} id="firstName" label="First name" required>
              <IconInput icon={UserRound}>
                <input
                  aria-describedby={describedBy("firstName", false, errors.firstName)}
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
            <Field error={errors.lastName?.message} id="lastName" label="Last name" required>
              <IconInput icon={UserRound}>
                <input
                  aria-describedby={describedBy("lastName", false, errors.lastName)}
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
            description="A reachable mobile number, for example 024 000 0000."
            error={errors.phone?.message}
            id="phone"
            label="Phone number"
            required
          >
            <IconInput icon={Phone}>
              <input
                aria-describedby={describedBy("phone", true, errors.phone)}
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
              description="Optional. We email your reference code here."
              error={errors.email?.message}
              id="email"
              label="Email"
            >
              <IconInput icon={Mail}>
                <input
                  aria-describedby={describedBy("email", true, errors.email)}
                  aria-invalid={Boolean(errors.email)}
                  autoComplete="email"
                  className={ICON_INPUT}
                  id="email"
                  inputMode="email"
                  maxLength="254"
                  placeholder="you@example.com"
                  type="email"
                  {...register("email")}
                />
              </IconInput>
            </Field>
            <Field
              description="Optional."
              error={errors.organization?.message}
              id="organization"
              label="Organisation"
            >
              <IconInput icon={Building2}>
                <input
                  aria-describedby={describedBy("organization", true, errors.organization)}
                  aria-invalid={Boolean(errors.organization)}
                  autoComplete="organization"
                  className={ICON_INPUT}
                  id="organization"
                  maxLength="160"
                  placeholder="Company or institution"
                  {...register("organization")}
                />
              </IconInput>
            </Field>
          </div>
        </FormSection>

        <FormSection description="When you are coming and why." icon={CalendarDays} idPrefix="invite" number={2} title="Your visit">
          <Field
            description={`From today up to ${INVITE_MAX_DAYS_AHEAD} days ahead.`}
            error={errors.visitDate?.message}
            id="visitDate"
            label="Date of visit"
            required
          >
            <IconInput icon={CalendarDays}>
              <input
                aria-describedby={describedBy("visitDate", true, errors.visitDate)}
                aria-invalid={Boolean(errors.visitDate)}
                className={ICON_INPUT}
                id="visitDate"
                max={lastDay}
                min={today}
                type="date"
                {...register("visitDate")}
              />
            </IconInput>
          </Field>

          <Field error={errors.purpose?.message} id="purpose" label="Purpose of visit" required>
            <ControlledAppSelect
              control={control}
              describedBy={errors.purpose ? "purpose-error" : undefined}
              id="purpose"
              invalid={Boolean(errors.purpose)}
              labelledBy="purpose-label"
              name="purpose"
              options={PURPOSE_CHOICES}
              placeholder="Select a purpose"
            />
          </Field>

          <WifiAccessField control={control} error={errors.wifiAccess} />
        </FormSection>

        <PrivacyAgreement>
          By booking, you agree to how the Ministry handles your information.
        </PrivacyAgreement>

        <StepButton disabled={isSubmitting} ready={done === REQUIRED_FIELDS.length} type="submit">
          {isSubmitting ? "Booking…" : "Book my visit"}
        </StepButton>
      </form>
    </VisitorCardShell>
  );
}

// /invite/:token: a visitor books their own visit with the link a
// member of staff sent them. The link works once, for 24 hours.
export default function VisitorInvitePage() {
  const { token = "" } = useParams();
  const [view, setView] = useState({ status: "loading" });

  const validToken = useMemo(() => /^[A-Za-z0-9_-]{43}$/.test(token), [token]);

  useEffect(() => {
    if (!validToken) {
      return undefined;
    }

    const controller = new AbortController();

    viewInvite(token, controller.signal)
      .then(({ invite }) => {
        if (!controller.signal.aborted) {
          setView(
            invite?.state === "unused"
              ? { invite, status: "form" }
              : { state: invite?.state || "expired", status: "unavailable" },
          );
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setView(
          error?.status === 404
            ? { state: "invalid", status: "unavailable" }
            : { message: error?.message, status: "error" },
        );
      });

    return () => controller.abort();
  }, [token, validToken]);

  if (!validToken) {
    return <LinkUnavailable state="invalid" />;
  }

  if (view.status === "loading") {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12">
        <LoadingState message="Opening your booking link…" />
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12">
        <ErrorMessage message={view.message} title="Link not opened" />
      </div>
    );
  }

  if (view.status === "unavailable") {
    return <LinkUnavailable state={view.state} />;
  }

  if (view.status === "booked") {
    return <BookingConfirmed booking={view.booking} emailSent={view.emailSent} />;
  }

  return (
    <InviteForm
      invite={view.invite}
      onBooked={(result) =>
        setView(
          result.unavailable
            ? { state: result.unavailable, status: "unavailable" }
            : { booking: result.booking, emailSent: result.emailSent, status: "booked" },
        )
      }
      token={token}
    />
  );
}
