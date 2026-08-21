import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  clearWeeklyQrCookie,
  createWeeklyQrAccessUrl,
  createWeeklyQrCookie,
  createWeeklyQrToken,
  getWeeklyQrWindow,
  readWeeklyQrAccess,
  validateWeeklyQrToken,
} from "../../src/server/weeklyQrAccess.js";

const TEST_SECRET =
  "invented-weekly-qr-secret-for-unit-testing-only-2026";

const MONDAY =
  new Date("2026-08-17T00:00:00.000Z");

const WEDNESDAY =
  new Date("2026-08-19T12:30:00.000Z");

const SUNDAY_END =
  new Date("2026-08-23T23:59:59.999Z");

const NEXT_MONDAY =
  new Date("2026-08-24T00:00:00.000Z");

function createRequest(
  url = "https://visitors.example.gov.gh/api/register",
  headers = {},
) {
  return new Request(url, {
    headers,
  });
}

describe("weekly QR access", () => {
  beforeEach(() => {
    vi.stubEnv(
      "WEEKLY_QR_SECRET",
      TEST_SECRET,
    );

    vi.stubEnv(
      "VISITOR_APP_URL",
      "https://visitors.example.gov.gh",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a Monday-through-Sunday Ghana validity window", () => {
    const window =
      getWeeklyQrWindow(WEDNESDAY);

    expect(window).toEqual({
      expiresAt:
        "2026-08-24T00:00:00.000Z",
      validFrom:
        "2026-08-17T00:00:00.000Z",
      validThrough:
        "2026-08-23T23:59:59.999Z",
      weekEndsOn: "2026-08-23",
      weekStartsOn: "2026-08-17",
    });
  });

  it("keeps Monday and Sunday within the same weekly window", () => {
    const mondayWindow =
      getWeeklyQrWindow(MONDAY);

    const sundayWindow =
      getWeeklyQrWindow(SUNDAY_END);

    expect(
      mondayWindow.weekStartsOn,
    ).toBe("2026-08-17");

    expect(
      sundayWindow.weekStartsOn,
    ).toBe("2026-08-17");

    expect(sundayWindow).toEqual(
      mondayWindow,
    );
  });

  it("creates the same static token throughout one week", () => {
    const mondayToken =
      createWeeklyQrToken(MONDAY);

    const sundayToken =
      createWeeklyQrToken(SUNDAY_END);

    expect(sundayToken.token).toBe(
      mondayToken.token,
    );

    expect(
      mondayToken.weekEndsOn,
    ).toBe("2026-08-23");
  });

  it("creates a different token on the following Monday", () => {
    const currentToken =
      createWeeklyQrToken(SUNDAY_END);

    const nextToken =
      createWeeklyQrToken(NEXT_MONDAY);

    expect(nextToken.token).not.toBe(
      currentToken.token,
    );

    expect(
      nextToken.weekStartsOn,
    ).toBe("2026-08-24");

    expect(
      nextToken.weekEndsOn,
    ).toBe("2026-08-30");
  });

  it("accepts the current weekly token", () => {
    const weeklyAccess =
      createWeeklyQrToken(WEDNESDAY);

    const validated =
      validateWeeklyQrToken(
        weeklyAccess.token,
        SUNDAY_END,
      );

    expect(validated.token).toBe(
      weeklyAccess.token,
    );

    expect(
      validated.weekStartsOn,
    ).toBe("2026-08-17");

    expect(
      validated.weekEndsOn,
    ).toBe("2026-08-23");
  });

  it("rejects the previous token when the next Monday begins", () => {
    const previousAccess =
      createWeeklyQrToken(SUNDAY_END);

    expect(() =>
      validateWeeklyQrToken(
        previousAccess.token,
        NEXT_MONDAY,
      ),
    ).toThrow(
      "The weekly visitor QR code has expired.",
    );
  });

  it("rejects a token with a modified signature", () => {
    const weeklyAccess =
      createWeeklyQrToken(WEDNESDAY);

    const finalCharacter =
      weeklyAccess.token.at(-1);

    const replacementCharacter =
      finalCharacter === "A" ? "B" : "A";

    const modifiedToken =
      weeklyAccess.token.slice(0, -1) +
      replacementCharacter;

    expect(() =>
      validateWeeklyQrToken(
        modifiedToken,
        WEDNESDAY,
      ),
    ).toThrow(
      "The weekly visitor access token is invalid.",
    );
  });

  it("places the token in the URL fragment instead of the query string", () => {
    const weeklyAccess =
      createWeeklyQrToken(WEDNESDAY);

    const accessUrl =
      createWeeklyQrAccessUrl(
        weeklyAccess.token,
      );

    const parsedUrl = new URL(accessUrl);

    expect(parsedUrl.origin).toBe(
      "https://visitors.example.gov.gh",
    );

    expect(parsedUrl.pathname).toBe(
      "/visit",
    );

    expect(parsedUrl.search).toBe("");

    expect(parsedUrl.hash).toContain(
      "weeklyAccess=",
    );

    const fragment =
      new URLSearchParams(
        parsedUrl.hash.slice(1),
      );

    expect(
      fragment.get("weeklyAccess"),
    ).toBe(weeklyAccess.token);
  });

  it("creates an HttpOnly secure cookie for HTTPS requests", () => {
    const weeklyAccess =
      createWeeklyQrToken(WEDNESDAY);

    const cookie =
      createWeeklyQrCookie(
        createRequest(),
        weeklyAccess.token,
        WEDNESDAY,
      );

    expect(cookie).toContain(
      "mof_visitor_weekly_access=",
    );

    expect(cookie).toContain(
      "Path=/api",
    );

    expect(cookie).toContain(
      "HttpOnly",
    );

    expect(cookie).toContain(
      "SameSite=Lax",
    );

    expect(cookie).toContain(
      "Secure",
    );

    expect(cookie).toContain(
      "Expires=Mon, 24 Aug 2026 00:00:00 GMT",
    );
  });

  it("supports local HTTP development without marking the cookie Secure", () => {
    const weeklyAccess =
      createWeeklyQrToken(WEDNESDAY);

    const request = createRequest(
      "http://localhost:5173/api/register",
    );

    const cookie =
      createWeeklyQrCookie(
        request,
        weeklyAccess.token,
        WEDNESDAY,
      );

    expect(cookie).toContain(
      "HttpOnly",
    );

    expect(cookie).toContain(
      "SameSite=Lax",
    );

    expect(cookie).not.toContain(
      "Secure",
    );
  });

  it("reads and validates the weekly token from the access cookie", () => {
    const weeklyAccess =
      createWeeklyQrToken(WEDNESDAY);

    const request = createRequest(
      undefined,
      {
        Cookie:
          `mof_visitor_weekly_access=${encodeURIComponent(
            weeklyAccess.token,
          )}`,
      },
    );

    const access =
      readWeeklyQrAccess(
        request,
        WEDNESDAY,
      );

    expect(access.token).toBe(
      weeklyAccess.token,
    );

    expect(access.weekEndsOn).toBe(
      "2026-08-23",
    );
  });

  it("creates a cookie-removal header", () => {
    const cookie =
      clearWeeklyQrCookie(
        createRequest(),
      );

    expect(cookie).toContain(
      "mof_visitor_weekly_access=",
    );

    expect(cookie).toContain(
      "Max-Age=0",
    );

    expect(cookie).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );

    expect(cookie).toContain(
      "HttpOnly",
    );

    expect(cookie).toContain(
      "Secure",
    );
  });

  it("rejects secrets shorter than 32 bytes", () => {
    vi.stubEnv(
      "WEEKLY_QR_SECRET",
      "too-short",
    );

    expect(() =>
      createWeeklyQrToken(WEDNESDAY),
    ).toThrow(
      "WEEKLY_QR_SECRET must contain at least 32 bytes.",
    );
  });
});