import { z } from "zod";
import {
  normalizeVisitDetails,
  validateVisitDetails,
  visitDetailsShape,
} from "./visitDetails.js";
import {
  optionalEmailField,
  optionalOrganizationField,
} from "./visitorRegistration.js";

export const returningVisitCheckInSchema = z
  .object({
    verificationToken: z
      .string()
      .trim()
      .min(
        20,
        "Verify your visitor record before continuing.",
      )
      .max(
        2048,
        "The visitor verification is invalid.",
      ),

    privacyAcknowledged: z.boolean().refine(
      (value) => value,
      {
        message:
          "Acknowledge the current privacy notice before continuing.",
      },
    ),

    // Only offered, and only saved, where the profile has none.
    email: optionalEmailField,
    organization: optionalOrganizationField,

    ...visitDetailsShape,
  })
  .superRefine(validateVisitDetails)
  .transform((data) => ({
    ...data,
    ...normalizeVisitDetails(data),
  }));