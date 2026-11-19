import { z } from "zod";
import { normalizePhone } from "./visitorRegistration.js";

// A returning visitor proves the record is theirs with a one-time code
// sent by SMS to the mobile number from their first visit. Nothing
// about any record is shown until the code is entered.

export const SMS_CODE_LENGTH = 6;

const phoneField = z
  .string()
  .trim()
  .min(8, "Enter your complete registered mobile number.")
  .max(30, "Mobile number is too long.")
  .transform(normalizePhone)
  .refine(
    (value) => /^\+[1-9]\d{7,14}$/.test(value),
    "Enter a valid mobile number, for example 024 000 0000.",
  );

export const returningVisitorLookupSchema = z.object({
  phone: phoneField,
});

export const returningVisitorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the SMS."),
  phone: phoneField,
});
