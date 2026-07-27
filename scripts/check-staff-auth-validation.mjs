import assert from "node:assert/strict";
import staffSessionHandler from "../api/staff/session.js";
import { staffLoginSchema } from "../src/validation/staffLogin.js";

const validLogin = staffLoginSchema.safeParse({
  email: "  RECEPTIONIST.DEV@example.com  ",
  password: "Invented development password",
});

assert.equal(validLogin.success, true);
assert.equal(
  validLogin.data.email,
  "receptionist.dev@example.com",
);

const invalidEmail = staffLoginSchema.safeParse({
  email: "not-an-email",
  password: "Invented development password",
});

assert.equal(invalidEmail.success, false);

const missingPassword = staffLoginSchema.safeParse({
  email: "receptionist.dev@example.com",
  password: "",
});

assert.equal(missingPassword.success, false);

const rejectedMethod = await staffSessionHandler.fetch(
  new Request("http://localhost/api/staff/session", {
    method: "POST",
  }),
);

assert.equal(rejectedMethod.status, 405);
assert.equal(rejectedMethod.headers.get("allow"), "GET");

const missingTokenResponse =
  await staffSessionHandler.fetch(
    new Request(
      "http://localhost/api/staff/session",
      {
        method: "GET",
      },
    ),
  );

assert.equal(missingTokenResponse.status, 401);
assert.equal(
  missingTokenResponse.headers.get(
    "www-authenticate",
  ),
  "Bearer",
);

const invalidSchemeResponse =
  await staffSessionHandler.fetch(
    new Request(
      "http://localhost/api/staff/session",
      {
        headers: {
          Authorization: "Basic invalid-credentials",
        },
        method: "GET",
      },
    ),
  );

assert.equal(invalidSchemeResponse.status, 401);

console.log(
  "Staff authentication validation checks passed.",
);