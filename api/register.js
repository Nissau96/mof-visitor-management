import { withAuditContext } from "./_lib/auditContext.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "./_lib/http.js";
import {
  RateLimitExceededError,
  enforceRateLimit,
} from "./_lib/rateLimit.js";
import { getAdminClient } from "./_lib/supabase.js";
import { PRIVACY_NOTICE_VERSION } from "../src/constants/privacy.js";
import { CUSTOM_MEETING_OPTION } from "../src/constants/visitorOptions.js";
import {
  clearWeeklyQrCookie,
  createWeeklyQrAccessUrl,
  createWeeklyQrCookie,
  getLocalVisitorApplicationUrl,
  readWeeklyQrAccess,
  validateWeeklyQrToken,
} from "../src/server/weeklyQrAccess.js";
import { visitorRegistrationSchema } from "../src/validation/visitorRegistration.js";
import { VISITOR_WIFI_REQUIRED_MESSAGE } from "../src/validation/wifiAccess.js";
import {
  inviteSubmitSchema,
  inviteTokenSchema,
} from "../src/validation/visitorInvites.js";
import { hashInviteToken } from "../src/server/visitorInviteToken.js";
import { notifyInviteBooked } from "../src/server/visitorInviteEmail.js";
import { wifiAccessToBoolean } from "../src/constants/visitorOptions.js";
import { hashFeedbackToken, isFeedbackToken } from "../src/server/visitFeedback.js";

export const REGISTRATION_RATE_LIMIT =
  Object.freeze({
    limit: 5,
    scope: "first-visit-registration",
    windowSeconds: 10 * 60,
  });

export const WEEKLY_ACCESS_RATE_LIMIT =
  Object.freeze({
    limit: 30,
    scope:
      "weekly-visitor-access-exchange",
    windowSeconds: 10 * 60,
  });

// Visitor booking links are opened away from the building, so they
// do not need the weekly QR access the kiosk forms need.
export const INVITE_VIEW_RATE_LIMIT = Object.freeze({
  limit: 60,
  scope: "visitor-invite-view",
  windowSeconds: 10 * 60,
});

export const INVITE_SUBMIT_RATE_LIMIT = Object.freeze({
  limit: REGISTRATION_RATE_LIMIT.limit,
  scope: "visitor-invite-submit",
  windowSeconds: REGISTRATION_RATE_LIMIT.windowSeconds,
});

const INVITE_INVALID = "This booking link is not valid. Ask your host for a new one.";
const INVITE_UNEXPECTED = "Your visit could not be booked. Please try again.";

function readInviteToken(body) {
  const parsed = inviteTokenSchema.safeParse(body?.token);

  if (!parsed.success) {
    throw new HttpError(INVITE_INVALID, 404);
  }

  return parsed.data;
}

async function viewInvite(request, { enforceRateLimitForRequest, getAdminClientForRequest }) {
  await enforceRateLimitForRequest(request, INVITE_VIEW_RATE_LIMIT);

  const token = readInviteToken(await readJsonBody(request));
  const { data, error } = await getAdminClientForRequest().rpc(
    "get_visitor_invite",
    { p_token_hash: hashInviteToken(token) },
  );

  if (error?.code === "P0002") {
    throw new HttpError(INVITE_INVALID, 404);
  }

  if (error || !data || typeof data !== "object") {
    throw new HttpError("This booking link could not be opened. Please try again.", 500);
  }

  return json({ invite: data }, 200);
}

async function submitInvite(
  request,
  { enforceRateLimitForRequest, getAdminClientForRequest, notifyBooked },
) {
  await enforceRateLimitForRequest(request, INVITE_SUBMIT_RATE_LIMIT);

  const parsed = inviteSubmitSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    const tokenIssue = parsed.error.issues.find((issue) => issue.path[0] === "token");

    throw new HttpError(
      tokenIssue
        ? INVITE_INVALID
        : parsed.error.issues[0]?.message || "Check the highlighted information and try again.",
      tokenIssue ? 404 : 400,
    );
  }

  const input = parsed.data;
  const { data, error } = await getAdminClientForRequest().rpc(
    "submit_visitor_invite",
    {
      p_consent_version: PRIVACY_NOTICE_VERSION,
      p_email: input.email || "",
      p_full_name: input.fullName,
      p_organization: input.organization || "",
      p_phone: input.phone,
      p_purpose: input.purpose,
      p_token_hash: hashInviteToken(input.token),
      p_visit_date: input.visitDate,
      p_wifi_requested: wifiAccessToBoolean(input.wifiAccess),
    },
  );

  if (error) {
    switch (error.code) {
      case "P0002":
        throw new HttpError(INVITE_INVALID, 404);
      case "55000":
        throw new HttpError(
          "This link has expired or was already used. Ask your host for a new one.",
          410,
        );
      case "22023":
        throw new HttpError(error.message || "Check your details and try again.", 400);
      default:
        throw new HttpError(INVITE_UNEXPECTED, 500);
    }
  }

  if (!data?.referenceCode) {
    throw new HttpError(INVITE_UNEXPECTED, 500);
  }

  let sent = { hostEmail: false, visitorEmail: false, visitorSms: false };

  try {
    sent = await notifyBooked(data);
  } catch {
    // The booking stands; the code is on screen.
  }

  return json(
    {
      booking: {
        agency: data.agency,
        division: data.division,
        floor: data.floor,
        hostName: data.hostName,
        referenceCode: data.referenceCode,
        tower: data.tower,
        visitDate: data.visitDate,
      },
      emailSent: sent.visitorEmail,
      smsSent: sent.visitorSms,
    },
    201,
  );
}

// Feedback links come by WhatsApp after check-out; the token in the link
// is the only key, so both operations are rate-limited per address.
export const FEEDBACK_RATE_LIMIT = Object.freeze({
  limit: 30,
  scope: "visit-feedback",
  windowSeconds: 10 * 60,
});

const FEEDBACK_INVALID = "This feedback link is not valid.";

async function readFeedbackRow(request, getAdminClientForRequest) {
  const body = await readJsonBody(request);

  if (!isFeedbackToken(body?.token)) {
    throw new HttpError(FEEDBACK_INVALID, 404);
  }

  const client = getAdminClientForRequest();
  const { data, error } = await client
    .from("visit_feedback")
    .select("visit_id, expires_at, submitted_at")
    .eq("token_hash", hashFeedbackToken(body.token))
    .maybeSingle();

  if (error) {
    throw new HttpError("This feedback link could not be opened. Please try again.", 500);
  }

  if (!data) {
    throw new HttpError(FEEDBACK_INVALID, 404);
  }

  return { body, client, row: data };
}

async function viewFeedback(request, { enforceRateLimitForRequest, getAdminClientForRequest }) {
  await enforceRateLimitForRequest(request, FEEDBACK_RATE_LIMIT);

  const { client, row } = await readFeedbackRow(request, getAdminClientForRequest);
  const { data: visit } = await client
    .from("visits")
    .select("reference_code, checked_out_at")
    .eq("id", row.visit_id)
    .maybeSingle();

  return json(
    {
      feedback: {
        checkedOutAt: visit?.checked_out_at || null,
        reference: visit?.reference_code || null,
        status: row.submitted_at
          ? "submitted"
          : new Date(row.expires_at) < new Date()
            ? "expired"
            : "open",
      },
    },
    200,
  );
}

async function submitFeedback(request, { enforceRateLimitForRequest, getAdminClientForRequest }) {
  await enforceRateLimitForRequest(request, FEEDBACK_RATE_LIMIT);

  const { body, client } = await readFeedbackRow(request, getAdminClientForRequest);
  const rating = Number(body?.rating);
  const comment = typeof body?.comment === "string" ? body.comment : "";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError("Choose a rating from 1 to 5 stars.", 400);
  }

  if (comment.length > 1000) {
    throw new HttpError("Keep the comment under 1000 characters.", 400);
  }

  const { error } = await client.rpc("submit_visit_feedback", {
    p_comment: comment,
    p_rating: rating,
    p_token_hash: hashFeedbackToken(body.token),
  });

  if (error?.code === "55000") {
    throw new HttpError("This feedback link was already used or has expired.", 410);
  }

  if (error?.code === "P0002") {
    throw new HttpError(FEEDBACK_INVALID, 404);
  }

  if (error) {
    throw new HttpError(
      error.code === "22023" ? error.message : "Your feedback could not be saved. Please try again.",
      error.code === "22023" ? 400 : 500,
    );
  }

  return json({ saved: true }, 201);
}

const INVITE_OPERATIONS = Object.freeze({
  "feedback-submit": submitFeedback,
  "feedback-view": viewFeedback,
  "invite-submit": submitInvite,
  "invite-view": viewInvite,
});

function invalidWeeklyAccess() {
  return json(
    {
      error:
        "The visitor QR code is invalid or has expired. Scan the current code at reception.",
    },
    401,
  );
}

// A reception kiosk asks for ?kiosk=1 to show this week's QR code.
// The device already holds the same token in its access cookie, so
// returning the link grants nothing new.
async function getWeeklyAccessStatus(request) {
  try {
    const access =
      await readWeeklyQrAccess(request);

    const kiosk =
      new URL(request.url).searchParams.get(
        "kiosk",
      ) === "1";

    return json(
      {
        access: {
          ...(kiosk
            ? {
                accessUrl:
                  createWeeklyQrAccessUrl(
                    access.token,
                    getLocalVisitorApplicationUrl(
                      request,
                    ),
                  ),
              }
            : {}),
          valid: true,
          validThrough:
            access.validThrough,
          weekEndsOn:
            access.weekEndsOn,
          weekStartsOn:
            access.weekStartsOn,
        },
      },
      200,
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status === 401
    ) {
      return invalidWeeklyAccess();
    }

    throw error;
  }
}

async function exchangeWeeklyAccess(
  request,
  enforceRateLimitForRequest,
) {
  await enforceRateLimitForRequest(
    request,
    WEEKLY_ACCESS_RATE_LIMIT,
  );

  const body =
    await readJsonBody(request);

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.token !== "string"
  ) {
    return invalidWeeklyAccess();
  }

  try {
    const access =
      validateWeeklyQrToken(body.token);

    return json(
      {
        access: {
          valid: true,
          validThrough:
            access.validThrough,
          weekEndsOn:
            access.weekEndsOn,
          weekStartsOn:
            access.weekStartsOn,
        },
      },
      200,
      {
        "Set-Cookie":
          createWeeklyQrCookie(
            request,
            access.token,
          ),
      },
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status === 401
    ) {
      return invalidWeeklyAccess();
    }

    throw error;
  }
}

async function registerVisitor(
  request,
  enforceRateLimitForRequest,
) {
  await readWeeklyQrAccess(request);

  await enforceRateLimitForRequest(
    request,
    REGISTRATION_RATE_LIMIT,
  );

  const requestBody =
    await readJsonBody(request);

  const parsed =
    visitorRegistrationSchema.safeParse(
      requestBody,
    );

  if (!parsed.success) {
    return json(
      {
        error:
          "Check the highlighted information and try again.",
      },
      400,
    );
  }

  const input = parsed.data;

  const { data, error } =
    await getAdminClient().rpc(
      "register_first_visit_with_wifi",
      {
        p_consent_version:
          PRIVACY_NOTICE_VERSION,
        p_custom_meeting_title:
          input.customMeetingTitle || "",
        p_destination_agency:
          input.agency,
        p_destination_division:
          input.division || "",
        p_email: input.email || "",
        p_full_name: input.fullName,
        p_guests: input.guests.map(
          (guest) => ({
            fullName: guest.fullName,
            phone: guest.phone,
          }),
        ),
        p_meeting_id:
          input.meetingId ===
          CUSTOM_MEETING_OPTION
            ? null
            : input.meetingId || null,
        p_organization:
          input.organization || "",
        p_person_visiting:
          input.personVisiting || "",
        p_phone: input.phone,
        p_purpose: input.purpose,
        p_wifi_requested:
          input.wifiRequested ?? null,
      },
    );

  const guestConflict =
    /^GUEST_ALREADY_CHECKED_IN:(\d+)$/.exec(
      error?.message || "",
    );

  if (guestConflict) {
    return json(
      {
        error: `Guest ${guestConflict[1]} is already checked in. Remove them from this registration or ask reception for help.`,
      },
      409,
    );
  }

  // The visitor skipped the question because they thought their
  // meeting covered Wi-Fi, but it no longer does.
  if (error?.message === VISITOR_WIFI_REQUIRED_MESSAGE) {
    return json(
      {
        error:
          "Choose whether you need Wi-Fi access, then submit again.",
      },
      400,
    );
  }

  // The meeting is no longer on, or is hosted by another agency.
  if (error?.message === "Meeting is unavailable") {
    return json(
      {
        error:
          "The selected meeting is not available for this agency. Choose the meeting again.",
      },
      400,
    );
  }

  if (error?.code === "23505") {
    return json(
      {
        error:
          "Registration could not be completed with these details. If you have visited before, use the returning visitor option.",
      },
      409,
    );
  }

  if (error) {
    return json(
      {
        error:
          "Registration could not be completed. Please try again.",
      },
      500,
    );
  }

  const result = data?.[0];

  if (!result?.reference_code) {
    return json(
      {
        error:
          "Registration could not be completed. Please try again.",
      },
      500,
    );
  }

  return json(
    {
      guestCount:
        result.guest_count ?? 0,
      reference: result.reference_code,
    },
    201,
  );
}

export function createRegisterHandler({
  enforceRateLimitForRequest =
    enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
  notifyBooked = notifyInviteBooked,
} = {}) {
  return {
    async fetch(request) {
      const inviteOperation =
        INVITE_OPERATIONS[
          new URL(request.url).searchParams.get("operation") || ""
        ];

      if (inviteOperation) {
        if (request.method !== "POST") {
          return methodNotAllowed(["POST"]);
        }

        try {
          return await inviteOperation(request, {
            enforceRateLimitForRequest,
            getAdminClientForRequest,
            notifyBooked,
          });
        } catch (error) {
          if (error instanceof RateLimitExceededError) {
            return json(
              { error: "Too many attempts. Please wait before trying again." },
              429,
              { "Retry-After": String(error.retryAfterSeconds) },
            );
          }

          if (error instanceof HttpError) {
            return json({ error: error.message }, error.status);
          }

          return json({ error: INVITE_UNEXPECTED }, 500);
        }
      }

      if (
        ![
          "GET",
          "POST",
          "PUT",
          "DELETE",
        ].includes(request.method)
      ) {
        return methodNotAllowed([
          "GET",
          "POST",
          "PUT",
          "DELETE",
        ]);
      }

      try {
        if (request.method === "GET") {
          return await getWeeklyAccessStatus(
            request,
          );
        }

        if (
          request.method === "DELETE"
        ) {
          return json(
            {
              access: {
                valid: false,
              },
            },
            200,
            {
              "Set-Cookie":
                clearWeeklyQrCookie(
                  request,
                ),
            },
          );
        }

        if (request.method === "PUT") {
          return await exchangeWeeklyAccess(
            request,
            enforceRateLimitForRequest,
          );
        }

        return await registerVisitor(
          request,
          enforceRateLimitForRequest,
        );
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          const accessExchange =
            request.method === "PUT";

          return json(
            {
              error: accessExchange
                ? "Too many visitor-access attempts. Please wait before scanning the QR code again."
                : "Too many registration attempts. Please wait before trying again.",
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
          );
        }

        return json(
          {
            error:
              request.method === "PUT" ||
              request.method === "GET"
                ? "Visitor access could not be verified. Please try again."
                : "Registration could not be completed. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default withAuditContext(createRegisterHandler());