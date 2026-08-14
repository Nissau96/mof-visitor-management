import assert from "node:assert/strict";
import process from "node:process";
import {
  ADMIN_WRITE_RATE_LIMITS,
  createAdminHandler,
  enforceAdminWriteRateLimit,
} from "../api/admin.js";
import {
  STAFF_CHECKOUT_RATE_LIMIT,
  createCheckoutHandler,
} from "../api/staff/checkout.js";
import {
  RateLimitExceededError,
} from "../api/_lib/rateLimit.js";
import {
  createPrivateRequestKey,
} from "../api/_lib/visitorLookup.js";
import {
  VISITOR_VERIFICATION_RATE_LIMIT,
} from "../api/returning/verify.js";

process.env.VISITOR_LOOKUP_SECRET =
  "authenticated-rate-limit-test-secret-longer-than-thirty-two-bytes";

const userId =
  "00000000-0000-4000-8000-000000000008";

const otherUserId =
  "00000000-0000-4000-8000-000000000009";

assert.deepEqual(
  ADMIN_WRITE_RATE_LIMITS[
    "host-save"
  ],
  {
    limit: 60,
    scope: "admin-host-save",
    windowSeconds: 10 * 60,
  },
);

assert.deepEqual(
  ADMIN_WRITE_RATE_LIMITS[
    "staff-invite"
  ],
  {
    limit: 20,
    scope: "admin-staff-invite",
    windowSeconds: 60 * 60,
  },
);

assert.deepEqual(
  ADMIN_WRITE_RATE_LIMITS[
    "staff-update"
  ],
  {
    limit: 30,
    scope: "admin-staff-update",
    windowSeconds: 10 * 60,
  },
);

assert.deepEqual(
  STAFF_CHECKOUT_RATE_LIMIT,
  {
    limit: 120,
    scope: "staff-visitor-checkout",
    windowSeconds: 10 * 60,
  },
);

assert.deepEqual(
  VISITOR_VERIFICATION_RATE_LIMIT,
  {
    keyMode: "subject",
    limit: 5,
    scope:
      "returning-visitor-verification-record",
    windowSeconds: 10 * 60,
  },
);

const firstAddressRequest =
  new Request(
    "http://localhost/api/admin",
    {
      headers: {
        "X-Vercel-Forwarded-For":
          "203.0.113.20",
      },
    },
  );

const secondAddressRequest =
  new Request(
    "http://localhost/api/admin",
    {
      headers: {
        "X-Vercel-Forwarded-For":
          "203.0.113.21",
      },
    },
  );

const firstSubjectKey =
  createPrivateRequestKey(
    firstAddressRequest,
    "admin-host-save",
    userId,
    "subject",
  );

const secondSubjectKey =
  createPrivateRequestKey(
    secondAddressRequest,
    "admin-host-save",
    userId,
    "subject",
  );

const otherSubjectKey =
  createPrivateRequestKey(
    firstAddressRequest,
    "admin-host-save",
    otherUserId,
    "subject",
  );

assert.equal(
  firstSubjectKey,
  secondSubjectKey,
);

assert.notEqual(
  firstSubjectKey,
  otherSubjectKey,
);

const firstClientKey =
  createPrivateRequestKey(
    firstAddressRequest,
    "public-host-directory",
  );

const secondClientKey =
  createPrivateRequestKey(
    secondAddressRequest,
    "public-host-directory",
  );

assert.notEqual(
  firstClientKey,
  secondClientKey,
);

assert.throws(
  () =>
    createPrivateRequestKey(
      firstAddressRequest,
      "admin-host-save",
      "",
      "subject",
    ),
  /subject is required/i,
);

let adminRateLimitChecks = 0;

await enforceAdminWriteRateLimit(
  firstAddressRequest,
  "staff-invite",
  userId,
  async (request, configuration) => {
    assert.equal(
      request,
      firstAddressRequest,
    );

    assert.deepEqual(
      configuration,
      {
        keyMode: "subject",
        limit: 20,
        scope: "admin-staff-invite",
        subject: userId,
        windowSeconds: 60 * 60,
      },
    );

    adminRateLimitChecks += 1;
  },
);

assert.equal(
  adminRateLimitChecks,
  1,
);

await enforceAdminWriteRateLimit(
  firstAddressRequest,
  "host-list",
  userId,
  async () => {
    adminRateLimitChecks += 1;
  },
);

assert.equal(
  adminRateLimitChecks,
  1,
);

const rateLimitedAdminHandler =
  createAdminHandler({
    operationHandlers: new Map([
      [
        "host-save",
        async () => {
          throw new RateLimitExceededError(
            10 * 60,
          );
        },
      ],
    ]),
  });

const adminRateLimitedResponse =
  await rateLimitedAdminHandler.fetch(
    new Request(
      "http://localhost/api/admin?operation=host-save",
      {
        method: "POST",
      },
    ),
  );

assert.equal(
  adminRateLimitedResponse.status,
  429,
);

assert.equal(
  adminRateLimitedResponse.headers.get(
    "retry-after",
  ),
  String(10 * 60),
);

assert.equal(
  adminRateLimitedResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

let checkoutDatabaseCalls = 0;

const checkoutRateLimitedHandler =
  createCheckoutHandler({
    async enforceRateLimitForRequest(
      request,
      configuration,
    ) {
      assert.equal(
        request.method,
        "POST",
      );

      assert.deepEqual(
        configuration,
        {
          keyMode: "subject",
          limit: 120,
          scope:
            "staff-visitor-checkout",
          subject: userId,
          windowSeconds: 10 * 60,
        },
      );

      throw new RateLimitExceededError(
        10 * 60,
      );
    },

    getAdminClientForRequest() {
      checkoutDatabaseCalls += 1;

      throw new Error(
        "The checkout database must not be queried after rate limiting.",
      );
    },

    async requireActiveStaffForRequest() {
      return {
        profile: {
          active: true,
          fullName:
            "Test Receptionist",
          role: "receptionist",
          userId,
        },
      };
    },
  });

const checkoutRateLimitedResponse =
  await checkoutRateLimitedHandler.fetch(
    new Request(
      "http://localhost/api/staff/checkout",
      {
        method: "POST",
      },
    ),
  );

assert.equal(
  checkoutRateLimitedResponse.status,
  429,
);

assert.equal(
  checkoutRateLimitedResponse.headers.get(
    "retry-after",
  ),
  String(10 * 60),
);

assert.equal(
  checkoutRateLimitedResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

assert.equal(
  checkoutDatabaseCalls,
  0,
);

let rejectedMethodAuthenticationCalls = 0;

const rejectedMethodHandler =
  createCheckoutHandler({
    async requireActiveStaffForRequest() {
      rejectedMethodAuthenticationCalls += 1;

      throw new Error(
        "Authentication must not run for rejected methods.",
      );
    },
  });

const rejectedMethodResponse =
  await rejectedMethodHandler.fetch(
    new Request(
      "http://localhost/api/staff/checkout",
      {
        method: "GET",
      },
    ),
  );

assert.equal(
  rejectedMethodResponse.status,
  405,
);

assert.equal(
  rejectedMethodAuthenticationCalls,
  0,
);

console.log(
  "Authenticated rate-limit validation checks passed.",
);