import { z } from "zod";
import {
  FLOOR_VALUES,
  WIFI_ACCESS_VALUES,
} from "../constants/visitorOptions.js";

// Wi-Fi requests and meeting floors. The visitor forms ask each
// visitor; the two meeting forms ask once for the whole meeting. The
// database repeats every rule.

export const VISITOR_WIFI_REQUIRED_MESSAGE =
  "Choose whether you need Wi-Fi access.";

export const MEETING_WIFI_REQUIRED_MESSAGE =
  "Choose whether the guests need Wi-Fi access.";

export const FLOOR_REQUIRED_MESSAGE =
  "Select the floor the meeting is on.";

// "" until the person chooses; required, but checked by the form's
// own rules so every message shows at once.
export const wifiAccessField = z
  .union([z.literal(""), z.enum(WIFI_ACCESS_VALUES)], {
    message: "Choose Yes or No for Wi-Fi access.",
  })
  .default("");

export const floorField = z
  .union([z.literal(""), z.enum(FLOOR_VALUES)], {
    message: FLOOR_REQUIRED_MESSAGE,
  })
  .default("");

export const WIFI_VIEWS = Object.freeze([
  "today",
  "upcoming",
  "history",
]);

export const WIFI_STATUSES = Object.freeze([
  "waiting",
  "given",
  "not_given",
]);

export const wifiListSchema = z
  .object({
    view: z.enum(WIFI_VIEWS).default("today"),
  })
  .strict();

export const wifiCountSchema = z.object({}).strict();

export const wifiUpdateSchema = z
  .object({
    id: z.uuid("A valid request identifier is required."),
    note: z
      .string()
      .trim()
      .max(300, "Keep the note to 300 characters or fewer.")
      .default(""),
    status: z.enum(WIFI_STATUSES, {
      message: "Choose Access given or Not given.",
    }),
    type: z.enum(["visit", "meeting"]),
  })
  .strict();

export const bookingWifiSchema = z
  .object({
    bookingId: z.uuid("A valid booking identifier is required."),
    wifiAccess: z.enum(WIFI_ACCESS_VALUES, {
      message: MEETING_WIFI_REQUIRED_MESSAGE,
    }),
  })
  .strict();

export const WIFI_DURATIONS = Object.freeze([
  "2h",
  "4h",
  "end_of_day",
  "meeting_end",
]);

export const WIFI_CHANNELS = Object.freeze(["sms", "email", "print"]);

const wifiEntry = {
  id: z.uuid("A valid request identifier is required."),
  tower: z.enum(["", "tower_1", "tower_2"]).default(""),
  type: z.enum(["visit", "meeting"]),
};

const channelsField = z
  .array(z.enum(WIFI_CHANNELS))
  .min(1, "Choose at least one way to send the details.")
  .max(3)
  .transform((channels) => [...new Set(channels)]);

export const wifiGrantSchema = z
  .object({
    ...wifiEntry,
    channels: channelsField,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "A valid date is required."),
    duration: z.enum(WIFI_DURATIONS, {
      message: "Choose how long access lasts.",
    }),
    note: z
      .string()
      .trim()
      .max(300, "Keep the note to 300 characters or fewer.")
      .default(""),
    password: z
      .string()
      .trim()
      .min(4, "Paste the password from the WiFi system.")
      .max(64, "The password cannot be longer than 64 characters."),
  })
  .strict();

export const wifiSecretSchema = z.object(wifiEntry).strict();

export const wifiResendSchema = z
  .object({ ...wifiEntry, channels: channelsField })
  .strict();
