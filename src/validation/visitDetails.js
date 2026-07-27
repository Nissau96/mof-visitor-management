import { z } from "zod";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_PURPOSES,
} from "../constants/visitorOptions.js";

const uuidSchema = z.uuid();

function normalizeText(value) {
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
      value ? normalizeText(value) : undefined,
    )
    .optional();
}

function isAllowedValue(values, value) {
  return values.includes(value);
}

export const visitDetailsShape = {
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
};

export function validateVisitDetails(data, context) {
  const validAgency = isAllowedValue(
    VISIT_AGENCIES,
    data.agency,
  );

  if (
    validAgency &&
    data.agency === MINISTRY_OF_FINANCE_AGENCY
  ) {
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
  } else if (
    validAgency &&
    data.agency !== MINISTRY_OF_FINANCE_AGENCY &&
    data.division
  ) {
    context.addIssue({
      code: "custom",
      message:
        "A Ministry division can only be selected when visiting the Ministry of Finance.",
      path: ["division"],
    });
  }

  if (!isAllowedValue(VISIT_PURPOSES, data.purpose)) {
    return;
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

    return;
  }

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

export function normalizeVisitDetails(data) {
  const attendingMeeting =
    data.purpose === MEETING_PURPOSE;

  const customMeetingSelected =
    attendingMeeting &&
    data.meetingId === CUSTOM_MEETING_OPTION;

  return {
    agency: data.agency,
    division:
      data.agency === MINISTRY_OF_FINANCE_AGENCY
        ? data.division
        : undefined,
    purpose: data.purpose,
    meetingId: attendingMeeting
      ? data.meetingId
      : undefined,
    customMeetingTitle: customMeetingSelected
      ? data.customMeetingTitle
      : undefined,
    personVisiting: attendingMeeting
      ? undefined
      : data.personVisiting,
  };
}