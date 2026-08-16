import {
  describe,
  expect,
  it,
} from "vitest";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
} from "../../src/constants/visitorOptions.js";
import {
  normalizePhone,
  visitorRegistrationSchema,
} from "../../src/validation/visitorRegistration.js";

const validRegistration = {
  agency: "IAA",
  consent: true,
  customMeetingTitle: "",
  division: "",
  email: "visitor@example.invalid",
  firstName: "Test",
  lastName: "Visitor",
  meetingId: "",
  organization: "Test Organisation",
  personVisiting: "Test Officer",
  phone: "024 000 0000",
  purpose: "Official",
};

describe("normalizePhone", () => {
  it.each([
    [
      "024 000 0000",
      "+233240000000",
    ],
    [
      "233240000000",
      "+233240000000",
    ],
    [
      "00442079460000",
      "+442079460000",
    ],
  ])(
    "normalizes %s to %s",
    (input, expected) => {
      expect(normalizePhone(input)).toBe(
        expected,
      );
    },
  );
});

describe("visitorRegistrationSchema", () => {
  it("normalizes a valid first-time registration", () => {
    const result =
      visitorRegistrationSchema.safeParse(
        validRegistration,
      );

    expect(result.success).toBe(true);

    expect(result.data).toMatchObject({
      fullName: "Test Visitor",
      personVisiting: "Test Officer",
      phone: "+233240000000",
    });
  });

  it("requires privacy acknowledgement", () => {
    const result =
      visitorRegistrationSchema.safeParse({
        ...validRegistration,
        consent: false,
      });

    expect(result.success).toBe(false);

    expect(
      result.error.issues.some(
        (issue) =>
          issue.path[0] === "consent",
      ),
    ).toBe(true);
  });

  it("requires a division for a Ministry visit", () => {
    const result =
      visitorRegistrationSchema.safeParse({
        ...validRegistration,
        agency: MINISTRY_OF_FINANCE_AGENCY,
        division: "",
      });

    expect(result.success).toBe(false);
  });

  it("accepts an approved Ministry division", () => {
    const result =
      visitorRegistrationSchema.safeParse({
        ...validRegistration,
        agency: MINISTRY_OF_FINANCE_AGENCY,
        division: MOF_DIVISIONS[0],
      });

    expect(result.success).toBe(true);
    expect(result.data.division).toBe(
      MOF_DIVISIONS[0],
    );
  });

  it("rejects an invalid destination agency", () => {
    const result =
      visitorRegistrationSchema.safeParse({
        ...validRegistration,
        agency: "Unknown Agency",
      });

    expect(result.success).toBe(false);
  });
});