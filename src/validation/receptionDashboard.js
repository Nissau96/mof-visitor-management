import { z } from "zod";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_TOWER_VALUES,
} from "../constants/visitorOptions.js";

function isAllowedValue(values, value) {
  return value === "" || values.includes(value);
}

export const receptionDashboardSchema = z
  .object({
    agency: z
      .string()
      .trim()
      .max(
        160,
        "Agency filter must not exceed 160 characters.",
      )
      .refine(
        (value) =>
          isAllowedValue(VISIT_AGENCIES, value),
        "Select a valid agency.",
      )
      .default(""),

    division: z
      .string()
      .trim()
      .max(
        160,
        "Division filter must not exceed 160 characters.",
      )
      .refine(
        (value) =>
          isAllowedValue(MOF_DIVISIONS, value),
        "Select a valid Ministry division.",
      )
      .default(""),

    page: z
      .number()
      .int("Page must be a whole number.")
      .min(1, "Page must be at least 1.")
      .max(10000, "Page is too large.")
      .default(1),

    query: z
      .string()
      .trim()
      .max(
        80,
        "Search must not exceed 80 characters.",
      )
      .refine(
        (value) =>
          value === "" || value.length >= 2,
        "Enter at least two characters to search.",
      )
      .default(""),

    tower: z
      .string()
      .trim()
      .refine(
        (value) =>
          isAllowedValue(
            VISIT_TOWER_VALUES,
            value,
          ),
        "Select a valid tower.",
      )
      .default(""),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      data.division &&
      data.agency !== MINISTRY_OF_FINANCE_AGENCY
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Select Ministry of Finance before filtering by division.",
        path: ["division"],
      });
    }
  });