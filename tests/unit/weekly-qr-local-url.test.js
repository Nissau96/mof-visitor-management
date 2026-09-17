import {
  describe,
  expect,
  it,
} from "vitest";
import { createWeeklyQrAccessUrl } from "../../src/server/weeklyQrAccess.js";

describe("weekly QR application URL override", () => {
  it("creates a local visitor URL from an explicit localhost origin", () => {
    const result =
      createWeeklyQrAccessUrl(
        "synthetic-weekly-token",
        "http://localhost:3000/visit",
      );

    const url = new URL(result);

    expect(url.origin).toBe(
      "http://localhost:3000",
    );

    expect(url.pathname).toBe(
      "/visit",
    );

    expect(url.search).toBe("");

    expect(
      new URLSearchParams(
        url.hash.slice(1),
      ).get("weeklyAccess"),
    ).toBe(
      "synthetic-weekly-token",
    );
  });

  it("allows an explicit HTTPS application URL", () => {
    const result =
      createWeeklyQrAccessUrl(
        "synthetic-weekly-token",
        "https://visitor.example/visit",
      );

    expect(
      new URL(result).origin,
    ).toBe(
      "https://visitor.example",
    );
  });

  it("rejects a non-local HTTP application URL", () => {
    expect(() =>
      createWeeklyQrAccessUrl(
        "synthetic-weekly-token",
        "http://visitor.example/visit",
      ),
    ).toThrow(
      "VISITOR_APP_URL must use HTTPS outside local development.",
    );
  });
});
