import { z } from "zod";

const PAGE_MAXIMUM = 10_000;
const PAGE_SIZE_MAXIMUM = 10;
const SEARCH_MAXIMUM = 80;

const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGE_MAXIMUM)
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGE_SIZE_MAXIMUM)
  .default(10);

const searchSchema = z
  .string()
  .trim()
  .max(
    SEARCH_MAXIMUM,
    "Search cannot exceed 80 characters.",
  )
  .default("");

const uuidSchema = (message) =>
  z
    .string()
    .trim()
    .uuid(message);

const optionalTowerSchema = z
  .enum([
    "",
    "tower_1",
    "tower_2",
  ])
  .default("");

const requiredTowerSchema = z.enum(
  [
    "tower_1",
    "tower_2",
  ],
  {
    message:
      "Select Tower 1 or Tower 2.",
  },
);

const cardTypeSchema = z.enum(
  [
    "regular",
    "vip",
  ],
  {
    message:
      "Select Regular or VIP card type.",
  },
);

const cardTypeFilterSchema = z
  .enum([
    "all",
    "regular",
    "vip",
  ])
  .default("all");

const notesSchema = (
  minimum,
  maximum,
  minimumMessage,
  maximumMessage,
) =>
  z
    .string()
    .trim()
    .min(
      minimum,
      minimumMessage,
    )
    .max(
      maximum,
      maximumMessage,
    );

export const pendingAdmissionListSchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      search: searchSchema,
      tower: optionalTowerSchema,
    })
    .strict();

export const availableVisitorCardSchema =
  z
    .object({
      cardType: cardTypeSchema,

      lastThreeDigits: z
        .string()
        .trim()
        .regex(
          /^\d{3}$/,
          "Enter exactly the last three card digits.",
        )
        .refine(
          (value) => value !== "000",
          "Enter a card number from 001 to 999.",
        ),

      tower: requiredTowerSchema,
    })
    .strict();

export const visitorAdmissionSchema = z
  .object({
    cardId: uuidSchema(
      "A valid visitor-card identifier is required.",
    ),

    tower: requiredTowerSchema,

    visitId: uuidSchema(
      "A valid visit identifier is required.",
    ),
  })
  .strict();

export const pendingAdmissionCancellationSchema =
  z
    .object({
      reason: notesSchema(
        5,
        500,
        "Enter a cancellation reason containing at least 5 characters.",
        "Cancellation reason cannot exceed 500 characters.",
      ),

      tower: requiredTowerSchema,

      visitId: uuidSchema(
        "A valid visit identifier is required.",
      ),
    })
    .strict();

export const checkedInCardVisitorListSchema =
  z
    .object({
      cardStatus: z
        .enum([
          "all",
          "assigned",
          "not_returned",
        ])
        .default("all"),

      page: pageSchema,
      pageSize: pageSizeSchema,
      search: searchSchema,
      tower: optionalTowerSchema,
    })
    .strict();

export const visitorCardNotReturnedSchema =
  z
    .object({
      tower: requiredTowerSchema,

      visitId: uuidSchema(
        "A valid visit identifier is required.",
      ),
    })
    .strict();

export const visitorCardIncidentListSchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,

      resolution: z
        .enum([
          "all",
          "late_return",
          "lost",
          "damaged",
          "unusable",
        ])
        .default("all"),

      search: searchSchema,

      status: z
        .enum([
          "all",
          "open",
          "investigating",
          "resolved",
        ])
        .default("all"),

      tower: optionalTowerSchema,
    })
    .strict();

export const visitorCardInvestigationSchema =
  z
    .object({
      incidentId: uuidSchema(
        "A valid visitor-card incident identifier is required.",
      ),

      notes: notesSchema(
        5,
        2_000,
        "Investigation notes must contain at least 5 characters.",
        "Investigation notes cannot exceed 2,000 characters.",
      ),

      tower: optionalTowerSchema,
    })
    .strict();

export const visitorCardIncidentResolutionSchema =
  z
    .object({
      incidentId: uuidSchema(
        "A valid visitor-card incident identifier is required.",
      ),

      notes: notesSchema(
        5,
        2_000,
        "Resolution notes must contain at least 5 characters.",
        "Resolution notes cannot exceed 2,000 characters.",
      ),

      resolution: z.enum(
        [
          "late_return",
          "lost",
          "damaged",
          "unusable",
        ],
        {
          message:
            "Select a valid visitor-card incident resolution.",
        },
      ),

      tower: optionalTowerSchema,
    })
    .strict();

export const visitorCardReprintSchema = z
  .object({
    cardId: uuidSchema(
      "A valid visitor-card identifier is required.",
    ),

    notes: notesSchema(
      5,
      1_000,
      "Reprint notes must contain at least 5 characters.",
      "Reprint notes cannot exceed 1,000 characters.",
    ),

    tower: optionalTowerSchema,
  })
  .strict();

export const adminVisitorCardInventorySchema =
  z
    .object({
      cardType:
        cardTypeFilterSchema,

      page: pageSchema,
      pageSize: pageSizeSchema,
      search: searchSchema,

      status: z
        .enum([
          "all",
          "available",
          "assigned",
          "not_returned",
          "investigating",
          "deactivated",
        ])
        .default("all"),

      tower: z
        .enum([
          "all",
          "tower_1",
          "tower_2",
        ])
        .default("all"),
    })
    .strict();

export const adminVisitorCardCreationSchema =
  z
    .object({
      cardType: cardTypeSchema,

      endNumber: z.coerce
        .number()
        .int()
        .min(
          1,
          "The ending card number must be at least 001.",
        )
        .max(
          999,
          "The ending card number cannot exceed 999.",
        ),

      startNumber: z.coerce
        .number()
        .int()
        .min(
          1,
          "The starting card number must be at least 001.",
        )
        .max(
          999,
          "The starting card number cannot exceed 999.",
        ),

      tower: requiredTowerSchema,
    })
    .strict()
    .superRefine(
      (
        values,
        context,
      ) => {
        if (
          values.endNumber <
          values.startNumber
        ) {
          context.addIssue({
            code: "custom",
            message:
              "The ending card number must not be before the starting number.",
            path: ["endNumber"],
          });

          return;
        }

        const numberOfCards =
          values.endNumber -
          values.startNumber +
          1;

        if (numberOfCards > 100) {
          context.addIssue({
            code: "custom",
            message:
              "A maximum of 100 visitor cards can be added at once.",
            path: ["endNumber"],
          });
        }
      },
    );

export const adminVisitorCardTowerSchema =
  z
    .object({
      cardId: uuidSchema(
        "A valid visitor-card identifier is required.",
      ),

      tower: requiredTowerSchema,
    })
    .strict();