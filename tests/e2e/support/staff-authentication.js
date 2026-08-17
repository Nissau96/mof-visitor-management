import {
  expect,
} from "@playwright/test";

const SYNTHETIC_STAFF_ID =
  "00000000-0000-4000-8000-000000000020";

export const SYNTHETIC_STAFF_EMAIL =
  "receptionist.test@example.invalid";

export const SYNTHETIC_STAFF_PASSWORD =
  "Invented development password";

export const SYNTHETIC_ACCESS_TOKEN =
  createSyntheticAccessToken();

const JSON_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function encodeJwtPart(value) {
  return Buffer.from(
    JSON.stringify(value),
    "utf8",
  ).toString("base64url");
}

function createSyntheticAccessToken() {
  const issuedAt = Math.floor(Date.now() / 1000);

  return [
    encodeJwtPart({
      alg: "HS256",
      typ: "JWT",
    }),
    encodeJwtPart({
      aud: "authenticated",
      email: SYNTHETIC_STAFF_EMAIL,
      exp: issuedAt + 60 * 60,
      iat: issuedAt,
      role: "authenticated",
      sub: SYNTHETIC_STAFF_ID,
    }),
    "synthetic-signature",
  ].join(".");
}

function createSyntheticUser(email) {
  const timestamp = "2026-08-17T07:00:00.000Z";

  return {
    app_metadata: {
      provider: "email",
      providers: [
        "email",
      ],
    },
    aud: "authenticated",
    confirmed_at: timestamp,
    created_at: timestamp,
    email,
    email_confirmed_at: timestamp,
    id: SYNTHETIC_STAFF_ID,
    identities: [],
    is_anonymous: false,
    last_sign_in_at: timestamp,
    phone: "",
    role: "authenticated",
    updated_at: timestamp,
    user_metadata: {},
  };
}

export async function installMockStaffAuthentication(
  page,
  {
    fullName = "Synthetic Receptionist",
    role = "receptionist",
  } = {},
) {
  const state = {
    credentialRequests: [],
    logoutRequests: 0,
    sessionRequests: 0,
  };

  const user = createSyntheticUser(
    SYNTHETIC_STAFF_EMAIL,
  );

  await page.route(
    "**/auth/v1/**",
    async (route) => {
      const request = route.request();

      if (request.method() === "OPTIONS") {
        await route.fulfill({
          body: "",
          headers: JSON_HEADERS,
          status: 204,
        });
        return;
      }

      const url = new URL(request.url());

      if (
        url.pathname.endsWith("/token") &&
        request.method() === "POST"
      ) {
        state.credentialRequests.push(
          request.postDataJSON(),
        );

        await route.fulfill({
          headers: JSON_HEADERS,
          json: {
            access_token:
              SYNTHETIC_ACCESS_TOKEN,
            expires_at:
              Math.floor(Date.now() / 1000) +
              60 * 60,
            expires_in: 60 * 60,
            refresh_token:
              "synthetic-refresh-token",
            token_type: "bearer",
            user,
          },
          status: 200,
        });
        return;
      }

      if (
        url.pathname.endsWith("/user") &&
        request.method() === "GET"
      ) {
        await route.fulfill({
          headers: JSON_HEADERS,
          json: user,
          status: 200,
        });
        return;
      }

      if (
        url.pathname.endsWith("/logout") &&
        request.method() === "POST"
      ) {
        state.logoutRequests += 1;

        await route.fulfill({
          body: "",
          headers: JSON_HEADERS,
          status: 204,
        });
        return;
      }

      await route.fulfill({
        headers: JSON_HEADERS,
        json: {
          message:
            "Unexpected synthetic authentication request.",
        },
        status: 404,
      });
    },
  );

  await page.route(
    "**/api/staff/session",
    async (route) => {
      const request = route.request();

      state.sessionRequests += 1;

      expect(request.method()).toBe("GET");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      await route.fulfill({
        contentType: "application/json",
        json: {
          profile: {
            fullName,
            role,
          },
        },
        status: 200,
      });
    },
  );

  return state;
}

export async function signInAsStaff(
  page,
  {
    destination = "/staff",
    email = SYNTHETIC_STAFF_EMAIL,
    password = SYNTHETIC_STAFF_PASSWORD,
  } = {},
) {
  await page.goto(destination);

  await expect(
    page.getByRole("heading", {
      name: "Sign in",
    }),
  ).toBeVisible();

  await page
    .getByRole("textbox", {
      name: /Email address/i,
    })
    .fill(email);

  await page
    .getByLabel(/^Password/i)
    .fill(password);

  await page
    .getByRole("button", {
      name: "Sign in securely",
    })
    .click();

  await expect
    .poll(() => {
      const url = new URL(page.url());

      return `${url.pathname}${url.search}`;
    })
    .toBe(destination);
}