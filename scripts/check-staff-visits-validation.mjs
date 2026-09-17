import assert from "node:assert/strict";
import checkoutEndpoint from "../api/staff/checkout.js";
import historyEndpoint from "../api/staff/history.js";
import {
  staffVisitCheckoutSchema,
  visitHistorySchema,
} from "../src/validation/staffVisits.js";

const TEST_VISIT_ID =
  "11111111-1111-4111-8111-111111111111";

function createRequest(path, options = {}) {
  return new Request(
    `http://localhost${path}`,
    options,
  );
}

async function readResponse(response) {
  const body = await response.json();

  return {
    body,
    response,
  };
}

function verifyCheckoutValidation() {
  const validResult =
    staffVisitCheckoutSchema.safeParse({
      tower: "tower_1",
      visitId: TEST_VISIT_ID,
    });

  assert.equal(validResult.success, true);
  assert.equal(
    validResult.data.visitId,
    TEST_VISIT_ID,
  );
  assert.equal(
    validResult.data.tower,
    "tower_1",
  );

  const allTowerResult =
    staffVisitCheckoutSchema.safeParse({
      visitId: TEST_VISIT_ID,
    });

  assert.equal(
    allTowerResult.success,
    true,
  );
  assert.equal(
    allTowerResult.data.tower,
    "",
  );

  assert.equal(
    staffVisitCheckoutSchema.safeParse({
      visitId: "not-a-uuid",
    }).success,
    false,
  );

  assert.equal(
    staffVisitCheckoutSchema.safeParse({
      tower: "tower_3",
      visitId: TEST_VISIT_ID,
    }).success,
    false,
  );

  assert.equal(
    staffVisitCheckoutSchema.safeParse({
      visitId: TEST_VISIT_ID,
      unexpected: true,
    }).success,
    false,
  );

  assert.equal(
    staffVisitCheckoutSchema.safeParse({}).success,
    false,
  );
}

function verifyHistoryValidation() {
  const defaultResult =
    visitHistorySchema.safeParse({});

  assert.equal(defaultResult.success, true);

  assert.deepEqual(defaultResult.data, {
    agency: "",
    dateFrom: null,
    dateTo: null,
    division: "",
    page: 1,
    pageSize: 10,
    search: "",
    status: "",
    tower: "",
  });

  const validResult =
    visitHistorySchema.safeParse({
      agency: "Ministry of Finance (MoF)",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      division: "Budget Office",
      page: 2,
      pageSize: 10,
      search: "VIS-123456",
      status: "checked_out",
      tower: "tower_2",
    });

  assert.equal(validResult.success, true);
  assert.equal(validResult.data.page, 2);
  assert.equal(
    validResult.data.status,
    "checked_out",
  );
  assert.equal(
    validResult.data.tower,
    "tower_2",
  );

  assert.equal(
    visitHistorySchema.safeParse({
      page: 0,
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      pageSize: 11,
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      status: "unknown",
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      tower: "tower_3",
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      agency: "IAA",
      division: "Budget Office",
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      dateFrom: "2026-02-31",
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      dateFrom: "2026-08-10",
      dateTo: "2026-08-01",
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      dateFrom: "2025-01-01",
      dateTo: "2026-01-03",
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      dateFrom: "2025-01-01",
      dateTo: "2026-01-02",
    }).success,
    true,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      search: "a".repeat(81),
    }).success,
    false,
  );

  assert.equal(
    visitHistorySchema.safeParse({
      unexpected: true,
    }).success,
    false,
  );
}

async function verifyMethodRestrictions() {
  const checkoutResult = await readResponse(
    await checkoutEndpoint.fetch(
      createRequest(
        "/api/staff/checkout",
        {
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(
    checkoutResult.response.status,
    405,
  );

  assert.equal(
    checkoutResult.response.headers.get("allow"),
    "POST",
  );

  assert.equal(
    checkoutResult.response.headers.get(
      "cache-control",
    ),
    "no-store",
  );

  assert.equal(
    checkoutResult.body.error,
    "Method not allowed.",
  );

  const historyResult = await readResponse(
    await historyEndpoint.fetch(
      createRequest(
        "/api/staff/history",
        {
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(
    historyResult.response.status,
    405,
  );

  assert.equal(
    historyResult.response.headers.get("allow"),
    "POST",
  );

  assert.equal(
    historyResult.response.headers.get(
      "cache-control",
    ),
    "no-store",
  );

  assert.equal(
    historyResult.body.error,
    "Method not allowed.",
  );
}

async function verifyAuthenticationRequired() {
  const checkoutResult = await readResponse(
    await checkoutEndpoint.fetch(
      createRequest(
        "/api/staff/checkout",
        {
          body: JSON.stringify({
            visitId: TEST_VISIT_ID,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      ),
    ),
  );

  assert.equal(
    checkoutResult.response.status,
    401,
  );

  assert.equal(
    checkoutResult.body.error,
    "A valid staff session is required.",
  );

  const historyResult = await readResponse(
    await historyEndpoint.fetch(
      createRequest(
        "/api/staff/history",
        {
          body: JSON.stringify({
            page: 1,
            pageSize: 10,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      ),
    ),
  );

  assert.equal(
    historyResult.response.status,
    401,
  );

  assert.equal(
    historyResult.body.error,
    "A valid staff session is required.",
  );
}

verifyCheckoutValidation();
verifyHistoryValidation();
await verifyMethodRestrictions();
await verifyAuthenticationRequired();

console.log(
  "Staff checkout and visit-history validation checks passed.",
);