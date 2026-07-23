import { z } from "zod";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";

const emailAddressSchema = z.email();
const uuidSchema = z.uuid();

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

function optionalNormalizedText(maximum, message) {
  return z
    .string()
    .trim()
    .max(maximum, message)
    .transform((value) =>
      value ? normalizeName(value) : undefined,
    )
    .optional();
}

function isAllowedValue(values, value) {
  return values.includes(value);
}

export function normalizePhone(value) {
  const compact = String(value).trim().replace(/[\s().-]/g, "");

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
      .max(60, "First name must not exceed 60 characters.")
      .transform(normalizeName),

    lastName: z
      .string()
      .trim()
      .min(1, "Enter your last name.")
      .max(60, "Last name must not exceed 60 characters.")
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
      .transform((value) => value.toLowerCase() || undefined)
      .optional(),

    organization: optionalText(
      160,
      "Organisation must not exceed 160 characters.",
    ),

    agency: z
      .string()
      .trim()
      .refine(
        (value) => isAllowedValue(VISIT_AGENCIES, value),
        "Select the agency you are visiting.",
      ),

    division: optionalText(
      160,
      "Division must not exceed 160 characters.",
    ),

    purpose: z
      .string()
      .trim()
      .refine(
        (value) => isAllowedValue(VISIT_PURPOSES, value),
        "Select the purpose of your visit.",
      ),

    meetingId: optionalText(
      100,
      "Meeting selection is invalid.",
    ),

    customMeetingTitle: optionalNormalizedText(
      160,
      "Meeting title must not exceed 160 characters.",
    ),

    personVisiting: optionalNormalizedText(
      120,
      "Person being visited must not exceed 120 characters.",
    ),

    consent: z.boolean().refine((value) => value, {
      message:
        "Acknowledge the privacy notice before continuing.",
    }),
  })
  .superRefine((data, context) => {
    const fullName = `${data.firstName} ${data.lastName}`;

    if (fullName.length > 120) {
      context.addIssue({
        code: "custom",
        message:
          "Combined first and last name must not exceed 120 characters.",
        path: ["lastName"],
      });
    }

    if (data.agency === MINISTRY_OF_FINANCE_AGENCY) {
      if (
        !data.division ||
        !isAllowedValue(MOF_DIVISIONS, data.division)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Select the Ministry of Finance division you are visiting.",
          path: ["division"],
        });
      }
    } else if (data.division) {
      context.addIssue({
        code: "custom",
        message:
          "A Ministry division can only be selected when visiting the Ministry of Finance.",
        path: ["division"],
      });
    }

    if (data.purpose === MEETING_PURPOSE) {
      const officialMeetingSelected =
        Boolean(data.meetingId) &&
        uuidSchema.safeParse(data.meetingId).success;

      const customMeetingSelected =
        data.meetingId === CUSTOM_MEETING_OPTION;

      if (
        !officialMeetingSelected &&
        !customMeetingSelected
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Select a meeting or choose Meeting not listed.",
          path: ["meetingId"],
        });
      }

      if (
        customMeetingSelected &&
        (!data.customMeetingTitle ||
          data.customMeetingTitle.length < 2)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Enter the title of the meeting you are attending.",
          path: ["customMeetingTitle"],
        });
      }

      if (
        officialMeetingSelected &&
        data.customMeetingTitle
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Do not enter a custom title when an official meeting is selected.",
          path: ["customMeetingTitle"],
        });
      }

      if (data.personVisiting) {
        context.addIssue({
          code: "custom",
          message:
            "Person being visited is not required for a meeting.",
          path: ["personVisiting"],
        });
      }
    } else {
      if (
        !data.personVisiting ||
        data.personVisiting.length < 2
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Enter the name of the person you are visiting.",
          path: ["personVisiting"],
        });
      }

      if (data.meetingId || data.customMeetingTitle) {
        context.addIssue({
          code: "custom",
          message:
            "Meeting information can only be provided when the purpose is Meeting.",
          path: ["meetingId"],
        });
      }
    }
  })
  .transform((data) => {
    

    const customMeetingSelected =
      data.purpose === MEETING_PURPOSE &&
      data.meetingId === CUSTOM_MEETING_OPTION;

    return {
      ...data,
      division:
        data.agency === MINISTRY_OF_FINANCE_AGENCY
          ? data.division
          : undefined,
      fullName: `${data.firstName} ${data.lastName}`,
      meetingId:
  data.purpose === MEETING_PURPOSE
    ? data.meetingId
    : undefined,
      customMeetingTitle: customMeetingSelected
        ? data.customMeetingTitle
        : undefined,
      personVisiting:
        data.purpose === MEETING_PURPOSE
          ? undefined
          : data.personVisiting,
    };
  });