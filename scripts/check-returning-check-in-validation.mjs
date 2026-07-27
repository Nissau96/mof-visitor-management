import assert from "node:assert/strict";
import process from "node:process";
import checkInHandler from "../api/returning/check-in.js";
import {
  VERIFIED_VISITOR_AUDIENCE,
  createVerifiedVisitorToken,
  readVisitorToken,
} from "../api/_lib/visitorLookup.js";
import {
  CUSTOM_MEETING_OPTION,
  MINISTRY_OF_FINANCE_AGENCY,
} from "../src/constants/visitorOptions.js";
import { returningVisitCheckInSchema } from "../src/validation/returningVisit.js";

process.env.VISITOR_LOOKUP_SECRET =
  "stage-seven-test-secret-that-is-longer-than-thirty-two-bytes";

const visitorId =
  "00000000-0000-4000-8000-000000000007";

const firstToken =
  createVerifiedVisitorToken(visitorId);

const secondToken =
  createVerifiedVisitorToken(visitorId);

assert.notEqual(firstToken, secondToken);

const firstTokenData = readVisitorToken(
  firstToken,
  VERIFIED_VISITOR_AUDIENCE,
);

const secondTokenData = readVisitorToken(
  secondToken,
  VERIFIED_VISITOR_AUDIENCE,
);

assert.equal(firstTokenData.visitorId, visitorId);
assert.match(
  firstTokenData.tokenId,
  /^[0-9a-f-]{36}$/i,
);

assert.notEqual(
  firstTokenData.tokenId,
  secondTokenData.tokenId,
);

const validNonMeeting =
  returningVisitCheckInSchema.safeParse({
    agency: "IAA",
    customMeetingTitle: "",
    division: "",
    meetingId: "",
    personVisiting: "Test Officer",
    purpose: "Official",
    verificationToken: firstToken,
  });

assert.equal(validNonMeeting.success, true);
assert.equal(
  validNonMeeting.data.personVisiting,
  "Test Officer",
);

const validCustomMeeting =
  returningVisitCheckInSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    customMeetingTitle:
      "Stage Seven Validation Meeting",
    division: "Budget Office",
    meetingId: CUSTOM_MEETING_OPTION,
    personVisiting: "",
    purpose: "Meeting",
    verificationToken: firstToken,
  });

assert.equal(validCustomMeeting.success, true);
assert.equal(
  validCustomMeeting.data.customMeetingTitle,
  "Stage Seven Validation Meeting",
);
assert.equal(
  validCustomMeeting.data.personVisiting,
  undefined,
);

const invalidNonMeeting =
  returningVisitCheckInSchema.safeParse({
    agency: "IAA",
    customMeetingTitle: "",
    division: "",
    meetingId: "",
    personVisiting: "",
    purpose: "Official",
    verificationToken: firstToken,
  });

assert.equal(invalidNonMeeting.success, false);

const rejectedMethod = await checkInHandler.fetch(
  new Request(
    "http://localhost/api/returning/check-in",
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

const invalidBodyResponse =
  await checkInHandler.fetch(
    new Request(
      "http://localhost/api/returning/check-in",
      {
        body: JSON.stringify({}),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ),
  );

assert.equal(invalidBodyResponse.status, 400);

console.log(
  "Returning visitor check-in validation checks passed.",
);