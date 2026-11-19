import { z } from "zod";

const staffRoleSchema = z.enum([
  "receptionist",
  "client_service_head",
  "it_network_admin",
  "admin",
]);

const statusFilterSchema = z.enum([
  "all",
  "active",
  "inactive",
]);

const staffUserIdSchema = z
  .string()
  .trim()
  .uuid(
    "A valid staff user identifier is required.",
  );

const staffEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(
    254,
    "Email address cannot exceed 254 characters.",
  );

const optionalUuidSchema = z
  .union([
    z.literal(""),
    z.string().trim().uuid(
      "A valid record identifier is required.",
    ),
    z.null(),
  ])
  .optional()
  .transform((value) => value || null);

const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(10_000)
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(10)
  .default(10);

const staffSignInMethodSchema = z.enum([
  "microsoft",
  "password",
]);

// The end date is the day access stops, at 00:00 Accra (UTC+0). It
// must be after today, so a new date never cuts someone off at once.
const staffAccessEndDateSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Enter the date access ends.",
      )
      .refine(
        (value) =>
          !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
          value > new Date().toISOString().slice(0, 10),
        "Choose a date after today.",
      ),
    z.null(),
  ])
  .optional()
  .transform((value) =>
    value === undefined ? undefined : value || null,
  );

// Password accounts other than an administrator (the emergency
// account) are Intern/NSP accounts, whose access must end on a set date.
function requireInternEndDate(value, context) {
  if (
    value.signInMethod === "password" &&
    value.role !== "admin" &&
    !value.accessEndDate
  ) {
    context.addIssue({
      code: "custom",
      message: "Choose the date this Intern/NSP account's access ends.",
      path: ["accessEndDate"],
    });
  }
}

export function accessEndDateToTimestamp(accessEndDate) {
  return accessEndDate
    ? `${accessEndDate}T00:00:00.000Z`
    : null;
}

export const adminHostListSchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: z
      .string()
      .trim()
      .max(
        80,
        "Host search cannot exceed 80 characters.",
      )
      .default(""),
    status: statusFilterSchema.default("all"),
  })
  .strict();

export const adminHostSaveSchema = z
  .object({
    active: z.boolean(),

    department: z
      .string()
      .trim()
      .min(
        2,
        "Department must contain at least 2 characters.",
      )
      .max(
        120,
        "Department cannot exceed 120 characters.",
      ),

    fullName: z
      .string()
      .trim()
      .min(
        2,
        "Host name must contain at least 2 characters.",
      )
      .max(
        120,
        "Host name cannot exceed 120 characters.",
      ),

    hostId: optionalUuidSchema,
  })
  .strict();

export const adminStaffListSchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    role: z
      .enum([
        "all",
        "receptionist",
        "client_service_head",
        "it_network_admin",
        "admin",
      ])
      .default("all"),
    search: z
      .string()
      .trim()
      .max(
        120,
        "Staff search cannot exceed 120 characters.",
      )
      .default(""),
    status: z
      .enum([
        "all",
        "active",
        "inactive",
        "setup_pending",
        "setup_expired",
      ])
      .default("all"),
  })
  .strict();

export const adminStaffInviteSchema = z
  .object({
    email: staffEmailSchema,

    fullName: z
      .string()
      .trim()
      .min(
        2,
        "Staff name must contain at least 2 characters.",
      )
      .max(
        120,
        "Staff name cannot exceed 120 characters.",
      ),

    role: staffRoleSchema,

    accessEndDate: staffAccessEndDateSchema,
    signInMethod:
      staffSignInMethodSchema.optional(),
  })
  .strict()
  .superRefine(requireInternEndDate);

export const adminStaffUpdateSchema = z
  .object({
    active: z.boolean(),

    fullName: z
      .string()
      .trim()
      .min(
        2,
        "Staff name must contain at least 2 characters.",
      )
      .max(
        120,
        "Staff name cannot exceed 120 characters.",
      ),

    role: staffRoleSchema,

    userId: staffUserIdSchema,

    accessEndDate: staffAccessEndDateSchema,
    signInMethod:
      staffSignInMethodSchema.optional(),
  })
  .strict()
  .superRefine(requireInternEndDate);

export const adminStaffPasswordReissueSchema =
  z
    .object({
      userId: staffUserIdSchema,
    })
    .strict();

export const adminStaffDeleteSchema = z
  .object({
    confirmationEmail: staffEmailSchema,
    userId: staffUserIdSchema,
  })
  .strict();

export const staffPasswordSetupSchema = z
  .object({
    confirmPassword: z
      .string()
      .min(
        12,
        "Password must contain at least 12 characters.",
      )
      .max(
        128,
        "Password cannot exceed 128 characters.",
      ),

    password: z
      .string()
      .min(
        12,
        "Password must contain at least 12 characters.",
      )
      .max(
        128,
        "Password cannot exceed 128 characters.",
      )
      .regex(
        /[a-z]/,
        "Password must contain a lowercase letter.",
      )
      .regex(
        /[A-Z]/,
        "Password must contain an uppercase letter.",
      )
      .regex(
        /\d/,
        "Password must contain a number.",
      )
      .regex(
        /[^A-Za-z0-9]/,
        "Password must contain a symbol.",
      ),
  })
  .strict()
  .refine(
    (values) =>
      values.password ===
      values.confirmPassword,
    {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    },
  );