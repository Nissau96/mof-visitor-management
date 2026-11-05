import { z } from "zod";
import {
  normalizeVisitDetails,
  validateVisitDetails,
  visitDetailsShape,
} from "./visitDetails.js";

const emailAddressSchema = z.email();

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function optionalText(maximum, message) {
  return z
    .string()
    .trim()
    .max(maximum, message)
    .transform((value) => value || undefined)
    .optional();
}

export function normalizePhone(value) {
  const compact = String(value)
    .trim()
    .replace(/[\s().-]/g, "");

  if (/^0\d{9}$/.test(compact)) {
    return `+233${compact.slice(1)}`;
  }

  if (/^233\d{9}$/.test(compact)) {
    return `+${compact}`;
  }

  if (/^00[1-9]\d{7,14}$/.test(compact)) {
    return `+${compact.slice(2)}`;
  }

  return compact;
}

// The lead visitor plus up to nine guests.
export const MAX_VISIT_PARTY_SIZE = 10;

function nameField(requiredMessage, label) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(60, `${label} must not exceed 60 characters.`)
    .transform(normalizeName);
}

function phoneField(requiredMessage) {
  return z
    .string()
    .trim()
    .min(8, requiredMessage)
    .max(30, "Mobile number is too long.")
    .transform(normalizePhone)
    .refine(
      (value) => /^\+[1-9]\d{7,14}$/.test(value),
      "Enter a valid mobile number, for example +233 24 000 0000.",
    );
}

export const REPEATED_PHONE_MESSAGE =
  "Each person needs a different mobile number.";

// Guest visits are matched to visitor profiles by phone, so every
// person in a group needs their own number. Returns the indexes of
// guests whose phone repeats the lead's or an earlier guest's.
export function findRepeatedGuestPhones(phone, guests) {
  const seen = new Set([normalizePhone(phone)]);

  return guests.flatMap((guest, index) => {
    const guestPhone = normalizePhone(guest.phone);
    const repeated = seen.has(guestPhone);

    seen.add(guestPhone);

    return repeated ? [index] : [];
  });
}

function fullNameOf({ firstName, lastName }) {
  return normalizeName(`${firstName} ${lastName}`);
}

const guestSchema = z.object({
  firstName: nameField(
    "Enter the guest's first name.",
    "First name",
  ),
  lastName: nameField(
    "Enter the guest's last name.",
    "Last name",
  ),
  phone: phoneField(
    "Enter the guest's mobile number.",
  ),
});

export const visitorRegistrationSchema = z
  .object({
    firstName: nameField(
      "Enter your first name.",
      "First name",
    ),

    lastName: nameField(
      "Enter your last name.",
      "Last name",
    ),

    phone: phoneField(
      "Enter your mobile number, including the country code.",
    ),

    email: z
      .string()
      .trim()
      .max(
        254,
        "Email address must not exceed 254 characters.",
      )
      .refine(
        (value) =>
          value === "" ||
          emailAddressSchema.safeParse(value).success,
        "Enter a valid email address.",
      )
      .transform(
        (value) => value.toLowerCase() || undefined,
      )
      .optional(),

    organization: optionalText(
      160,
      "Organisation must not exceed 160 characters.",
    ),

    ...visitDetailsShape,

    guests: z
      .array(guestSchema)
      .max(
        MAX_VISIT_PARTY_SIZE - 1,
        `A group can have up to ${MAX_VISIT_PARTY_SIZE} people.`,
      )
      .default([]),

    consent: z.boolean().refine((value) => value, {
      message:
        "Acknowledge the privacy notice before continuing.",
    }),
  })
  .superRefine((data, context) => {
    if (fullNameOf(data).length > 120) {
      context.addIssue({
        code: "custom",
        message:
          "Combined first and last name must not exceed 120 characters.",
        path: ["lastName"],
      });
    }

    data.guests.forEach((guest, index) => {
      if (fullNameOf(guest).length > 120) {
        context.addIssue({
          code: "custom",
          message:
            "Combined first and last name must not exceed 120 characters.",
          path: ["guests", index, "lastName"],
        });
      }
    });

    findRepeatedGuestPhones(
      data.phone,
      data.guests,
    ).forEach((index) => {
      context.addIssue({
        code: "custom",
        message: REPEATED_PHONE_MESSAGE,
        path: ["guests", index, "phone"],
      });
    });

    validateVisitDetails(data, context);
  })
  .transform((data) => ({
    ...data,
    ...normalizeVisitDetails(data),
    fullName: fullNameOf(data),
    guests: data.guests.map((guest) => ({
      ...guest,
      fullName: fullNameOf(guest),
    })),
  }));