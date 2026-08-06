import assert from "node:assert/strict";
import { RateLimitExceededError } from "../api/_lib/rateLimit.js";
import hostsHandler from "../api/hosts.js";
import meetingsHandler from "../api/meetings.js";
import registerHandler, {
  REGISTRATION_RATE_LIMIT,
  createRegisterHandler,
} from "../api/register.js";
import {
  CUSTOM_MEETING_OPTION,
  MEETING_PURPOSE,
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
} from "../src/constants/visitorOptions.js";
import {
  normalizePhone,
  visitorRegistrationSchema,
} from "../src/validation/visitorRegistration.js";

const TEST_MEETING_ID =
  "00000000-0000-4000-8000-000000000001";

assert.equal(
  normalizePhone("024 000 0000"),
  "+233240000000",
);

assert.equal(
  normalizePhone("233240000000"),
  "+233240000000",
);

assert.equal(
  normalizePhone("00442079460000"),
  "+442079460000",
);

const validOfficialMeetingRequest = {
  agency: MINISTRY_OF_FINANCE_AGENCY,
  consent: true,
  customMeetingTitle: "",
  division: MOF_DIVISIONS[0],
  email: "test.visitor@example.invalid",
  firstName: "Test",
  lastName: "Visitor",
  meetingId: TEST_MEETING_ID,
  organization: "Test Organisation",
  phone: "024 000 0000",
  purpose: MEETING_PURPOSE,
};

const validOfficialMeeting =
  visitorRegistrationSchema.safeParse(
    validOfficialMeetingRequest,
  );

assert.equal(validOfficialMeeting.success, true);

assert.equal(
  validOfficialMeeting.data.fullName,
  "Test Visitor",
);

assert.equal(
  validOfficialMeeting.data.phone,
  "+233240000000",
);

assert.equal(
  validOfficialMeeting.data.meetingId,
  TEST_MEETING_ID,
);

assert.equal(
  validOfficialMeeting.data.personVisiting,
  undefined,
);

const validCustomMeeting =
  visitorRegistrationSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    consent: true,
    customMeetingTitle:
      "  Stage Five   Budget Meeting  ",
    division: MOF_DIVISIONS[1],
    email: "",
    firstName: "Custom",
    lastName: "Meeting Visitor",
    meetingId: CUSTOM_MEETING_OPTION,
    organization: "",
    phone: "0240000000",
    purpose: MEETING_PURPOSE,
  });

assert.equal(validCustomMeeting.success, true);

assert.equal(
  validCustomMeeting.data.customMeetingTitle,
  "Stage Five Budget Meeting",
);

assert.equal(
  validCustomMeeting.data.meetingId,
  CUSTOM_MEETING_OPTION,
);

const validNonMeetingVisit =
  visitorRegistrationSchema.safeParse({
    agency: "GIPC",
    consent: true,
    customMeetingTitle: "",
    division: "",
    email: "",
    firstName: "External",
    lastName: "Visitor",
    meetingId: "",
    organization: "",
    personVisiting: "Test GIPC Officer",
    phone: "+233240000000",
    purpose: "Official",
  });

assert.equal(validNonMeetingVisit.success, true);

assert.equal(
  validNonMeetingVisit.data.fullName,
  "External Visitor",
);

assert.equal(
  validNonMeetingVisit.data.personVisiting,
  "Test GIPC Officer",
);

const customMeetingWithoutTitle =
  visitorRegistrationSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    consent: true,
    customMeetingTitle: "",
    division: MOF_DIVISIONS[0],
    email: "",
    firstName: "Test",
    lastName: "Visitor",
    meetingId: CUSTOM_MEETING_OPTION,
    organization: "",
    phone: "0240000000",
    purpose: MEETING_PURPOSE,
  });

assert.equal(customMeetingWithoutTitle.success, false);

const meetingWithoutSelection =
  visitorRegistrationSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    consent: true,
    customMeetingTitle: "",
    division: MOF_DIVISIONS[0],
    email: "",
    firstName: "Test",
    lastName: "Visitor",
    meetingId: "",
    organization: "",
    phone: "0240000000",
    purpose: MEETING_PURPOSE,
  });

assert.equal(meetingWithoutSelection.success, false);

const meetingWithPerson =
  visitorRegistrationSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    consent: true,
    customMeetingTitle: "",
    division: MOF_DIVISIONS[0],
    email: "",
    firstName: "Test",
    lastName: "Visitor",
    meetingId: TEST_MEETING_ID,
    organization: "",
    personVisiting: "Unexpected Officer",
    phone: "0240000000",
    purpose: MEETING_PURPOSE,
  });

assert.equal(meetingWithPerson.success, false);

const nonMeetingWithoutPerson =
  visitorRegistrationSchema.safeParse({
    agency: "PPA",
    consent: true,
    customMeetingTitle: "",
    division: "",
    email: "",
    firstName: "Test",
    lastName: "Visitor",
    meetingId: "",
    organization: "",
    personVisiting: "",
    phone: "0240000000",
    purpose: "Follow up",
  });

assert.equal(nonMeetingWithoutPerson.success, false);

const nonMeetingWithMeeting =
  visitorRegistrationSchema.safeParse({
    agency: "PPA",
    consent: true,
    customMeetingTitle: "",
    division: "",
    email: "",
    firstName: "Test",
    lastName: "Visitor",
    meetingId: TEST_MEETING_ID,
    organization: "",
    personVisiting: "Test Officer",
    phone: "0240000000",
    purpose: "Follow up",
  });

assert.equal(nonMeetingWithMeeting.success, false);

const ministryWithoutDivision =
  visitorRegistrationSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    consent: true,
    customMeetingTitle: "",
    division: "",
    email: "",
    firstName: "Test",
    lastName: "Visitor",
    meetingId: "",
    organization: "",
    personVisiting: "Test Officer",
    phone: "0240000000",
    purpose: "Official",
  });

assert.equal(ministryWithoutDivision.success, false);

const invalidRegistration =
  visitorRegistrationSchema.safeParse({
    agency: "Unknown Agency",
    consent: false,
    customMeetingTitle: "",
    division: "",
    email: "not-an-email",
    firstName: "",
    lastName: "",
    meetingId: "not-a-uuid",
    organization: "",
    personVisiting: "",
    phone: "123",
    purpose: "Unknown Purpose",
  });

assert.equal(invalidRegistration.success, false);

assert.deepEqual(REGISTRATION_RATE_LIMIT, {
  limit: 5,
  scope: "first-visit-registration",
  windowSeconds: 10 * 60,
});

const rejectedRegistrationMethod =
  await registerHandler.fetch(
    new Request("http://localhost/api/register", {
      method: "GET",
    }),
  );

assert.equal(rejectedRegistrationMethod.status, 405);

assert.equal(
  rejectedRegistrationMethod.headers.get("allow"),
  "POST",
);

const rejectedMeetingsMethod =
  await meetingsHandler.fetch(
    new Request("http://localhost/api/meetings", {
      method: "POST",
    }),
  );

assert.equal(rejectedMeetingsMethod.status, 405);

assert.equal(
  rejectedMeetingsMethod.headers.get("allow"),
  "GET",
);

const rejectedHostsMethod =
  await hostsHandler.fetch(
    new Request("http://localhost/api/hosts", {
      method: "POST",
    }),
  );

assert.equal(rejectedHostsMethod.status, 405);

assert.equal(
  rejectedHostsMethod.headers.get("allow"),
  "GET",
);

const validationRegisterHandler = createRegisterHandler({
  enforceRateLimitForRequest: async () => {},
});

const invalidBodyResponse =
  await validationRegisterHandler.fetch(
    new Request("http://localhost/api/register", {
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );

assert.equal(invalidBodyResponse.status, 400);

assert.equal(
  invalidBodyResponse.headers.get("cache-control"),
  "no-store",
);

let observedRateLimit = null;

const rateLimitedRegisterHandler = createRegisterHandler({
  enforceRateLimitForRequest: async (
    request,
    rateLimit,
  ) => {
    assert.equal(request.method, "POST");

    observedRateLimit = rateLimit;

    throw new RateLimitExceededError(
      rateLimit.windowSeconds,
    );
  },
});

const rateLimitedResponse =
  await rateLimitedRegisterHandler.fetch(
    new Request("http://localhost/api/register", {
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );

assert.deepEqual(
  observedRateLimit,
  REGISTRATION_RATE_LIMIT,
);

assert.equal(rateLimitedResponse.status, 429);

assert.equal(
  rateLimitedResponse.headers.get("retry-after"),
  String(REGISTRATION_RATE_LIMIT.windowSeconds),
);

assert.equal(
  rateLimitedResponse.headers.get("cache-control"),
  "no-store",
);

assert.deepEqual(
  await rateLimitedResponse.json(),
  {
    error:
      "Too many registration attempts. Please wait before trying again.",
  },
);

console.log(
  "Visitor registration validation checks passed.",
);