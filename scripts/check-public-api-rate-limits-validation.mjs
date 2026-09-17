import assert from "node:assert/strict";
import process from "node:process";
import {
  HOST_DIRECTORY_RATE_LIMIT,
  createHostsHandler,
} from "../api/hosts.js";
import {
  MEETING_DIRECTORY_RATE_LIMIT,
  createMeetingsHandler,
} from "../api/meetings.js";
import {
  RateLimitExceededError,
} from "../api/_lib/rateLimit.js";
import {
  createPrivateRequestKey,
} from "../api/_lib/visitorLookup.js";
import {
  createWeeklyQrCookie,
  createWeeklyQrToken,
} from "../src/server/weeklyQrAccess.js";

process.env.VISITOR_LOOKUP_SECRET =
  "isolated-public-rate-limit-test-secret-longer-than-thirty-two-bytes";

process.env.WEEKLY_QR_SECRET =
  "invented-weekly-qr-secret-for-public-rate-limit-validation-2026";

const weeklyAccessToken =
  createWeeklyQrToken().token;

const weeklyAccessCookie =
  createWeeklyQrCookie(
    new Request(
      "http://localhost/api/register",
    ),
    weeklyAccessToken,
  ).split(";")[0];

function createWeeklyAccessRequest(
  path,
) {
  return new Request(
    `http://localhost${path}`,
    {
      headers: {
        Cookie: weeklyAccessCookie,
      },
    },
  );
}

assert.deepEqual(
  HOST_DIRECTORY_RATE_LIMIT,
  {
    limit: 300,
    scope: "public-host-directory",
    windowSeconds: 10 * 60,
  },
);

assert.equal(
  Object.isFrozen(
    HOST_DIRECTORY_RATE_LIMIT,
  ),
  true,
);

assert.deepEqual(
  MEETING_DIRECTORY_RATE_LIMIT,
  {
    limit: 300,
    scope: "public-meeting-directory",
    windowSeconds: 10 * 60,
  },
);

assert.equal(
  Object.isFrozen(
    MEETING_DIRECTORY_RATE_LIMIT,
  ),
  true,
);

const preferredAddressRequest = new Request(
  "http://localhost/api/hosts",
  {
    headers: {
      "X-Forwarded-For":
        "198.51.100.20",
      "X-Vercel-Forwarded-For":
        "203.0.113.10",
    },
  },
);

const samePreferredAddressRequest =
  new Request(
    "http://localhost/api/hosts",
    {
      headers: {
        "X-Forwarded-For":
          "192.0.2.40",
        "X-Vercel-Forwarded-For":
          "203.0.113.10",
      },
    },
  );

const differentPreferredAddressRequest =
  new Request(
    "http://localhost/api/hosts",
    {
      headers: {
        "X-Vercel-Forwarded-For":
          "203.0.113.11",
      },
    },
  );

const preferredAddressKey =
  createPrivateRequestKey(
    preferredAddressRequest,
    "public-host-directory",
  );

const samePreferredAddressKey =
  createPrivateRequestKey(
    samePreferredAddressRequest,
    "public-host-directory",
  );

const differentPreferredAddressKey =
  createPrivateRequestKey(
    differentPreferredAddressRequest,
    "public-host-directory",
  );

assert.equal(
  preferredAddressKey,
  samePreferredAddressKey,
);

assert.notEqual(
  preferredAddressKey,
  differentPreferredAddressKey,
);

assert.match(
  preferredAddressKey,
  /^[0-9a-f]{64}$/,
);

assert.equal(
  preferredAddressKey.includes(
    "203.0.113.10",
  ),
  false,
);

const fallbackAddressKey =
  createPrivateRequestKey(
    new Request(
      "http://localhost/api/hosts",
      {
        headers: {
          "X-Forwarded-For":
            "198.51.100.30",
        },
      },
    ),
    "public-host-directory",
  );

const differentFallbackAddressKey =
  createPrivateRequestKey(
    new Request(
      "http://localhost/api/hosts",
      {
        headers: {
          "X-Forwarded-For":
            "198.51.100.31",
        },
      },
    ),
    "public-host-directory",
  );

assert.notEqual(
  fallbackAddressKey,
  differentFallbackAddressKey,
);

const invalidAddressKey =
  createPrivateRequestKey(
    new Request(
      "http://localhost/api/hosts",
      {
        headers: {
          "X-Vercel-Forwarded-For":
            "not-a-valid-address",
        },
      },
    ),
    "public-host-directory",
  );

const unknownAddressKey =
  createPrivateRequestKey(
    new Request(
      "http://localhost/api/hosts",
    ),
    "public-host-directory",
  );

assert.equal(
  invalidAddressKey,
  unknownAddressKey,
);

let hostRateLimitChecks = 0;

const hostQuery = {
  eq(column, value) {
    assert.equal(column, "active");
    assert.equal(value, true);

    return hostQuery;
  },

  async order(column, options) {
    assert.equal(column, "full_name");
    assert.deepEqual(options, {
      ascending: true,
    });

    return {
      data: [
        {
          department: "Finance Division",
          full_name: "Test Host",
          id:
            "00000000-0000-4000-8000-000000000001",
        },
      ],
      error: null,
    };
  },

  select(columns) {
    assert.equal(
      columns,
      "id, full_name, department",
    );

    return hostQuery;
  },
};

const hostsHandler = createHostsHandler({
  async enforceRateLimitForRequest(
    request,
    configuration,
  ) {
    assert.equal(
      request.method,
      "GET",
    );

    assert.equal(
      configuration,
      HOST_DIRECTORY_RATE_LIMIT,
    );

    hostRateLimitChecks += 1;
  },

  getAdminClientForRequest() {
    return {
      from(table) {
        assert.equal(table, "hosts");

        return hostQuery;
      },
    };
  },
});

const hostsResponse =
  await hostsHandler.fetch(
    createWeeklyAccessRequest(
      "/api/hosts",
    ),
  );

assert.equal(hostsResponse.status, 200);
assert.equal(hostRateLimitChecks, 1);
assert.equal(
  hostsResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

assert.deepEqual(
  await hostsResponse.json(),
  {
    hosts: [
      {
        department: "Finance Division",
        fullName: "Test Host",
        id:
          "00000000-0000-4000-8000-000000000001",
      },
    ],
  },
);

let meetingRateLimitChecks = 0;

const meetingsHandler =
  createMeetingsHandler({
    async enforceRateLimitForRequest(
      request,
      configuration,
    ) {
      assert.equal(
        request.method,
        "GET",
      );

      assert.equal(
        configuration,
        MEETING_DIRECTORY_RATE_LIMIT,
      );

      meetingRateLimitChecks += 1;
    },

    getAdminClientForRequest() {
      return {
        async rpc(functionName) {
          assert.equal(
            functionName,
            "get_available_meetings",
          );

          return {
            data: [
              {
                id:
                  "00000000-0000-4000-8000-000000000002",
                title:
                  "Test Public Meeting",
              },
            ],
            error: null,
          };
        },
      };
    },
  });

const meetingsResponse =
  await meetingsHandler.fetch(
    createWeeklyAccessRequest(
      "/api/meetings",
    ),
  );

assert.equal(
  meetingsResponse.status,
  200,
);

assert.equal(
  meetingRateLimitChecks,
  1,
);

assert.equal(
  meetingsResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

assert.deepEqual(
  await meetingsResponse.json(),
  {
    meetings: [
      {
        id:
          "00000000-0000-4000-8000-000000000002",
        title:
          "Test Public Meeting",
      },
    ],
  },
);

const hostRateLimitedHandler =
  createHostsHandler({
    async enforceRateLimitForRequest() {
      throw new RateLimitExceededError(
        10 * 60,
      );
    },

    getAdminClientForRequest() {
      throw new Error(
        "The database must not be queried after rate limiting.",
      );
    },
  });

const hostRateLimitedResponse =
  await hostRateLimitedHandler.fetch(
    createWeeklyAccessRequest(
      "/api/hosts",
    ),
  );

assert.equal(
  hostRateLimitedResponse.status,
  429,
);

assert.equal(
  hostRateLimitedResponse.headers.get(
    "retry-after",
  ),
  String(10 * 60),
);

assert.equal(
  hostRateLimitedResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

const meetingRateLimitedHandler =
  createMeetingsHandler({
    async enforceRateLimitForRequest() {
      throw new RateLimitExceededError(
        10 * 60,
      );
    },

    getAdminClientForRequest() {
      throw new Error(
        "The database must not be queried after rate limiting.",
      );
    },
  });

const meetingRateLimitedResponse =
  await meetingRateLimitedHandler.fetch(
    createWeeklyAccessRequest(
      "/api/meetings",
    ),
  );

assert.equal(
  meetingRateLimitedResponse.status,
  429,
);

assert.equal(
  meetingRateLimitedResponse.headers.get(
    "retry-after",
  ),
  String(10 * 60),
);

assert.equal(
  meetingRateLimitedResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

let rejectedMethodRateLimitChecks = 0;

const rejectedMethodHandler =
  createHostsHandler({
    async enforceRateLimitForRequest() {
      rejectedMethodRateLimitChecks += 1;
    },
  });

const rejectedMethodResponse =
  await rejectedMethodHandler.fetch(
    new Request(
      "http://localhost/api/hosts",
      {
        method: "POST",
      },
    ),
  );

assert.equal(
  rejectedMethodResponse.status,
  405,
);

assert.equal(
  rejectedMethodResponse.headers.get(
    "allow",
  ),
  "GET",
);

assert.equal(
  rejectedMethodRateLimitChecks,
  0,
);

console.log(
  "Public API rate-limit validation checks passed.",
);
