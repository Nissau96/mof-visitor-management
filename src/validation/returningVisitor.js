import { z } from "zod";
import { normalizePhone } from "./visitorRegistration.js";

export const returningVisitorSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3, "Enter at least three characters from your name.")
    .max(80, "Search text must not exceed 80 characters.")
    .transform((value) => value.replace(/\s+/g, " ")),
});

export const returningVisitorVerificationSchema = z.object({
  lookupToken: z
    .string()
    .trim()
    .min(20, "Select a visitor record before continuing.")
    .max(2048, "The selected visitor record is invalid."),

  phone: z
    .string()
    .trim()
    .min(8, "Enter your complete registered mobile number.")
    .max(30, "Mobile number is too long.")
    .transform(normalizePhone)
    .refine(
      (value) => /^\+[1-9]\d{7,14}$/.test(value),
      "Enter a valid mobile number, for example +233 24 000 0000.",
    ),
});