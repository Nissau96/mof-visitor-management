import { z } from "zod";

const staffRoleSchema = z.enum([
  "receptionist",
  "admin",
]);

const statusFilterSchema = z.enum([
  "all",
  "active",
  "inactive",
]);

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
    status: statusFilterSchema.default("all"),
  })
  .strict();

export const adminStaffInviteSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address.")
      .max(
        254,
        "Email address cannot exceed 254 characters.",
      ),

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
  })
  .strict();

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

    userId: z
      .string()
      .trim()
      .uuid(
        "A valid staff user identifier is required.",
      ),
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