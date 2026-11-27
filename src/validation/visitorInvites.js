import { z } from "zod";
import {
  FLOOR_VALUES,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";
import { addDays } from "../lib/meetingSchedule.js";
import {
  normalizePhone,
  optionalEmailField,
  optionalOrganizationField,
} from "./visitorRegistration.js";
import { wifiAccessField } from "./wifiAccess.js";

// Visitor booking links: staff create a one-visitor link; the visitor
// opens it, fills in their details and picks a date. The database
// repeats every rule; these give the forms clear messages first.

export const INVITE_MAX_DAYS_AHEAD = 30;
export const INVITE_LINKS_PER_DAY = 20;

// A booked visit is an appointment with a person, so the meeting
// purpose (which needs a meeting) is not offered.
export const INVITE_PURPOSES = Object.freeze(
  VISIT_PURPOSES.filter((purpose) => purpose !== MEETING_PURPOSE),
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const towerField = z.string().trim().default("");
const uuidField = (message) => z.uuid({ message });

// Accra is on UTC all year, so the UTC date is the Accra date.
export function accraToday(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

const destinationShape = {
  agency: z.enum(VISIT_AGENCIES, {
    message: "Choose the agency the visitor is coming to.",
  }),
  division: z.string().trim().default(""),
  floor: z.union([z.literal(""), z.enum(FLOOR_VALUES)], {
    message: "Choose a valid floor.",
  }).default(""),
  tower: towerField,
  visitorEmail: optionalEmailField,
};

function checkDivision(data, context) {
  if (
    data.agency === MINISTRY_OF_FINANCE_AGENCY &&
    !MOF_DIVISIONS.includes(data.division)
  ) {
    context.addIssue({
      code: "custom",
      message: "Choose the division the visitor is coming to.",
      path: ["division"],
    });
  }
}

function withoutDivisionOutsideMinistry(data) {
  return {
    ...data,
    division: data.agency === MINISTRY_OF_FINANCE_AGENCY ? data.division : "",
  };
}

// App staff choose the host; the person signed in with their work email
// is always the host of their own links.
export const inviteCreateSchema = z
  .object({
    ...destinationShape,
    hostName: z
      .string()
      .trim()
      .min(2, "Enter the name of the person the visitor is meeting.")
      .max(120, "The host's name cannot exceed 120 characters.")
      .transform((value) => value.replace(/\s+/g, " ")),
  })
  .strict()
  .superRefine(checkDivision)
  .transform(withoutDivisionOutsideMinistry);

export const bookerInviteCreateSchema = z
  .object(destinationShape)
  .strict()
  .superRefine(checkDivision)
  .transform(withoutDivisionOutsideMinistry);

export const inviteListSchema = z.object({ tower: towerField }).strict();

// The dashboard's Booked visitors view: today, or the next 30 days.
export const BOOKED_VIEWS = Object.freeze(["today", "upcoming"]);

export const bookedListSchema = z
  .object({
    tower: towerField,
    view: z.enum(BOOKED_VIEWS, { message: "Choose Today or Upcoming." }).default("today"),
  })
  .strict();

export const inviteCancelSchema = z
  .object({
    inviteId: uuidField("The visitor link could not be found."),
    tower: towerField,
  })
  .strict();

// "VIS-1A2B3C4D", "vis-1a2b 3c4d" or just "1A2B3C4D".
export function normalizeBookingCode(value) {
  const compact = String(value || "").replace(/\s+/g, "").toUpperCase();

  return /^[0-9A-F]{8}$/.test(compact) ? `VIS-${compact}` : compact;
}

export const bookingFindSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Enter the visitor's reference code.")
      .max(40, "That code is too long.")
      .transform(normalizeBookingCode)
      .refine(
        (value) => /^VIS-[0-9A-F]{8}$/.test(value),
        "Enter the 8 characters after VIS-, for example 1A2B3C4D.",
      ),
    tower: towerField,
  })
  .strict();

export const inviteTokenSchema = z
  .string()
  .trim()
  .regex(TOKEN, "This booking link is not valid.");

function nameField(requiredMessage, label) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(60, `${label} must not exceed 60 characters.`)
    .transform((value) => value.replace(/\s+/g, " "));
}

export function createInviteSubmitSchema(now = () => Date.now()) {
  return z
    .object({
      consent: z.literal(true, {
        message: "Acknowledge the privacy notice before continuing.",
      }),
      email: optionalEmailField,
      firstName: nameField("Enter your first name.", "First name"),
      lastName: nameField("Enter your last name.", "Last name"),
      organization: optionalOrganizationField,
      phone: z
        .string()
        .trim()
        .min(8, "Enter your mobile number, including the country code.")
        .max(30, "Mobile number is too long.")
        .transform(normalizePhone)
        .refine(
          (value) => /^\+[1-9]\d{7,14}$/.test(value),
          "Enter a valid mobile number, for example +233 24 000 0000.",
        ),
      purpose: z.enum(INVITE_PURPOSES, {
        message: "Select the purpose of your visit.",
      }),
      token: inviteTokenSchema,
      visitDate: z
        .string()
        .trim()
        .regex(ISO_DATE, "Choose the date of your visit."),
      wifiAccess: wifiAccessField,
    })
    .superRefine((data, context) => {
      const today = accraToday(now());

      if (
        ISO_DATE.test(data.visitDate) &&
        (data.visitDate < today ||
          data.visitDate > addDays(today, INVITE_MAX_DAYS_AHEAD))
      ) {
        context.addIssue({
          code: "custom",
          message: `Choose a date from today up to ${INVITE_MAX_DAYS_AHEAD} days ahead.`,
          path: ["visitDate"],
        });
      }

      if (!data.wifiAccess) {
        context.addIssue({
          code: "custom",
          message: "Choose Yes or No for Wi-Fi access.",
          path: ["wifiAccess"],
        });
      }

      if (`${data.firstName} ${data.lastName}`.length > 120) {
        context.addIssue({
          code: "custom",
          message: "Combined first and last name must not exceed 120 characters.",
          path: ["lastName"],
        });
      }
    })
    .transform((data) => ({
      ...data,
      fullName: `${data.firstName} ${data.lastName}`,
    }));
}

export const inviteSubmitSchema = createInviteSubmitSchema();
