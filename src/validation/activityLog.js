import { z } from "zod";

// Filters for the admin Activity Log (get_activity_log).

export const ACTIVITY_CATEGORIES = Object.freeze([
  "visitor",
  "card",
  "meeting",
  "wifi",
  "link",
  "settings",
  "export",
  "signin",
  "kiosk",
  "system",
  "sensitive",
]);

export const ACTIVITY_ROLES = Object.freeze([
  "admin",
  "receptionist",
  "client_service_head",
  "it_network_admin",
  "booker",
  "visitor",
  "staff",
  "system",
]);

export const ACTIVITY_EXPORT_LIMIT = 5000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalDate = z
  .union([z.literal(""), z.null(), z.string().regex(DATE, "Enter a valid date.")])
  .optional()
  .transform((value) => value || null);

export const activityLogSchema = z
  .object({
    category: z.union([z.literal(""), z.enum(ACTIVITY_CATEGORIES)]).default(""),
    dateFrom: optionalDate,
    dateTo: optionalDate,
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(10).default(10),
    result: z.enum(["", "success", "failed"]).default(""),
    role: z.union([z.literal(""), z.enum(ACTIVITY_ROLES)]).default(""),
    search: z.string().trim().max(80, "Search cannot exceed 80 characters.").default(""),
    tower: z.enum(["", "tower_1", "tower_2", "none"]).default(""),
    userId: z.union([z.literal(""), z.string().uuid()]).default(""),
  })
  .strict()
  .refine(
    (values) => !(values.dateFrom && values.dateTo && values.dateFrom > values.dateTo),
    { message: "The end date is before the start date.", path: ["dateTo"] },
  );
