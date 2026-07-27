import { z } from "zod";

const emailAddressSchema = z.email();

export const staffLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(
      254,
      "Email address must not exceed 254 characters.",
    )
    .refine(
      (value) =>
        emailAddressSchema.safeParse(value).success,
      "Enter a valid email address.",
    )
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(1, "Enter your password.")
    .max(256, "Password is too long."),
});