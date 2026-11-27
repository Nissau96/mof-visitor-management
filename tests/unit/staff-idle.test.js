import { beforeEach, describe, expect, it } from "vitest";
import {
  clearIdleSignOut,
  getIdleState,
  markIdleSignOut,
  readLastActivity,
  recordActivity,
  resetStaffActivity,
  STAFF_IDLE_TIMEOUT_MS,
  STAFF_IDLE_WARNING_MS,
  wasSignedOutForInactivity,
} from "../../src/lib/staffIdle.js";

const START = Date.UTC(2026, 10, 16, 9, 0, 0);

describe("staff idle sign-out", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStaffActivity();
  });

  it("uses a 25-minute limit with a 2-minute warning", () => {
    expect(STAFF_IDLE_TIMEOUT_MS).toBe(25 * 60_000);
    expect(STAFF_IDLE_WARNING_MS).toBe(2 * 60_000);
  });

  it("stays active until the warning starts", () => {
    expect(getIdleState(START, START + 22 * 60_000).phase).toBe("active");
  });

  it("counts down during the last two minutes", () => {
    expect(getIdleState(START, START + 23 * 60_000)).toEqual({
      phase: "warning",
      secondsLeft: 120,
    });

    expect(getIdleState(START, START + 24 * 60_000 + 59_500)).toEqual({
      phase: "warning",
      secondsLeft: 1,
    });
  });

  it("expires at 25 minutes", () => {
    expect(getIdleState(START, START + 25 * 60_000).phase).toBe("expired");
  });

  it("shares the last activity time through localStorage", () => {
    recordActivity(START);

    expect(window.localStorage.getItem(
      "mof-visitor-management.staff-last-activity",
    )).toBe(String(START));
    expect(readLastActivity()).toBe(START);
  });

  it("forgets the idle clock on sign-in and sign-out", () => {
    recordActivity(START);
    resetStaffActivity();

    expect(readLastActivity()).toBeNull();
  });

  it("explains an idle sign-out on the sign-in page until the next sign-in", () => {
    markIdleSignOut(START);

    expect(wasSignedOutForInactivity(START + 60_000)).toBe(true);

    clearIdleSignOut();

    expect(wasSignedOutForInactivity(START + 60_000)).toBe(false);
  });

  it("drops the notice after twelve hours", () => {
    markIdleSignOut(START);

    expect(wasSignedOutForInactivity(START + 13 * 60 * 60_000)).toBe(false);
  });
});
