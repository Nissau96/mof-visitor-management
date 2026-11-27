import { z } from "zod";
import {
  VISIT_AGENCIES,
  VISIT_TOWER_VALUES,
} from "../constants/visitorOptions.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function isIsoDate(value) {
  if (!ISO_DATE.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function daysBetween(from, to) {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

const towerSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || VISIT_TOWER_VALUES.includes(value),
    "Select a valid tower.",
  )
  .default("");

const agencySchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || VISIT_AGENCIES.includes(value),
    "Select a valid agency.",
  )
  .default("");

const dateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, "Enter a valid date.");

const rangeFields = {
  agency: agencySchema,
  dateFrom: dateSchema,
  dateTo: dateSchema,
  tower: towerSchema,
};

function checkRange(values, context) {
  const days = daysBetween(values.dateFrom, values.dateTo);

  if (days < 0) {
    context.addIssue({
      code: "custom",
      message: "The start date must be on or before the end date.",
      path: ["dateTo"],
    });
  } else if (days + 1 > MAX_RANGE_DAYS) {
    context.addIssue({
      code: "custom",
      message: `The reporting period cannot exceed ${MAX_RANGE_DAYS} days.`,
      path: ["dateTo"],
    });
  }
}

function rangeRequest(report) {
  return z
    .object({ ...rangeFields, report: z.literal(report) })
    .strict()
    .superRefine(checkRange);
}

// Body of POST /api/staff/dashboard?operation=analytics. `report`
// picks what comes back: the page figures, the Client Service Unit
// month, or visit rows for a download.
export const analyticsRequestSchema = z.discriminatedUnion("report", [
  rangeRequest("overview"),
  rangeRequest("visits"),
  z
    .object({
      agency: agencySchema,
      month: z.coerce.number().int().min(1).max(12),
      report: z.literal("csu-month"),
      tower: towerSchema,
      year: z.coerce.number().int().min(2020).max(2100),
    })
    .strict(),
]);

export const ANALYTICS_MAX_RANGE_DAYS = MAX_RANGE_DAYS;
