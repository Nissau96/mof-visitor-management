import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  Check,
  Mail,
  Pencil,
  Smartphone,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import Field from "./Field.jsx";
import InputWithIcon from "./InputWithIcon.jsx";
import {
  MAX_BOOKING_GUESTS,
  REPEATED_GUEST_PHONE_MESSAGE,
  bookingGuestSchema,
} from "../validation/meetingBookings.js";

// The guests on a new booking. Saved guests are listed as rows; one
// guest at a time is added or changed in the editor below them, with
// its own validation, so the booking form only ever holds complete
// guests.

const EMPTY_GUEST = Object.freeze({
  email: "",
  fullName: "",
  organization: "",
  phone: "",
});

function Optional({ children }) {
  return (
    <>
      {children}{" "}
      <span className="font-normal text-slate-500">(optional)</span>
    </>
  );
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function GuestRow({ disabled, error, guest, index, onEdit, onRemove }) {
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 sm:flex-nowrap sm:p-4 ${
        error ? "border-red-300" : "border-slate-200"
      }`}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800"
      >
        {initials(guest.fullName)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-slate-950">{guest.fullName}</p>
        <p className="truncate text-sm text-slate-600">
          {[guest.phone, guest.organization, guest.email]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {error ? (
          <p className="mt-1 text-sm font-semibold text-red-700">
            Check this guest’s details.
          </p>
        ) : null}
      </div>

      <div className="ml-auto flex gap-1">
        <button
          aria-label={`Edit ${guest.fullName}`}
          className="grid size-11 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
          disabled={disabled}
          onClick={() => onEdit(index)}
          type="button"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
        <button
          aria-label={`Remove ${guest.fullName}`}
          className="grid size-11 place-items-center rounded-full text-red-700 transition hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-50"
          disabled={disabled}
          onClick={() => onRemove(index)}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}

function GuestEditor({
  autoFocus,
  disabled,
  initial,
  onCancel,
  onDraftChange,
  onSave,
  otherPhones,
  title,
}) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setFocus,
  } = useForm({
    defaultValues: initial,
    resolver: zodResolver(bookingGuestSchema),
  });

  // Focus only when the booker opened the editor, not on page load.
  useEffect(() => {
    if (autoFocus) {
      setFocus("fullName");
    }
  }, [autoFocus, setFocus]);

  // Reports unsaved typing so the booking cannot be sent with a guest
  // still half-entered.
  const draft = useWatch({ control });
  const hasDraft = Object.values(draft).some((value) =>
    String(value || "").trim(),
  );

  useEffect(() => {
    onDraftChange(hasDraft);
  }, [hasDraft, onDraftChange]);

  useEffect(() => () => onDraftChange(false), [onDraftChange]);

  const save = handleSubmit((guest) => {
    if (otherPhones.includes(guest.phone)) {
      setError("phone", { message: REPEATED_GUEST_PHONE_MESSAGE });
      return;
    }

    onSave(guest);
  });

  return (
    <div
      aria-labelledby="booking-guest-editor-heading"
      className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 sm:p-5"
      onKeyDown={(event) => {
        // Enter saves this guest instead of sending the whole booking.
        if (event.key === "Enter" && event.target.tagName === "INPUT") {
          event.preventDefault();
          save();
        }
      }}
      role="group"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-black text-slate-950" id="booking-guest-editor-heading">
          {title}
        </h3>
        <p className="text-xs text-slate-600">
          Fields marked <span className="text-red-700">*</span> are required
        </p>
      </div>

      <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
        <Field error={errors.fullName?.message} id="booking-guest-name" label="Full name" required>
          <InputWithIcon
            aria-describedby={errors.fullName ? "booking-guest-name-error" : undefined}
            aria-invalid={Boolean(errors.fullName)}
            autoComplete="off"
            disabled={disabled}
            icon={User}
            id="booking-guest-name"
            maxLength="120"
            placeholder="Guest’s full name"
            {...register("fullName")}
          />
        </Field>

        <Field
          error={errors.phone?.message}
          id="booking-guest-phone"
          label="Mobile number"
          required
        >
          <InputWithIcon
            aria-describedby={`booking-guest-phone-hint${errors.phone ? " booking-guest-phone-error" : ""}`}
            aria-invalid={Boolean(errors.phone)}
            autoComplete="off"
            disabled={disabled}
            icon={Smartphone}
            id="booking-guest-phone"
            inputMode="tel"
            maxLength="30"
            placeholder="024 000 0000"
            type="tel"
            {...register("phone")}
          />
          <p className="-mt-1 text-xs text-slate-600" id="booking-guest-phone-hint">
            Used to find guests who have visited before.
          </p>
        </Field>

        <Field
          error={errors.email?.message}
          id="booking-guest-email"
          label={<Optional>Email address</Optional>}
        >
          <InputWithIcon
            aria-describedby={errors.email ? "booking-guest-email-error" : undefined}
            aria-invalid={Boolean(errors.email)}
            autoComplete="off"
            disabled={disabled}
            icon={Mail}
            id="booking-guest-email"
            inputMode="email"
            maxLength="254"
            placeholder="name@example.com"
            type="email"
            {...register("email")}
          />
        </Field>

        <Field
          error={errors.organization?.message}
          id="booking-guest-organization"
          label={<Optional>Organisation</Optional>}
        >
          <InputWithIcon
            aria-describedby={errors.organization ? "booking-guest-organization-error" : undefined}
            aria-invalid={Boolean(errors.organization)}
            autoComplete="off"
            disabled={disabled}
            icon={Building2}
            id="booking-guest-organization"
            maxLength="160"
            placeholder="Company or office"
            {...register("organization")}
          />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-brand-100 pt-4">
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
          disabled={disabled}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-black text-white shadow-[0_10px_15px_-3px_rgba(15,118,110,0.25)] transition hover:bg-brand-900 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
          disabled={disabled}
          onClick={save}
          type="button"
        >
          <Check aria-hidden="true" className="size-4" />
          Save guest
        </button>
      </div>
    </div>
  );
}

export default function BookingGuestRoster({
  control,
  disabled = false,
  errors,
  onDraftChange,
}) {
  const { append, fields, remove, update } = useFieldArray({
    control,
    name: "guests",
  });
  // null: closed; "new": adding; a number: changing that guest.
  const [editing, setEditing] = useState("new");
  const [editorKey, setEditorKey] = useState(0);

  const full = fields.length >= MAX_BOOKING_GUESTS;

  function open(target) {
    setEditing(target);
    setEditorKey((key) => key + 1);
  }

  function close() {
    setEditing(null);
  }

  function save(guest) {
    if (editing === "new") {
      append(guest);
    } else {
      update(editing, guest);
    }

    close();
  }

  const otherPhones = fields
    .filter((_, index) => index !== editing)
    .map((guest) => guest.phone);

  return (
    <div className="grid gap-4">
      {fields.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-800">
            <Users aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-3 font-bold text-slate-950">No guests listed yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Add each person who will attend from outside the Ministry.
          </p>
        </div>
      ) : (
        <ol aria-label="Guests" className="grid gap-2">
          {fields.map((field, index) =>
            editing === index ? null : (
              <GuestRow
                disabled={disabled || editing !== null}
                error={Boolean(errors?.guests?.[index])}
                guest={field}
                index={index}
                key={field.id}
                onEdit={open}
                onRemove={remove}
              />
            ),
          )}
        </ol>
      )}

      {editing !== null ? (
        <GuestEditor
          autoFocus={editorKey > 0}
          disabled={disabled}
          initial={editing === "new" ? EMPTY_GUEST : { ...EMPTY_GUEST, ...fields[editing] }}
          key={editorKey}
          onCancel={close}
          onDraftChange={onDraftChange}
          onSave={save}
          otherPhones={otherPhones}
          title={
            editing === "new"
              ? `Guest ${fields.length + 1}`
              : `Change guest ${editing + 1}`
          }
        />
      ) : full ? (
        <p className="text-sm font-semibold text-slate-700">
          {MAX_BOOKING_GUESTS} guests listed, the most one booking can hold.
        </p>
      ) : (
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 justify-self-start rounded-full border border-brand-300 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
          disabled={disabled}
          onClick={() => open("new")}
          type="button"
        >
          <UserPlus aria-hidden="true" className="size-4" />
          {fields.length === 0 ? "Add a guest" : "Add another guest"}
        </button>
      )}

      {typeof errors?.guests?.message === "string" ? (
        <p className="text-sm font-semibold text-red-700" role="alert">
          {errors.guests.message}
        </p>
      ) : null}
    </div>
  );
}
