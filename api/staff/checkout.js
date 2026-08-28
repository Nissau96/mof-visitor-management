import {
  requireActiveStaff,
  requireStaffTowerScope,
} from "../_lib/staffAuth.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import {
  RateLimitExceededError,
  enforceRateLimit,
} from "../_lib/rateLimit.js";
import { getAdminClient } from "../_lib/supabase.js";
import { staffVisitCheckoutSchema } from "../../src/validation/staffVisits.js";
import {
  availableVisitorCardSchema,
  checkedInCardVisitorListSchema,
  pendingAdmissionCancellationSchema,
  pendingAdmissionListSchema,
  visitorAdmissionSchema,
  visitorCardIncidentListSchema,
  visitorCardIncidentResolutionSchema,
  visitorCardInvestigationSchema,
  visitorCardNotReturnedSchema,
  visitorCardReprintSchema,
} from "../../src/validation/visitorCards.js";

const RECEPTION_OPERATION_ROLES = Object.freeze([
  "receptionist",
  "admin",
]);

const INCIDENT_VIEW_ROLES = Object.freeze([
  "receptionist",
  "client_service_head",
  "admin",
]);

const INCIDENT_MANAGEMENT_ROLES = Object.freeze([
  "client_service_head",
  "admin",
]);

const OPERATION_BY_PATH = new Map([
  [
    "/api/staff/cards/pending",
    "pending-list",
  ],
  [
    "/api/staff/cards/search",
    "card-search",
  ],
  [
    "/api/staff/cards/admit",
    "admission",
  ],
  [
    "/api/staff/cards/cancel",
    "admission-cancel",
  ],
  [
    "/api/staff/cards/checked-in",
    "checked-in-list",
  ],
  [
    "/api/staff/checkout",
    "checkout",
  ],
  [
    "/api/staff/cards/report-not-returned",
    "report-not-returned",
  ],
  [
    "/api/staff/cards/incidents",
    "incident-list",
  ],
  [
    "/api/staff/cards/incidents/start",
    "incident-start",
  ],
  [
    "/api/staff/cards/incidents/resolve",
    "incident-resolve",
  ],
  [
    "/api/staff/cards/reprint",
    "card-reprint",
  ],
]);

export const STAFF_CHECKOUT_RATE_LIMIT =
  Object.freeze({
    limit: 120,
    scope: "staff-visitor-checkout",
    windowSeconds: 10 * 60,
  });

export const STAFF_VISITOR_CARD_WRITE_RATE_LIMITS =
  Object.freeze({
    admission: Object.freeze({
      limit: 120,
      scope: "staff-visitor-card-admission",
      windowSeconds: 10 * 60,
    }),

    "admission-cancel": Object.freeze({
      limit: 60,
      scope:
        "staff-visitor-card-admission-cancel",
      windowSeconds: 10 * 60,
    }),

    "card-reprint": Object.freeze({
      limit: 30,
      scope: "staff-visitor-card-reprint",
      windowSeconds: 10 * 60,
    }),

    checkout: STAFF_CHECKOUT_RATE_LIMIT,

    "incident-resolve": Object.freeze({
      limit: 30,
      scope:
        "staff-visitor-card-incident-resolve",
      windowSeconds: 10 * 60,
    }),

    "incident-start": Object.freeze({
      limit: 30,
      scope:
        "staff-visitor-card-incident-start",
      windowSeconds: 10 * 60,
    }),

    "report-not-returned": Object.freeze({
      limit: 60,
      scope:
        "staff-visitor-card-report-not-returned",
      windowSeconds: 10 * 60,
    }),
  });

const INVALID_DATABASE_ERROR_CODES =
  new Set([
    "22023",
    "22P02",
    "23514",
  ]);

const OPERATION_MESSAGES = Object.freeze({
  admission: Object.freeze({
    conflict:
      "The visitor could not be admitted with this card.",
    invalid:
      "The visitor admission request is invalid.",
    notFound:
      "The visitor or visitor card could not be found.",
    unexpected:
      "Visitor admission could not be completed. Please try again.",
  }),

  "admission-cancel": Object.freeze({
    conflict:
      "This pending admission can no longer be cancelled.",
    invalid:
      "The admission cancellation request is invalid.",
    notFound:
      "The pending admission could not be found.",
    unexpected:
      "The pending admission could not be cancelled. Please try again.",
  }),

  "card-reprint": Object.freeze({
    conflict:
      "A replacement cannot be registered for this visitor card.",
    invalid:
      "The visitor-card replacement request is invalid.",
    notFound:
      "The deactivated visitor card could not be found.",
    unexpected:
      "The replacement visitor card could not be registered. Please try again.",
  }),

  "card-search": Object.freeze({
    conflict:
      "The visitor card is not currently available.",
    invalid:
      "Enter valid visitor-card details.",
    notFound:
      "No available visitor card matched the supplied details.",
    unexpected:
      "Available visitor cards could not be searched. Please try again.",
  }),

  "checked-in-list": Object.freeze({
    invalid:
      "The checked-in visitor filters are invalid.",
    unexpected:
      "Checked-in visitors could not be loaded. Please try again.",
  }),

  checkout: Object.freeze({
    conflict:
      "This visitor cannot be checked out until the visitor-card issue is resolved.",
    invalid:
      "The check-out request is invalid.",
    notFound:
      "The visit could not be found.",
    unexpected:
      "Check-out could not be completed. Please try again.",
  }),

  "incident-list": Object.freeze({
    invalid:
      "The visitor-card incident filters are invalid.",
    unexpected:
      "Visitor-card incidents could not be loaded. Please try again.",
  }),

  "incident-resolve": Object.freeze({
    conflict:
      "This visitor-card incident cannot be resolved in its current state.",
    invalid:
      "The incident resolution request is invalid.",
    notFound:
      "The visitor-card incident could not be found.",
    unexpected:
      "The visitor-card incident could not be resolved. Please try again.",
  }),

  "incident-start": Object.freeze({
    conflict:
      "This visitor-card investigation cannot be started in its current state.",
    invalid:
      "The investigation request is invalid.",
    notFound:
      "The visitor-card incident could not be found.",
    unexpected:
      "The visitor-card investigation could not be started. Please try again.",
  }),

  "pending-list": Object.freeze({
    invalid:
      "The pending admission filters are invalid.",
    unexpected:
      "Pending admissions could not be loaded. Please try again.",
  }),

  "report-not-returned": Object.freeze({
    conflict:
      "This visitor card cannot be reported as not returned in its current state.",
    invalid:
      "The visitor-card report is invalid.",
    notFound:
      "The checked-in visit could not be found.",
    unexpected:
      "The visitor card could not be reported as not returned. Please try again.",
  }),
});

function getOperation(request) {
  const url = new URL(request.url);

  const configuredOperation =
    url.searchParams.get("operation") || "";

  if (configuredOperation) {
    return configuredOperation;
  }

  const pathname =
    url.pathname.length > 1
      ? url.pathname.replace(/\/+$/, "")
      : url.pathname;

  return OPERATION_BY_PATH.get(pathname) || "";
}

function getOperationMessages(operation) {
  return (
    OPERATION_MESSAGES[operation] || {
      conflict:
        "The visitor-card operation cannot be completed in its current state.",
      invalid:
        "The visitor-card request is invalid.",
      notFound:
        "The requested visitor-card record could not be found.",
      unexpected:
        "The visitor-card request could not be completed. Please try again.",
    }
  );
}

function getVisitorCardDatabaseError(
  operation,
  error,
) {
  const messages =
    getOperationMessages(operation);

  if (error?.code === "P0002") {
    return new HttpError(
      messages.notFound ||
        "The requested record could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "You do not have permission to perform this visitor-card operation.",
      403,
    );
  }

  if (
    error?.code === "55000" ||
    error?.code === "23505"
  ) {
    return new HttpError(
      messages.conflict ||
        "The visitor-card operation conflicts with its current state.",
      409,
    );
  }

  if (
    INVALID_DATABASE_ERROR_CODES.has(
      error?.code,
    )
  ) {
    return new HttpError(
      messages.invalid,
      400,
    );
  }

  return new HttpError(
    messages.unexpected,
    500,
  );
}

function isObjectResult(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function validateResult(
  operation,
  data,
) {
  if (!isObjectResult(data)) {
    return false;
  }

  switch (operation) {
    case "pending-list":
      return (
        Array.isArray(data.admissions) &&
        isObjectResult(data.pagination) &&
        isObjectResult(data.scope)
      );

    case "card-search":
      return (
        Array.isArray(data.cards) &&
        typeof data.cardType === "string" &&
        typeof data.tower === "string"
      );

    case "admission":
      return (
        data.admitted === true &&
        isObjectResult(data.visit) &&
        isObjectResult(
          data.cardAssignment,
        )
      );

    case "admission-cancel":
      return (
        data.admissionCancelled === true &&
        typeof data.visitId === "string" &&
        data.status === "cancelled"
      );

    case "checked-in-list":
      return (
        Array.isArray(data.visitors) &&
        isObjectResult(data.pagination) &&
        isObjectResult(data.filters) &&
        isObjectResult(data.scope)
      );

    case "checkout":
      return (
        typeof data.visitId === "string" &&
        typeof data.reference === "string" &&
        typeof data.tower === "string" &&
        data.status === "checked_out" &&
        typeof data.checkedOutAt ===
          "string"
      );

    case "report-not-returned":
      return (
        data.reportedNotReturned === true &&
        typeof data.incidentId ===
          "string" &&
        typeof data.visitId === "string"
      );

    case "incident-list":
      return (
        Array.isArray(data.incidents) &&
        isObjectResult(data.pagination) &&
        isObjectResult(data.summary) &&
        isObjectResult(data.filters) &&
        isObjectResult(data.scope)
      );

    case "incident-start":
      return (
        data.investigationStarted === true &&
        typeof data.incidentId ===
          "string"
      );

    case "incident-resolve":
      return (
        data.incidentResolved === true &&
        typeof data.incidentId ===
          "string" &&
        typeof data.resolution ===
          "string"
      );

    case "card-reprint":
      return (
        data.replacementRegistered ===
          true &&
        typeof data.oldCardNumber ===
          "string" &&
        isObjectResult(
          data.replacementCard,
        )
      );

    default:
      return false;
  }
}

function getOperationConfiguration(operation) {
  switch (operation) {
    case "pending-list":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName:
          "get_pending_visitor_admissions",
        schema: pendingAdmissionListSchema,
      };

    case "card-search":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName:
          "get_available_visitor_cards",
        schema:
          availableVisitorCardSchema,
      };

    case "admission":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName:
          "admit_visitor_with_card",
        schema: visitorAdmissionSchema,
      };

    case "admission-cancel":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName:
          "cancel_pending_visitor_admission",
        schema:
          pendingAdmissionCancellationSchema,
      };

    case "checked-in-list":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName:
          "get_checked_in_card_visitors",
        schema:
          checkedInCardVisitorListSchema,
      };

    case "checkout":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName: "checkout_visit",
        schema: staffVisitCheckoutSchema,
      };

    case "report-not-returned":
      return {
        allowedRoles:
          RECEPTION_OPERATION_ROLES,
        rpcName:
          "report_visitor_card_not_returned",
        schema:
          visitorCardNotReturnedSchema,
      };

    case "incident-list":
      return {
        allowedRoles: INCIDENT_VIEW_ROLES,
        rpcName:
          "get_visitor_card_incidents",
        schema:
          visitorCardIncidentListSchema,
      };

    case "incident-start":
      return {
        allowedRoles:
          INCIDENT_MANAGEMENT_ROLES,
        rpcName:
          "start_visitor_card_incident_investigation",
        schema:
          visitorCardInvestigationSchema,
      };

    case "incident-resolve":
      return {
        allowedRoles:
          INCIDENT_MANAGEMENT_ROLES,
        rpcName:
          "resolve_visitor_card_incident",
        schema:
          visitorCardIncidentResolutionSchema,
      };

    case "card-reprint":
      return {
        allowedRoles:
          INCIDENT_MANAGEMENT_ROLES,
        rpcName:
          "reprint_deactivated_visitor_card",
        schema:
          visitorCardReprintSchema,
      };

    default:
      return null;
  }
}

function createRpcArguments(
  operation,
  values,
  profile,
  towerScope,
) {
  const actorId = profile.userId;

  switch (operation) {
    case "pending-list":
      return {
        p_actor_id: actorId,
        p_page: values.page,
        p_page_size: values.pageSize,
        p_search: values.search,
        p_tower: towerScope,
      };

    case "card-search":
      return {
        p_actor_id: actorId,
        p_card_type: values.cardType,
        p_last_three_digits:
          values.lastThreeDigits,
        p_tower: towerScope,
      };

    case "admission":
      return {
        p_actor_id: actorId,
        p_card_id: values.cardId,
        p_tower: towerScope,
        p_visit_id: values.visitId,
      };

    case "admission-cancel":
      return {
        p_actor_id: actorId,
        p_reason: values.reason,
        p_tower: towerScope,
        p_visit_id: values.visitId,
      };

    case "checked-in-list":
      return {
        p_actor_id: actorId,
        p_card_status:
          values.cardStatus,
        p_page: values.page,
        p_page_size: values.pageSize,
        p_search: values.search,
        p_tower: towerScope,
      };

    case "checkout":
      return {
        p_actor_id: actorId,
        p_tower: towerScope,
        p_visit_id: values.visitId,
      };

    case "report-not-returned":
      return {
        p_actor_id: actorId,
        p_tower: towerScope,
        p_visit_id: values.visitId,
      };

    case "incident-list":
      return {
        p_actor_id: actorId,
        p_page: values.page,
        p_page_size: values.pageSize,
        p_resolution: values.resolution,
        p_search: values.search,
        p_status: values.status,
        p_tower: towerScope,
      };

    case "incident-start":
      return {
        p_actor_id: actorId,
        p_incident_id:
          values.incidentId,
        p_notes: values.notes,
        p_tower: towerScope,
      };

    case "incident-resolve":
      return {
        p_actor_id: actorId,
        p_incident_id:
          values.incidentId,
        p_notes: values.notes,
        p_resolution:
          values.resolution,
        p_tower: towerScope,
      };

    case "card-reprint":
      return {
        p_actor_id: actorId,
        p_card_id: values.cardId,
        p_notes: values.notes,
        p_tower: towerScope,
      };

    default:
      throw new HttpError(
        "Visitor-card operation not found.",
        404,
      );
  }
}

function createSuccessResponse(
  operation,
  data,
) {
  if (operation !== "checkout") {
    return json(data, 200);
  }

  return json(
    {
      checkout: {
        alreadyCheckedOut: Boolean(
          data.alreadyCheckedOut,
        ),
        checkedOutAt:
          data.checkedOutAt,
        reference: data.reference,
        status: data.status,
        tower: data.tower,
        visitId: data.visitId,
      },
    },
    200,
  );
}

async function enforceOperationRateLimit(
  operation,
  request,
  profile,
  enforceRateLimitForRequest,
) {
  const configuration =
    STAFF_VISITOR_CARD_WRITE_RATE_LIMITS[
      operation
    ];

  if (!configuration) {
    return;
  }

  await enforceRateLimitForRequest(
    request,
    {
      ...configuration,
      keyMode: "subject",
      subject: profile.userId,
    },
  );
}

export function createCheckoutHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
  requireActiveStaffForRequest =
    requireActiveStaff,
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const operation =
        getOperation(request);

      const configuration =
        getOperationConfiguration(
          operation,
        );

      if (!configuration) {
        return json(
          {
            error:
              "Visitor-card operation not found.",
          },
          404,
        );
      }

      try {
        const { profile } =
          await requireActiveStaffForRequest(
            request,
            configuration.allowedRoles,
          );

        await enforceOperationRateLimit(
          operation,
          request,
          profile,
          enforceRateLimitForRequest,
        );

        const body =
          await readJsonBody(request);

        const parsed =
          configuration.schema.safeParse(
            body,
          );

        if (!parsed.success) {
          throw new HttpError(
            getOperationMessages(
              operation,
            ).invalid,
            400,
          );
        }

        const towerScope =
          requireStaffTowerScope(
            profile,
            parsed.data.tower,
          );

        const rpcArguments =
          createRpcArguments(
            operation,
            parsed.data,
            profile,
            towerScope,
          );

        const { data, error } =
          await getAdminClientForRequest().rpc(
            configuration.rpcName,
            rpcArguments,
          );

        if (error) {
          throw getVisitorCardDatabaseError(
            operation,
            error,
          );
        }

        if (
          !validateResult(
            operation,
            data,
          )
        ) {
          throw new HttpError(
            getOperationMessages(
              operation,
            ).unexpected,
            500,
          );
        }

        return createSuccessResponse(
          operation,
          data,
        );
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          return json(
            {
              error:
                "Too many visitor-card changes. Please wait before trying again.",
            },
            429,
            {
              "Retry-After": String(
                error.retryAfterSeconds,
              ),
            },
          );
        }

        if (error instanceof HttpError) {
          return json(
            {
              error: error.message,
            },
            error.status,
            error.status === 401
              ? {
                  "WWW-Authenticate":
                    "Bearer",
                }
              : {},
          );
        }

        return json(
          {
            error:
              getOperationMessages(
                operation,
              ).unexpected,
          },
          500,
        );
      }
    },
  };
}

export default createCheckoutHandler();