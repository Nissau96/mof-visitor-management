import assert from "node:assert/strict";
import process from "node:process";
import checkInHandler, {
  createReturningCheckInHandler,
} from "../api/returning/check-in.js";
import {
  VERIFIED_VISITOR_AUDIENCE,
  createVerifiedVisitorToken,
  readVisitorToken,
} from "../api/_lib/visitorLookup.js";
import { PRIVACY_NOTICE_VERSION } from "../src/constants/privacy.js";
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

const validNonMeetingInput = {
  agency: "IAA",
  customMeetingTitle: "",
  division: "",
  meetingId: "",
  personVisiting: "Test Officer",
  privacyAcknowledged: true,
  purpose: "Official",
  verificationToken: firstToken,
};

const validNonMeeting =
  returningVisitCheckInSchema.safeParse(
    validNonMeetingInput,
  );

assert.equal(validNonMeeting.success, true);
assert.equal(
  validNonMeeting.data.personVisiting,
  "Test Officer",
);
assert.equal(
  validNonMeeting.data.privacyAcknowledged,
  true,
);

const validCustomMeeting =
  returningVisitCheckInSchema.safeParse({
    agency: MINISTRY_OF_FINANCE_AGENCY,
    customMeetingTitle:
      "Stage Seven Validation Meeting",
    division: "Budget Office",
    meetingId: CUSTOM_MEETING_OPTION,
    personVisiting: "",
    privacyAcknowledged: true,
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
    privacyAcknowledged: true,
    purpose: "Official",
    verificationToken: firstToken,
  });

assert.equal(invalidNonMeeting.success, false);

const missingPrivacyAcknowledgement =
  returningVisitCheckInSchema.safeParse({
    ...validNonMeetingInput,
    privacyAcknowledged: false,
  });

assert.equal(
  missingPrivacyAcknowledgement.success,
  false,
);

assert.equal(
  missingPrivacyAcknowledgement.error.issues.some(
    (issue) =>
      issue.path.join(".") ===
        "privacyAcknowledged" &&
      issue.message ===
        "Acknowledge the current privacy notice before continuing.",
  ),
  true,
);

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

const expectedReference = "VIS-PRIVACY2";

const validationHandler =
  createReturningCheckInHandler({
    async enforceRateLimitForRequest(
      request,
      options,
    ) {
      assert.equal(request.method, "POST");
      assert.deepEqual(options, {
        limit: 10,
        scope: "returning-visitor-check-in",
        windowSeconds: 10 * 60,
      });
    },
    getAdminClientForRequest() {
      return {
        async rpc(functionName, parameters) {
          assert.equal(
            functionName,
            "register_return_visit",
          );

          assert.deepEqual(parameters, {
            p_consent_version:
              PRIVACY_NOTICE_VERSION,
            p_custom_meeting_title: "",
            p_destination_agency: "IAA",
            p_destination_division: "",
            p_meeting_id: null,
            p_person_visiting: "Test Officer",
            p_purpose: "Official",
            p_token_expires_at: new Date(
              firstTokenData.expiresAt * 1000,
            ).toISOString(),
            p_verification_token_id:
              firstTokenData.tokenId,
            p_visitor_id: visitorId,
          });

          return {
            data: [
              {
                reference_code: expectedReference,
              },
            ],
            error: null,
          };
        },
      };
    },
    readVisitorTokenForRequest(
      token,
      audience,
    ) {
      assert.equal(token, firstToken);
      assert.equal(
        audience,
        VERIFIED_VISITOR_AUDIENCE,
      );

      return firstTokenData;
    },
  });

const successfulCheckInResponse =
  await validationHandler.fetch(
    new Request(
      "http://localhost/api/returning/check-in",
      {
        body: JSON.stringify(
          validNonMeetingInput,
        ),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ),
  );

assert.equal(successfulCheckInResponse.status, 201);
assert.deepEqual(
  await successfulCheckInResponse.json(),
  {
    reference: expectedReference,
  },
);

assert.equal(PRIVACY_NOTICE_VERSION, "2.0");

console.log(
  "Returning visitor check-in validation checks passed.",
);