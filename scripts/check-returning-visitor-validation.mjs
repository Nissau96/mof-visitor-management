import assert from "node:assert/strict";
import process from "node:process";
import verifyHandler from "../api/returning/verify.js";
import {
  VERIFIED_VISITOR_AUDIENCE,
  createVerifiedVisitorToken,
  maskEmail,
  readVisitorToken,
} from "../api/_lib/visitorLookup.js";
import {
  createWeeklyQrCookie,
  createWeeklyQrToken,
} from "../src/server/weeklyQrAccess.js";
import {
  returningVisitorCodeSchema,
  returningVisitorLookupSchema,
} from "../src/validation/returningVisitor.js";

process.env.VISITOR_LOOKUP_SECRET =
  "stage-six-test-secret-that-is-longer-than-thirty-two-bytes";

process.env.WEEKLY_QR_SECRET =
  "invented-weekly-qr-secret-for-validation-only-2026";

const weeklyAccessToken =
  createWeeklyQrToken().token;

const weeklyAccessCookie =
  createWeeklyQrCookie(
    new Request(
      "http://localhost/api/register",
    ),
    weeklyAccessToken,
  ).split(";")[0];

const visitorId =
  "00000000-0000-4000-8000-000000000006";

const validLookup =
  returningVisitorLookupSchema.safeParse({
    phone: "024 000 0000",
  });

assert.equal(validLookup.success, true);
assert.equal(validLookup.data.phone, "+233240000000");

const validCode =
  returningVisitorCodeSchema.safeParse({
    code: " 012345 ",
    phone: "024 000 0000",
  });

assert.equal(validCode.success, true);
assert.equal(validCode.data.code, "012345");

assert.equal(
  returningVisitorCodeSchema.safeParse({
    code: "12345",
    phone: "024 000 0000",
  }).success,
  false,
);

const invalidLookup =
  returningVisitorLookupSchema.safeParse({
    phone: "123",
  });

assert.equal(invalidLookup.success, false);

assert.equal(maskEmail("test@example.com"), "t•••••@example.com");

const verificationToken =
  createVerifiedVisitorToken(visitorId);

const verificationPayload = readVisitorToken(
  verificationToken,
  VERIFIED_VISITOR_AUDIENCE,
);

assert.equal(verificationPayload.visitorId, visitorId);

const [
  encodedPayload,
  encodedSignature,
] = verificationToken.split(".");

const replacementCharacter =
  encodedSignature.startsWith("A")
    ? "B"
    : "A";

const tamperedToken =
  `${encodedPayload}.${replacementCharacter}${encodedSignature.slice(1)}`;

assert.throws(() =>
  readVisitorToken(
    tamperedToken,
    VERIFIED_VISITOR_AUDIENCE,
  ),
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

const invalidVerificationResponse =
  await verifyHandler.fetch(
    new Request(
      "http://localhost/api/returning/verify",
      {
        body: JSON.stringify({}),
        headers: {
          "Content-Type":
            "application/json",
          Cookie: weeklyAccessCookie,
        },
        method: "POST",
      },
    ),
  );

assert.equal(invalidVerificationResponse.status, 400);

console.log(
  "Returning visitor validation checks passed.",
);
