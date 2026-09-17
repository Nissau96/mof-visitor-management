import assert from "node:assert/strict";
import dashboardHandler from "../api/staff/dashboard.js";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
} from "../src/constants/visitorOptions.js";
import { receptionDashboardSchema } from "../src/validation/receptionDashboard.js";

const validRequest =
  receptionDashboardSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    division: MOF_DIVISIONS[0],
    page: 1,
    query: "VIS-",
    tower: "tower_1",
  });

assert.equal(validRequest.success, true);
assert.equal(
  validRequest.data.tower,
  "tower_1",
);

const validEmptyFilters =
  receptionDashboardSchema.safeParse({
    agency: "",
    division: "",
    page: 1,
    query: "",
  });

assert.equal(validEmptyFilters.success, true);
assert.deepEqual(
  validEmptyFilters.data,
  {
    agency: "",
    division: "",
    page: 1,
    query: "",
    tower: "",
  },
);

const invalidPage =
  receptionDashboardSchema.safeParse({
    agency: "",
    division: "",
    page: 0,
    query: "",
  });

assert.equal(invalidPage.success, false);

const invalidSearch =
  receptionDashboardSchema.safeParse({
    agency: "",
    division: "",
    page: 1,
    query: "A",
  });

assert.equal(invalidSearch.success, false);

const invalidTower =
  receptionDashboardSchema.safeParse({
    agency: "",
    division: "",
    page: 1,
    query: "",
    tower: "tower_3",
  });

assert.equal(invalidTower.success, false);

const invalidDivision =
  receptionDashboardSchema.safeParse({
    agency: "IAA",
    division: MOF_DIVISIONS[0],
    page: 1,
    query: "",
  });

assert.equal(invalidDivision.success, false);

const rejectedMethod = await dashboardHandler.fetch(
  new Request(
    "http://localhost/api/staff/dashboard",
    {
      method: "GET",
    },
  ),
);

assert.equal(rejectedMethod.status, 405);
assert.equal(
  rejectedMethod.headers.get("allow"),
  "POST",
);

const missingToken = await dashboardHandler.fetch(
  new Request(
    "http://localhost/api/staff/dashboard",
    {
      body: JSON.stringify({
        agency: "",
        division: "",
        page: 1,
        query: "",
        tower: "tower_1",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  ),
);

assert.equal(missingToken.status, 401);
assert.equal(
  missingToken.headers.get(
    "www-authenticate",
  ),
  "Bearer",
);

console.log(
  "Reception dashboard validation checks passed.",
);