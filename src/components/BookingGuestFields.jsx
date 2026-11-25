import { Trash2, UserPlus } from "lucide-react";
import { useFieldArray } from "react-hook-form";
import { DIALOG_INPUT } from "./AdminDialog.jsx";
import { MAX_BOOKING_GUESTS } from "../validation/meetingBookings.js";

const EMPTY_GUEST = Object.freeze({
  email: "",
  fullName: "",
  organization: "",
  phone: "",
});

function GuestInput({
  autoComplete = "off",
  disabled,
  error,
  id,
  inputMode,
  label,
  placeholder,
  registration,
  required = false,
  type = "text",
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-red-700">
            *
          </span>
        ) : null}
      </label>
      <input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className={DIALOG_INPUT}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        placeholder={placeholder}
        type={type}
        {...registration}
      />
      {error ? (
        <p className="text-sm font-semibold text-red-700" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Repeating name / phone / organisation / email rows for the people a
// booker expects. Works inside any react-hook-form form with a
// "guests" array field.
export default function BookingGuestFields({
  control,
  disabled = false,
  errors,
  idPrefix = "booking-guest",
  register,
}) {
  const { append, fields, remove } = useFieldArray({
    control,
    name: "guests",
  });

  const full = fields.length >= MAX_BOOKING_GUESTS;

  return (
    <fieldset className="grid gap-4">
      <legend className="text-base font-black text-slate-950">
        Guests
      </legend>

      <p className="-mt-2 text-sm leading-6 text-slate-600">
        List everyone from outside the Ministry who will attend, up to{" "}
        {MAX_BOOKING_GUESTS}. Reception uses the mobile number to find
        anyone who has visited before.
      </p>

      {fields.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">
          No guests listed yet.
        </p>
      ) : null}

      <ol className="grid gap-3">
        {fields.map((field, index) => {
          const guestErrors = errors?.guests?.[index] || {};
          const id = `${idPrefix}-${index}`;

          return (
            <li
              className="rounded-2xl border border-slate-200 bg-white p-4"
              key={field.id}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-950">
                  Guest {index + 1}
                </h3>
                <button
                  aria-label={`Remove guest ${index + 1}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => remove(index)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Remove
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <GuestInput
                  disabled={disabled}
                  error={guestErrors.fullName?.message}
                  id={`${id}-name`}
                  label="Full name"
                  registration={register(`guests.${index}.fullName`)}
                  required
                />
                <GuestInput
                  disabled={disabled}
                  error={guestErrors.phone?.message}
                  id={`${id}-phone`}
                  inputMode="tel"
                  label="Mobile number"
                  placeholder="024 000 0000"
                  registration={register(`guests.${index}.phone`)}
                  required
                  type="tel"
                />
                <GuestInput
                  disabled={disabled}
                  error={guestErrors.organization?.message}
                  id={`${id}-organization`}
                  label="Organisation (optional)"
                  registration={register(`guests.${index}.organization`)}
                />
                <GuestInput
                  disabled={disabled}
                  error={guestErrors.email?.message}
                  id={`${id}-email`}
                  inputMode="email"
                  label="Email (optional)"
                  registration={register(`guests.${index}.email`)}
                  type="email"
                />
              </div>
            </li>
          );
        })}
      </ol>

      {typeof errors?.guests?.message === "string" ? (
        <p className="text-sm font-semibold text-red-700" role="alert">
          {errors.guests.message}
        </p>
      ) : null}

      <button
        className="inline-flex min-h-12 items-center justify-center gap-2 justify-self-start rounded-full border border-brand-300 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
        disabled={disabled || full}
        onClick={() => append({ ...EMPTY_GUEST })}
        type="button"
      >
        <UserPlus aria-hidden="true" className="size-4" />
        {full ? `${MAX_BOOKING_GUESTS} guests listed` : "Add a guest"}
      </button>
    </fieldset>
  );
}
