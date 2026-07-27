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

export const visitorRegistrationSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "Enter your first name.")
      .max(
        60,
        "First name must not exceed 60 characters.",
      )
      .transform(normalizeName),

    lastName: z
      .string()
      .trim()
      .min(1, "Enter your last name.")
      .max(
        60,
        "Last name must not exceed 60 characters.",
      )
      .transform(normalizeName),

    phone: z
      .string()
      .trim()
      .min(
        8,
        "Enter your mobile number, including the country code.",
      )
      .max(30, "Mobile number is too long.")
      .transform(normalizePhone)
      .refine(
        (value) => /^\+[1-9]\d{7,14}$/.test(value),
        "Enter a valid mobile number, for example +233 24 000 0000.",
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

    consent: z.boolean().refine((value) => value, {
      message:
        "Acknowledge the privacy notice before continuing.",
    }),
  })
  .superRefine((data, context) => {
    const fullName = normalizeName(
      `${data.firstName} ${data.lastName}`,
    );

    if (fullName.length > 120) {
      context.addIssue({
        code: "custom",
        message:
          "Combined first and last name must not exceed 120 characters.",
        path: ["lastName"],
      });
    }

    validateVisitDetails(data, context);
  })
  .transform((data) => ({
    ...data,
    ...normalizeVisitDetails(data),
    fullName: normalizeName(
      `${data.firstName} ${data.lastName}`,
    ),
  }));