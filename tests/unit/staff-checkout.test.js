import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  STAFF_VISITOR_CARD_WRITE_RATE_LIMITS,
  createCheckoutHandler,
} from "../../api/staff/checkout.js";

const VISIT_ID =
  "11111111-1111-4111-8111-111111111111";

const CARD_ID =
  "22222222-2222-4222-8222-222222222222";

const INCIDENT_ID =
  "33333333-3333-4333-8333-333333333333";

const USER_ID =
  "44444444-4444-4444-8444-444444444444";

function createRequest(
  path,
  body,
) {
  return new Request(
    `http://localhost${path}`,
    {
      body: JSON.stringify(body),
      headers: {
        "Content-Type":
          "application/json",
      },
      method: "POST",
    },
  );
}

async function readResponse(response) {
  return {
    body: await response.json(),
    response,
  };
}

function createProfile(
  role = "receptionist",
) {
  return {
    active: true,
    fullName: "Test Staff",
    passwordChangeRequired: false,
    passwordSetupCompletedAt:
      "2026-08-28T08:00:00.000Z",
    role,
    temporaryPasswordExpiresAt:
      null,
    userId: USER_ID,
  };
}

function createHandler({
  data,
  databaseError = null,
  profile = createProfile(),
} = {}) {
  const enforceRateLimitForRequest =
    vi.fn().mockResolvedValue(undefined);

  const rpc = vi
    .fn()
    .mockResolvedValue({
      data,
      error: databaseError,
    });

  const requireActiveStaffForRequest =
    vi.fn().mockResolvedValue({
      profile,
    });

  const handler =
    createCheckoutHandler({
      enforceRateLimitForRequest,
      getAdminClientForRequest() {
        return {
          rpc,
        };
      },
      requireActiveStaffForRequest,
    });

  return {
    enforceRateLimitForRequest,
    handler,
    requireActiveStaffForRequest,
    rpc,
  };
}

const operationCases = [
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      page: 1,
      pageSize: 10,
      search: "",
      tower: "tower_2",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_page: 1,
      p_page_size: 10,
      p_search: "",
      p_tower: "tower_2",
    },
    expectedResponse: {
      admissions: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
      scope: {
        role: "receptionist",
        tower: "tower_2",
      },
    },
    operation: "pending-list",
    path: "/api/staff/cards/pending",
    rateLimited: false,
    role: "receptionist",
    rpcName:
      "get_pending_visitor_admissions",
  },
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      cardType: "vip",
      lastThreeDigits: "025",
      tower: "tower_2",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_card_type: "vip",
      p_last_three_digits: "025",
      p_tower: "tower_2",
    },
    expectedResponse: {
      cards: [
        {
          cardId: CARD_ID,
          cardNumber: "MOF-VIP025",
          cardType: "vip",
          status: "available",
          tower: "tower_2",
        },
      ],
      cardType: "vip",
      tower: "tower_2",
    },
    operation: "card-search",
    path: "/api/staff/cards/search",
    rateLimited: false,
    role: "receptionist",
    rpcName:
      "get_available_visitor_cards",
  },
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      cardId: CARD_ID,
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_card_id: CARD_ID,
      p_tower: "tower_2",
      p_visit_id: VISIT_ID,
    },
    expectedResponse: {
      admitted: true,
      cardAssignment: {
        assignedAt:
          "2026-08-28T09:00:00.000Z",
        assignmentId:
          "55555555-5555-4555-8555-555555555555",
        cardId: CARD_ID,
        cardNumber: "MOF-VIP025",
        returnDueAt:
          "2026-08-29T09:00:00.000Z",
        status: "assigned",
      },
      visit: {
        checkedInAt:
          "2026-08-28T09:00:00.000Z",
        referenceCode: "VIS-ABC123",
        status: "checked_in",
        tower: "tower_2",
        visitId: VISIT_ID,
        visitorId:
          "66666666-6666-4666-8666-666666666666",
      },
    },
    operation: "admission",
    path: "/api/staff/cards/admit",
    rateLimited: true,
    role: "receptionist",
    rpcName:
      "admit_visitor_with_card",
  },
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      reason:
        "The visitor no longer requires admission.",
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_reason:
        "The visitor no longer requires admission.",
      p_tower: "tower_2",
      p_visit_id: VISIT_ID,
    },
    expectedResponse: {
      admissionCancelled: true,
      status: "cancelled",
      visitId: VISIT_ID,
    },
    operation: "admission-cancel",
    path: "/api/staff/cards/cancel",
    rateLimited: true,
    role: "receptionist",
    rpcName:
      "cancel_pending_visitor_admission",
  },
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      cardStatus: "all",
      page: 1,
      pageSize: 10,
      search: "",
      tower: "tower_2",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_card_status: "all",
      p_page: 1,
      p_page_size: 10,
      p_search: "",
      p_tower: "tower_2",
    },
    expectedResponse: {
      filters: {
        cardStatus: "all",
        search: "",
      },
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
      scope: {
        role: "receptionist",
        tower: "tower_2",
      },
      visitors: [],
    },
    operation: "checked-in-list",
    path:
      "/api/staff/cards/checked-in",
    rateLimited: false,
    role: "receptionist",
    rpcName:
      "get_checked_in_card_visitors",
  },
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_tower: "tower_2",
      p_visit_id: VISIT_ID,
    },
    expectedResponse: {
      checkout: {
        alreadyCheckedOut: false,
        checkedOutAt:
          "2026-08-28T10:00:00.000Z",
        reference: "VIS-ABC123",
        status: "checked_out",
        tower: "tower_2",
        visitId: VISIT_ID,
      },
    },
    operation: "checkout",
    path: "/api/staff/checkout",
    rateLimited: true,
    role: "receptionist",
    rpcData: {
      alreadyCheckedOut: false,
      card: {
        cardId: CARD_ID,
        cardNumber: "MOF-VIP025",
        status: "available",
      },
      cardReturned: true,
      checkedOutAt:
        "2026-08-28T10:00:00.000Z",
      reference: "VIS-ABC123",
      status: "checked_out",
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    rpcName: "checkout_visit",
  },
  {
    allowedRoles: [
      "receptionist",
      "admin",
    ],
    body: {
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_tower: "tower_2",
      p_visit_id: VISIT_ID,
    },
    expectedResponse: {
      alreadyReported: false,
      card: {
        cardId: CARD_ID,
        cardNumber: "MOF-VIP025",
        status: "not_returned",
      },
      checkedOutAt:
        "2026-08-28T10:00:00.000Z",
      incidentId: INCIDENT_ID,
      reference: "VIS-ABC123",
      reportedNotReturned: true,
      visitId: VISIT_ID,
      visitorId:
        "66666666-6666-4666-8666-666666666666",
    },
    operation: "report-not-returned",
    path:
      "/api/staff/cards/report-not-returned",
    rateLimited: true,
    role: "receptionist",
    rpcName:
      "report_visitor_card_not_returned",
  },
  {
    allowedRoles: [
      "receptionist",
      "client_service_head",
      "admin",
    ],
    body: {
      page: 1,
      pageSize: 10,
      resolution: "all",
      search: "",
      status: "all",
      tower: "",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_page: 1,
      p_page_size: 10,
      p_resolution: "all",
      p_search: "",
      p_status: "all",
      p_tower: "",
    },
    expectedResponse: {
      filters: {
        resolution: "all",
        search: "",
        status: "all",
      },
      incidents: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
      scope: {
        role: "client_service_head",
        tower: null,
      },
      summary: {
        investigatingCount: 0,
        openCount: 0,
        resolvedCount: 0,
      },
    },
    operation: "incident-list",
    path:
      "/api/staff/cards/incidents",
    rateLimited: false,
    role: "client_service_head",
    rpcName:
      "get_visitor_card_incidents",
  },
  {
    allowedRoles: [
      "client_service_head",
      "admin",
    ],
    body: {
      incidentId: INCIDENT_ID,
      notes:
        "Investigation assigned for immediate follow-up.",
      tower: "",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_incident_id: INCIDENT_ID,
      p_notes:
        "Investigation assigned for immediate follow-up.",
      p_tower: "",
    },
    expectedResponse: {
      alreadyInvestigating: false,
      assignedTo: USER_ID,
      cardNumber: "MOF-VIP025",
      incidentId: INCIDENT_ID,
      investigationStarted: true,
      startedAt:
        "2026-08-28T10:30:00.000Z",
    },
    operation: "incident-start",
    path:
      "/api/staff/cards/incidents/start",
    rateLimited: true,
    role: "client_service_head",
    rpcName:
      "start_visitor_card_incident_investigation",
  },
  {
    allowedRoles: [
      "client_service_head",
      "admin",
    ],
    body: {
      incidentId: INCIDENT_ID,
      notes:
        "The card was confirmed lost after investigation.",
      resolution: "lost",
      tower: "",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_incident_id: INCIDENT_ID,
      p_notes:
        "The card was confirmed lost after investigation.",
      p_resolution: "lost",
      p_tower: "",
    },
    expectedResponse: {
      alreadyResolved: false,
      card: {
        cardId: CARD_ID,
        cardNumber: "MOF-VIP025",
        status: "deactivated",
      },
      incidentId: INCIDENT_ID,
      incidentResolved: true,
      requiresReprint: true,
      resolution: "lost",
      resolvedAt:
        "2026-08-28T11:00:00.000Z",
    },
    operation: "incident-resolve",
    path:
      "/api/staff/cards/incidents/resolve",
    rateLimited: true,
    role: "client_service_head",
    rpcName:
      "resolve_visitor_card_incident",
  },
  {
    allowedRoles: [
      "client_service_head",
      "admin",
    ],
    body: {
      cardId: CARD_ID,
      notes:
        "Replacement card registered following the approved incident resolution.",
      tower: "",
    },
    expectedArguments: {
      p_actor_id: USER_ID,
      p_card_id: CARD_ID,
      p_notes:
        "Replacement card registered following the approved incident resolution.",
      p_tower: "",
    },
    expectedResponse: {
      alreadyRegistered: false,
      oldCardNumber: "MOF-VIP025",
      replacementCard: {
        baseNumber: 25,
        cardId:
          "77777777-7777-4777-8777-777777777777",
        cardNumber: "MOF-VIP025-R1",
        cardType: "vip",
        replacementSequence: 1,
        status: "available",
        tower: "tower_2",
      },
      replacementRegistered: true,
    },
    operation: "card-reprint",
    path:
      "/api/staff/cards/reprint",
    rateLimited: true,
    role: "client_service_head",
    rpcName:
      "reprint_deactivated_visitor_card",
  },
];

describe(
  "consolidated visitor-card staff API",
  () => {
    for (const operationCase of operationCases) {
      it(
        `dispatches ${operationCase.operation}`,
        async () => {
          const rpcData =
            operationCase.rpcData ||
            operationCase.expectedResponse;

          const {
            enforceRateLimitForRequest,
            handler,
            requireActiveStaffForRequest,
            rpc,
          } = createHandler({
            data: rpcData,
            profile: createProfile(
              operationCase.role,
            ),
          });

          const request =
            createRequest(
              operationCase.path,
              operationCase.body,
            );

          const result =
            await readResponse(
              await handler.fetch(
                request,
              ),
            );

          expect(
            result.response.status,
          ).toBe(200);

          expect(result.body).toEqual(
            operationCase.expectedResponse,
          );

          expect(
            requireActiveStaffForRequest,
          ).toHaveBeenCalledWith(
            expect.any(Request),
            operationCase.allowedRoles,
          );

          expect(rpc).toHaveBeenCalledWith(
            operationCase.rpcName,
            operationCase.expectedArguments,
          );

          if (
            operationCase.rateLimited
          ) {
            expect(
              enforceRateLimitForRequest,
            ).toHaveBeenCalledWith(
              expect.any(Request),
              {
                ...STAFF_VISITOR_CARD_WRITE_RATE_LIMITS[
                  operationCase.operation
                ],
                keyMode: "subject",
                subject: USER_ID,
              },
            );
          } else {
            expect(
              enforceRateLimitForRequest,
            ).not.toHaveBeenCalled();
          }
        },
      );
    }

    it(
      "supports operation query dispatch used by Vercel rewrites",
      async () => {
        const data = {
          admissions: [],
          pagination: {
            page: 1,
            pageSize: 10,
            totalCount: 0,
            totalPages: 0,
          },
          scope: {
            role: "receptionist",
            tower: "tower_2",
          },
        };

        const {
          handler,
          rpc,
        } = createHandler({
          data,
        });

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/staff/checkout?operation=pending-list",
                {
                  page: 1,
                  pageSize: 10,
                  search: "",
                  tower: "tower_2",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(200);

        expect(result.body).toEqual(data);

        expect(rpc).toHaveBeenCalledWith(
          "get_pending_visitor_admissions",
          {
            p_actor_id: USER_ID,
            p_page: 1,
            p_page_size: 10,
            p_search: "",
            p_tower: "tower_2",
          },
        );
      },
    );

    it(
      "rejects an unknown visitor-card operation before authentication",
      async () => {
        const {
          handler,
          requireActiveStaffForRequest,
          rpc,
        } = createHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/staff/cards/unknown",
                {},
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(404);

        expect(result.body.error).toBe(
          "Visitor-card operation not found.",
        );

        expect(
          requireActiveStaffForRequest,
        ).not.toHaveBeenCalled();

        expect(rpc).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects invalid card-search input before querying the database",
      async () => {
        const {
          handler,
          rpc,
        } = createHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/staff/cards/search",
                {
                  cardType: "vip",
                  lastThreeDigits:
                    "25",
                  tower: "tower_2",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(400);

        expect(result.body.error).toBe(
          "Enter valid visitor-card details.",
        );

        expect(rpc).not.toHaveBeenCalled();
      },
    );

    it(
      "maps database state conflicts to HTTP 409",
      async () => {
        const {
          handler,
        } = createHandler({
          databaseError: {
            code: "55000",
            message:
              "Visitor card is not available",
          },
        });

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/staff/cards/admit",
                {
                  cardId: CARD_ID,
                  tower: "tower_2",
                  visitId: VISIT_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(result.body.error).toBe(
          "The visitor could not be admitted with this card.",
        );
      },
    );

    it(
      "maps database permission failures to HTTP 403",
      async () => {
        const {
          handler,
        } = createHandler({
          databaseError: {
            code: "42501",
            message:
              "Permission denied",
          },
          profile: createProfile(
            "client_service_head",
          ),
        });

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/staff/cards/incidents/start",
                {
                  incidentId:
                    INCIDENT_ID,
                  notes:
                    "Investigation assigned for follow-up.",
                  tower: "",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(403);

        expect(result.body.error).toBe(
          "You do not have permission to perform this visitor-card operation.",
        );
      },
    );

    it(
      "rejects malformed database responses",
      async () => {
        const {
          handler,
        } = createHandler({
          data: {
            admissions: "invalid",
          },
        });

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/staff/cards/pending",
                {
                  page: 1,
                  pageSize: 10,
                  search: "",
                  tower: "tower_2",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(500);

        expect(result.body.error).toBe(
          "Pending admissions could not be loaded. Please try again.",
        );
      },
    );
  },
);
