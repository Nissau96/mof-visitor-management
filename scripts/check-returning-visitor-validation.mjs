import assert from "node:assert/strict";
import process from "node:process";
import searchHandler from "../api/returning/search.js";
import verifyHandler from "../api/returning/verify.js";
import {
  VERIFIED_VISITOR_AUDIENCE,
  VISITOR_LOOKUP_AUDIENCE,
  createLookupToken,
  createVerifiedVisitorToken,
  maskPhoneSuffix,
  maskVisitorName,
  maskVisitorOrganization,
  readVisitorToken,
} from "../api/_lib/visitorLookup.js";
import {
  returningVisitorSearchSchema,
  returningVisitorVerificationSchema,
} from "../src/validation/returningVisitor.js";

process.env.VISITOR_LOOKUP_SECRET =
  "stage-six-test-secret-that-is-longer-than-thirty-two-bytes";

const visitorId =
  "00000000-0000-4000-8000-000000000006";

const validSearch = returningVisitorSearchSchema.safeParse({
  query: "  Test   Visitor  ",
});

assert.equal(validSearch.success, true);
assert.equal(validSearch.data.query, "Test Visitor");

const invalidSearch = returningVisitorSearchSchema.safeParse({
  query: "Te",
});

assert.equal(invalidSearch.success, false);

const lookupToken = createLookupToken(visitorId);

const lookupPayload = readVisitorToken(
  lookupToken,
  VISITOR_LOOKUP_AUDIENCE,
);

assert.equal(lookupPayload.visitorId, visitorId);

assert.throws(() =>
  readVisitorToken(
    lookupToken,
    VERIFIED_VISITOR_AUDIENCE,
  ),
);

const verificationToken =
  createVerifiedVisitorToken(visitorId);

const verificationPayload = readVisitorToken(
  verificationToken,
  VERIFIED_VISITOR_AUDIENCE,
);

assert.equal(verificationPayload.visitorId, visitorId);

const replacementCharacter = lookupToken.endsWith("x")
  ? "y"
  : "x";

const tamperedToken =
  `${lookupToken.slice(0, -1)}${replacementCharacter}`;

assert.throws(() =>
  readVisitorToken(
    tamperedToken,
    VISITOR_LOOKUP_AUDIENCE,
  ),
);

assert.equal(
  maskVisitorName("Test Visitor"),
  "T••• V••••••",
);

assert.equal(
  maskVisitorOrganization("Test Organisation"),
  "T••• O••••••••",
);

assert.equal(maskPhoneSuffix("42"), "•••• ••42");

const validVerification =
  returningVisitorVerificationSchema.safeParse({
    lookupToken,
    phone: "024 000 0000",
  });

assert.equal(validVerification.success, true);

assert.equal(
  validVerification.data.phone,
  "+233240000000",
);

const invalidVerification =
  returningVisitorVerificationSchema.safeParse({
    lookupToken: "",
    phone: "123",
  });

assert.equal(invalidVerification.success, false);

const rejectedSearchMethod = await searchHandler.fetch(
  new Request("http://localhost/api/returning/search", {
    method: "GET",
  }),
);

assert.equal(rejectedSearchMethod.status, 405);

assert.equal(
  rejectedSearchMethod.headers.get("allow"),
  "POST",
);

const rejectedVerifyMethod = await verifyHandler.fetch(
  new Request("http://localhost/api/returning/verify", {
    method: "GET",
  }),
);

assert.equal(rejectedVerifyMethod.status, 405);

assert.equal(
  rejectedVerifyMethod.headers.get("allow"),
  "POST",
);

const invalidSearchResponse = await searchHandler.fetch(
  new Request("http://localhost/api/returning/search", {
    body: JSON.stringify({
      query: "Te",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  }),
);

assert.equal(invalidSearchResponse.status, 400);

const invalidVerificationResponse =
  await verifyHandler.fetch(
    new Request(
      "http://localhost/api/returning/verify",
      {
        body: JSON.stringify({}),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ),
  );

assert.equal(invalidVerificationResponse.status, 400);

console.log(
  "Returning visitor validation checks passed.",
);