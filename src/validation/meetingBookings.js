import { z } from "zod";
import {
  MOF_DIVISIONS,
  MINISTRY_OF_FINANCE_AGENCY,
  VISIT_AGENCIES,
} from "../constants/visitorOptions.js";
import { firstMeetingDay } from "../lib/meetingSchedule.js";
import { normalizePhone } from "./visitorRegistration.js";
import {
  FLOOR_REQUIRED_MESSAGE,
  MEETING_WIFI_REQUIRED_MESSAGE,
  floorField,
  wifiAccessField,
} from "./wifiAccess.js";

// Meeting bookings made by Ministry staff through /book. The database
// repeats the time, guest and ownership rules; these give the form
// clear messages first.

export const MAX_BOOKING_GUESTS = 30;
export const BOOKING_MIN_LEAD_HOURS = 2;
export const BOOKING_MAX_DAYS_AHEAD = 90;
export const BOOKING_SCHEDULE_TYPES = Object.freeze(["single", "continuous", "weekly"]);

// For multi-day meetings; the booker passes it on to their guests.
export const LATER_DAYS_NOTE =
  "Guests are expected at reception on the first day only. On later days they check in at the reception kiosk as returning visitors with their mobile number.";

export const NO_MATCHING_WEEKDAY_MESSAGE =
  "Choose at least one weekday that falls between the start and end dates.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (maximum, label) =>
  z
    .string()
    .trim()
    .max(maximum, `${label} cannot exceed ${maximum} characters.`)
    .default("");

export const bookingGuestSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Email address is too long.")
    .refine(
      (value) => value === "" || EMAIL.test(value),
      "Enter a valid email address or leave it blank.",
    )
    .default(""),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the guest's full name.")
    .max(120, "Guest name cannot exceed 120 characters."),
  organization: optionalText(160, "Organisation"),
  phone: z
    .string()
    .trim()
    .min(8, "Enter the guest's mobile number.")
    .max(30, "Mobile number is too long.")
    .transform(normalizePhone)
    .refine(
      (value) => /^\+[1-9]\d{7,14}$/.test(value),
      "Enter a valid mobile number, for example +233 24 000 0000.",
    ),
});

export const REPEATED_GUEST_PHONE_MESSAGE =
  "Each guest needs a different mobile number.";

function checkGuestPhones(guests, context) {
  const seen = new Set();

  guests.forEach((guest, index) => {
    if (seen.has(guest.phone)) {
      context.addIssue({
        code: "custom",
        message: REPEATED_GUEST_PHONE_MESSAGE,
        path: ["guests", index, "phone"],
      });
    }

    seen.add(guest.phone);
  });
}

export const guestListSchema = z
  .array(bookingGuestSchema)
  .max(
    MAX_BOOKING_GUESTS,
    `A booking can list up to ${MAX_BOOKING_GUESTS} guests.`,
  );

// Today's date and the current time in Accra (UTC+0, no daylight
// saving), as YYYY-MM-DD and minutes since midnight.
function accraNow(now) {
  const iso = new Date(now).toISOString();

  return {
    date: iso.slice(0, 10),
    minutes: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)),
  };
}

function toMinutes(time) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

export function createBookingFormSchema(now = () => Date.now()) {
  return z
    .object({
      consent: z.literal(true, {
        message: "Confirm that your guests know their details will be shared with reception.",
      }),
      endsAt: z.string().trim().regex(TIME, "Choose the end time."),
      floor: floorField,
      guests: guestListSchema.default([]),
      hostAgency: z
        .union([z.literal(""), z.enum(VISIT_AGENCIES)], {
          message: "Select a valid agency.",
        })
        .default(""),
      endsOn: z.string().trim().default(""),
      hostDivision: z.string().trim().default(""),
      notes: optionalText(500, "Notes for reception"),
      // 0 (Sunday) to 6 (Saturday); weekly meetings only.
      recurrenceDays: z
        .array(z.number().int().min(0).max(6))
        .max(7)
        .default([]),
      scheduleType: z
        .enum(BOOKING_SCHEDULE_TYPES, {
          message: "Select how often the meeting happens.",
        })
        .default("single"),
      startsAt: z.string().trim().regex(TIME, "Choose the start time."),
      startsOn: z.string().trim().regex(ISO_DATE, "Choose the meeting date."),
      title: z
        .string()
        .trim()
        .min(2, "Meeting title must contain at least 2 characters.")
        .max(160, "Meeting title cannot exceed 160 characters."),
      venue: optionalText(120, "Venue"),
      wifiAccess: wifiAccessField,
    })
    .superRefine((value, context) => {
      if (!value.floor) {
        context.addIssue({
          code: "custom",
          message: FLOOR_REQUIRED_MESSAGE,
          path: ["floor"],
        });
      }

      if (!value.wifiAccess) {
        context.addIssue({
          code: "custom",
          message: MEETING_WIFI_REQUIRED_MESSAGE,
          path: ["wifiAccess"],
        });
      }

      if (!value.hostAgency) {
        context.addIssue({
          code: "custom",
          message: "Select the hosting agency.",
          path: ["hostAgency"],
        });
      }

      if (
        value.hostAgency === MINISTRY_OF_FINANCE_AGENCY &&
        !MOF_DIVISIONS.includes(value.hostDivision)
      ) {
        context.addIssue({
          code: "custom",
          message: "Select the hosting division.",
          path: ["hostDivision"],
        });
      }

      if (
        TIME.test(value.startsAt) &&
        TIME.test(value.endsAt) &&
        value.endsAt <= value.startsAt
      ) {
        context.addIssue({
          code: "custom",
          message: "The end time must be after the start time.",
          path: ["endsAt"],
        });
      }

      const multiDay = value.scheduleType !== "single";

      if (multiDay) {
        if (!ISO_DATE.test(value.endsOn)) {
          context.addIssue({
            code: "custom",
            message: "Select the last day of the meeting.",
            path: ["endsOn"],
          });
        } else if (ISO_DATE.test(value.startsOn) && value.endsOn < value.startsOn) {
          context.addIssue({
            code: "custom",
            message: "The end date cannot be before the start date.",
            path: ["endsOn"],
          });
        }
      }

      if (value.scheduleType === "weekly" && value.recurrenceDays.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Select at least one day of the week.",
          path: ["recurrenceDays"],
        });
      }

      const datesValid =
        ISO_DATE.test(value.startsOn) &&
        (!multiDay || (ISO_DATE.test(value.endsOn) && value.endsOn >= value.startsOn));

      if (!datesValid) {
        checkGuestPhones(value.guests, context);
        return;
      }

      const today = accraNow(now());
      const lastDay = multiDay ? value.endsOn : value.startsOn;

      if (lastDay > addDays(today.date, BOOKING_MAX_DAYS_AHEAD)) {
        context.addIssue({
          code: "custom",
          message: `Meetings can be booked up to ${BOOKING_MAX_DAYS_AHEAD} days ahead.`,
          path: [multiDay ? "endsOn" : "startsOn"],
        });
      }

      // Guests are expected on the first day the meeting happens, so
      // the notice period counts from then.
      const firstDay = firstMeetingDay(value);

      if (
        !firstDay &&
        value.scheduleType === "weekly" &&
        value.recurrenceDays.length > 0
      ) {
        context.addIssue({
          code: "custom",
          message: NO_MATCHING_WEEKDAY_MESSAGE,
          path: ["recurrenceDays"],
        });
      }

      if (firstDay && TIME.test(value.startsAt)) {
        const leadMinutes = BOOKING_MIN_LEAD_HOURS * 60;
        const startsInMinutes =
          (Date.parse(`${firstDay}T00:00:00Z`) -
            Date.parse(`${today.date}T00:00:00Z`)) /
            60_000 +
          toMinutes(value.startsAt) -
          today.minutes;

        if (startsInMinutes < leadMinutes) {
          context.addIssue({
            code: "custom",
            message: `Book the meeting at least ${BOOKING_MIN_LEAD_HOURS} hours before it starts.`,
            path: [firstDay < today.date ? "startsOn" : "startsAt"],
          });
        }
      }

      checkGuestPhones(value.guests, context);
    });
}

export const bookingFormSchema = createBookingFormSchema();

const bookingIdSchema = z
  .string()
  .trim()
  .uuid("A valid booking identifier is required.");

export const bookingGuestsSchema = z
  .object({
    bookingId: bookingIdSchema,
    guests: guestListSchema,
  })
  .strict()
  .superRefine((value, context) => checkGuestPhones(value.guests, context));

export const bookingListSchema = z.object({}).strict();

export const bookingCancelSchema = z
  .object({
    bookingId: bookingIdSchema,
  })
  .strict();

export const BOOKING_REQUEST_VIEWS = Object.freeze([
  "pending",
  "approved",
  "closed",
]);

export const bookingRequestListSchema = z
  .object({
    tower: z.enum(["", "tower_1", "tower_2"]).default(""),
    view: z.enum(BOOKING_REQUEST_VIEWS).default("pending"),
  })
  .strict();

export const bookingDecisionSchema = z
  .object({
    bookingId: bookingIdSchema,
    decision: z.enum(["approve", "reject"]),
    reason: z
      .string()
      .trim()
      .max(500, "The reason cannot exceed 500 characters.")
      .default(""),
    tower: z.enum(["", "tower_1", "tower_2"]).default(""),
  })
  .strict()
  .refine(
    (value) => value.decision === "approve" || value.reason.length >= 2,
    {
      message: "Give the organiser a reason for rejecting the request.",
      path: ["reason"],
    },
  );
