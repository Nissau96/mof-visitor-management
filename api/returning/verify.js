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
import {
  VERIFIED_TOKEN_TTL_SECONDS,
  VISITOR_LOOKUP_AUDIENCE,
  createVerifiedVisitorToken,
  readVisitorToken,
} from "../_lib/visitorLookup.js";
import { returningVisitorVerificationSchema } from "../../src/validation/returningVisitor.js";

const GLOBAL_VERIFICATION_RATE_LIMIT = {
  limit: 20,
  scope: "returning-visitor-verification",
  windowSeconds: 10 * 60,
};

const VISITOR_VERIFICATION_RATE_LIMIT = {
  limit: 5,
  scope: "returning-visitor-verification-record",
  windowSeconds: 10 * 60,
};

function verificationFailed() {
  return json(
    {
      error:
        "The visitor record and mobile number could not be verified.",
    },
    400,
  );
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const requestBody = await readJsonBody(request);

      const parsed =
        returningVisitorVerificationSchema.safeParse(
          requestBody,
        );

      if (!parsed.success) {
        return verificationFailed();
      }

      await enforceRateLimit(
        request,
        GLOBAL_VERIFICATION_RATE_LIMIT,
      );

      let tokenData;

      try {
        tokenData = readVisitorToken(
          parsed.data.lookupToken,
          VISITOR_LOOKUP_AUDIENCE,
        );
      } catch {
        return verificationFailed();
      }

      await enforceRateLimit(request, {
        ...VISITOR_VERIFICATION_RATE_LIMIT,
        subject: tokenData.visitorId,
      });

      const { data, error } = await getAdminClient().rpc(
        "verify_returning_visitor",
        {
          p_phone: parsed.data.phone,
          p_visitor_id: tokenData.visitorId,
        },
      );

      if (error) {
        return json(
          {
            error:
              "The visitor record could not be verified. Please try again.",
          },
          500,
        );
      }

      const profile = data?.[0];

      if (!profile?.visitor_id) {
        return verificationFailed();
      }

      return json({
        expiresIn: VERIFIED_TOKEN_TTL_SECONDS,
        profile: {
          email: profile.email || "",
          fullName: profile.full_name,
          organization: profile.organization || "",
        },
        verificationToken: createVerifiedVisitorToken(
          profile.visitor_id,
        ),
      });
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        return json(
          {
            error:
              "Too many verification attempts. Please wait before trying again.",
          },
          429,
          {
            "Retry-After": String(error.retryAfterSeconds),
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
            "The visitor record could not be verified. Please try again.",
        },
        500,
      );
    }
  },
};