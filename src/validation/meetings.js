import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalTowerSchema = z
  .enum(["", "tower_1", "tower_2"])
  .default("");

const isoDateSchema = (message) =>
  z
    .string()
    .trim()
    .regex(ISO_DATE, message)
    .refine(
      (value) =>
        !Number.isNaN(
          Date.parse(`${value}T00:00:00Z`),
        ),
      message,
    );

const optionalTimeSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || TIME.test(value),
    "Enter a time such as 09:30.",
  )
  .default("");

const optionalTextSchema = (maximum, label) =>
  z
    .string()
    .trim()
    .max(
      maximum,
      `${label} cannot exceed ${maximum} characters.`,
    )
    .default("");

const meetingIdSchema = z
  .string()
  .trim()
  .uuid("A valid meeting identifier is required.");

export const MEETING_VIEWS = Object.freeze([
  "today",
  "upcoming",
  "past",
  "cancelled",
  "range",
]);

export const meetingListSchema = z
  .object({
    from: z
      .string()
      .trim()
      .regex(ISO_DATE)
      .or(z.literal(""))
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
      .max(50)
      .default(10),
    search: optionalTextSchema(80, "Search"),
    to: z
      .string()
      .trim()
      .regex(ISO_DATE)
      .or(z.literal(""))
      .default(""),
    tower: optionalTowerSchema,
    view: z.enum(MEETING_VIEWS).default("today"),
  })
  .strict()
  .refine(
    (value) =>
      value.view !== "range" ||
      (value.from && value.to && value.from <= value.to),
    {
      message: "Select a valid date range.",
      path: ["from"],
    },
  );

// Form values for creating or editing a meeting. Dates are YYYY-MM-DD,
// times HH:MM, recurrence days 0 (Sunday) to 6 (Saturday).
export const meetingFormSchema = z
  .object({
    endsAt: optionalTimeSchema,
    endsOn: z.string().trim().default(""),
    hostDivision: optionalTextSchema(160, "Host division"),
    meetingId: meetingIdSchema.nullable().default(null),
    meetingTower: z.enum(["tower_1", "tower_2"], {
      message: "Select the meeting tower.",
    }),
    recurrenceDays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .default([]),
    scheduleType: z.enum(
      ["single", "continuous", "weekly"],
      { message: "Select how often the meeting happens." },
    ),
    startsAt: optionalTimeSchema,
    startsOn: isoDateSchema("Select the meeting date."),
    title: z
      .string()
      .trim()
      .min(2, "Meeting title must contain at least 2 characters.")
      .max(160, "Meeting title cannot exceed 160 characters."),
    venue: optionalTextSchema(120, "Venue"),
  })
  .superRefine((value, context) => {
    if (value.scheduleType !== "single") {
      if (
        value.endsOn &&
        !ISO_DATE.test(value.endsOn)
      ) {
        context.addIssue({
          code: "custom",
          message: "Select a valid end date.",
          path: ["endsOn"],
        });
      } else if (
        value.endsOn &&
        value.endsOn < value.startsOn
      ) {
        context.addIssue({
          code: "custom",
          message: "The end date cannot be before the start date.",
          path: ["endsOn"],
        });
      }
    }

    if (value.scheduleType === "continuous" && !value.endsOn) {
      context.addIssue({
        code: "custom",
        message: "Select the last day of the meeting.",
        path: ["endsOn"],
      });
    }

    if (
      value.scheduleType === "weekly" &&
      value.recurrenceDays.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Select at least one day of the week.",
        path: ["recurrenceDays"],
      });
    }

    if (value.endsAt && !value.startsAt) {
      context.addIssue({
        code: "custom",
        message: "Add a start time before the end time.",
        path: ["startsAt"],
      });
    }

    if (
      value.startsAt &&
      value.endsAt &&
      value.endsAt <= value.startsAt
    ) {
      context.addIssue({
        code: "custom",
        message: "The end time must be after the start time.",
        path: ["endsAt"],
      });
    }
  });

export const meetingSaveSchema = z
  .object({
    meeting: meetingFormSchema,
    tower: optionalTowerSchema,
  })
  .strict();

export const meetingStatusSchema = z
  .object({
    active: z.boolean(),
    meetingId: meetingIdSchema,
    tower: optionalTowerSchema,
  })
  .strict();

export const meetingDeleteSchema = z
  .object({
    meetingId: meetingIdSchema,
    tower: optionalTowerSchema,
  })
  .strict();
