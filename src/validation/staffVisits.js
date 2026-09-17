import { z } from "zod";
import { VISIT_TOWER_VALUES } from "../constants/visitorOptions.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const visitStatusSchema = z.enum([
  "",
  "checked_in",
  "checked_out",
  "cancelled",
]);

const towerSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      VISIT_TOWER_VALUES.includes(value),
    "Select a valid tower.",
  )
  .default("");

function isValidDateString(value) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getDayDifference(start, end) {
  const startTime = Date.parse(
    `${start}T00:00:00Z`,
  );

  const endTime = Date.parse(
    `${end}T00:00:00Z`,
  );

  return Math.floor(
    (endTime - startTime) / 86_400_000,
  );
}

const optionalDateSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .refine(isValidDateString, {
        message: "Enter a valid date.",
      }),
    z.null(),
  ])
  .optional()
  .transform((value) => value || null);

export const staffVisitCheckoutSchema = z
  .object({
    tower: towerSchema,

    visitId: z
      .string()
      .trim()
      .uuid(
        "A valid visit identifier is required.",
      ),
  })
  .strict();

export const visitHistorySchema = z
  .object({
    agency: z
      .string()
      .trim()
      .max(
        160,
        "The agency filter is too long.",
      )
      .default(""),

    dateFrom: optionalDateSchema,

    dateTo: optionalDateSchema,

    division: z
      .string()
      .trim()
      .max(
        160,
        "The division filter is too long.",
      )
      .default(""),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(1),

    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(10),

    search: z
      .string()
      .trim()
      .max(
        80,
        "Search cannot exceed 80 characters.",
      )
      .default(""),

    status: visitStatusSchema.default(""),

    tower: towerSchema,
  })
  .strict()
  .superRefine((values, context) => {
    if (
      values.division &&
      values.agency !==
        "Ministry of Finance (MoF)"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Select the Ministry of Finance before filtering by division.",
        path: ["division"],
      });
    }

    if (
      values.dateFrom &&
      values.dateTo &&
      values.dateFrom > values.dateTo
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The start date must not be after the end date.",
        path: ["dateTo"],
      });

      return;
    }

    if (
      values.dateFrom &&
      values.dateTo &&
      getDayDifference(
        values.dateFrom,
        values.dateTo,
      ) > 366
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The history date range cannot exceed 366 days.",
        path: ["dateTo"],
      });
    }
  });