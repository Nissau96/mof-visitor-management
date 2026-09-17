import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  VISITOR_CARD_ENDPOINTS,
  admitVisitorWithCard,
  assignAdminVisitorCardTower,
  cancelPendingVisitorAdmission,
  checkoutCardVisitor,
  createAdminVisitorCards,
  getAdminVisitorCardInventory,
  getAvailableVisitorCards,
  getCheckedInCardVisitors,
  getPendingAdmissions,
  getVisitorCardIncidents,
  reprintDeactivatedVisitorCard,
  reportVisitorCardNotReturned,
  resolveVisitorCardIncident,
  startVisitorCardIncidentInvestigation,
} from "../../src/lib/visitorCardApi.js";

const ACCESS_TOKEN =
  "test-access-token";

const VISIT_ID =
  "11111111-1111-4111-8111-111111111111";

const CARD_ID =
  "22222222-2222-4222-8222-222222222222";

const INCIDENT_ID =
  "33333333-3333-4333-8333-333333333333";

const apiCases = [
  {
    body: {
      page: 1,
      pageSize: 10,
      search: "VIS-ABC123",
      tower: "tower_2",
    },
    call: getPendingAdmissions,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .pendingAdmissions,
    values: {
      accessToken: ACCESS_TOKEN,
      page: 1,
      pageSize: 10,
      search: "VIS-ABC123",
      tower: "tower_2",
    },
  },
  {
    body: {
      cardType: "vip",
      lastThreeDigits: "025",
      tower: "tower_2",
    },
    call: getAvailableVisitorCards,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .availableCards,
    values: {
      accessToken: ACCESS_TOKEN,
      cardType: "vip",
      lastThreeDigits: "025",
      tower: "tower_2",
    },
  },
  {
    body: {
      cardId: CARD_ID,
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    call: admitVisitorWithCard,
    endpoint:
      VISITOR_CARD_ENDPOINTS.admit,
    values: {
      accessToken: ACCESS_TOKEN,
      cardId: CARD_ID,
      tower: "tower_2",
      visitId: VISIT_ID,
    },
  },
  {
    body: {
      reason:
        "The visitor no longer requires admission.",
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    call:
      cancelPendingVisitorAdmission,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .cancelAdmission,
    values: {
      accessToken: ACCESS_TOKEN,
      reason:
        "The visitor no longer requires admission.",
      tower: "tower_2",
      visitId: VISIT_ID,
    },
  },
  {
    body: {
      cardStatus: "assigned",
      page: 2,
      pageSize: 10,
      search: "MOF-V025",
      tower: "tower_2",
    },
    call:
      getCheckedInCardVisitors,
    endpoint:
      VISITOR_CARD_ENDPOINTS.checkedIn,
    values: {
      accessToken: ACCESS_TOKEN,
      cardStatus: "assigned",
      page: 2,
      pageSize: 10,
      search: "MOF-V025",
      tower: "tower_2",
    },
  },
  {
    body: {
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    call: checkoutCardVisitor,
    endpoint:
      VISITOR_CARD_ENDPOINTS.checkout,
    values: {
      accessToken: ACCESS_TOKEN,
      tower: "tower_2",
      visitId: VISIT_ID,
    },
  },
  {
    body: {
      tower: "tower_2",
      visitId: VISIT_ID,
    },
    call:
      reportVisitorCardNotReturned,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .reportNotReturned,
    values: {
      accessToken: ACCESS_TOKEN,
      tower: "tower_2",
      visitId: VISIT_ID,
    },
  },
  {
    body: {
      page: 1,
      pageSize: 10,
      resolution: "all",
      search: "MOF-VIP025",
      status: "open",
      tower: "",
    },
    call: getVisitorCardIncidents,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .incidentList,
    values: {
      accessToken: ACCESS_TOKEN,
      page: 1,
      pageSize: 10,
      resolution: "all",
      search: "MOF-VIP025",
      status: "open",
      tower: "",
    },
  },
  {
    body: {
      incidentId: INCIDENT_ID,
      notes:
        "Investigation assigned for immediate follow-up.",
      tower: "",
    },
    call:
      startVisitorCardIncidentInvestigation,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .incidentStart,
    values: {
      accessToken: ACCESS_TOKEN,
      incidentId: INCIDENT_ID,
      notes:
        "Investigation assigned for immediate follow-up.",
      tower: "",
    },
  },
  {
    body: {
      incidentId: INCIDENT_ID,
      notes:
        "The card was confirmed lost after investigation.",
      resolution: "lost",
      tower: "",
    },
    call:
      resolveVisitorCardIncident,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .incidentResolve,
    values: {
      accessToken: ACCESS_TOKEN,
      incidentId: INCIDENT_ID,
      notes:
        "The card was confirmed lost after investigation.",
      resolution: "lost",
      tower: "",
    },
  },
  {
    body: {
      cardId: CARD_ID,
      notes:
        "Replacement card registered after the approved resolution.",
      tower: "",
    },
    call:
      reprintDeactivatedVisitorCard,
    endpoint:
      VISITOR_CARD_ENDPOINTS.reprint,
    values: {
      accessToken: ACCESS_TOKEN,
      cardId: CARD_ID,
      notes:
        "Replacement card registered after the approved resolution.",
      tower: "",
    },
  },
  {
    body: {
      cardType: "vip",
      page: 1,
      pageSize: 10,
      search: "",
      status: "available",
      tower: "tower_2",
    },
    call:
      getAdminVisitorCardInventory,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .adminInventory,
    values: {
      accessToken: ACCESS_TOKEN,
      cardType: "vip",
      page: 1,
      pageSize: 10,
      search: "",
      status: "available",
      tower: "tower_2",
    },
  },
  {
    body: {
      cardType: "vip",
      endNumber: 55,
      startNumber: 51,
      tower: "tower_2",
    },
    call: createAdminVisitorCards,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .adminCreate,
    values: {
      accessToken: ACCESS_TOKEN,
      cardType: "vip",
      endNumber: 55,
      startNumber: 51,
      tower: "tower_2",
    },
  },
  {
    body: {
      cardId: CARD_ID,
      tower: "tower_1",
    },
    call:
      assignAdminVisitorCardTower,
    endpoint:
      VISITOR_CARD_ENDPOINTS
        .adminAssignTower,
    values: {
      accessToken: ACCESS_TOKEN,
      cardId: CARD_ID,
      tower: "tower_1",
    },
  },
];

describe(
  "visitor-card API client",
  () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              requestAccepted: true,
            }),
            {
              headers: {
                "Content-Type":
                  "application/json",
              },
              status: 200,
            },
          ),
        ),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    for (const apiCase of apiCases) {
      it(
        `posts to ${apiCase.endpoint}`,
        async () => {
          const controller =
            new AbortController();

          const result =
            await apiCase.call({
              ...apiCase.values,
              signal:
                controller.signal,
            });

          expect(result).toEqual({
            requestAccepted: true,
          });

          expect(fetch).toHaveBeenCalledTimes(
            1,
          );

          const [
            path,
            requestOptions,
          ] = fetch.mock.calls[0];

          expect(path).toBe(
            apiCase.endpoint,
          );

          expect(
            requestOptions.method,
          ).toBe("POST");

          expect(
            requestOptions.signal,
          ).toBe(
            controller.signal,
          );

          expect(
            requestOptions.headers.get(
              "accept",
            ),
          ).toBe(
            "application/json",
          );

          expect(
            requestOptions.headers.get(
              "content-type",
            ),
          ).toBe(
            "application/json",
          );

          expect(
            requestOptions.headers.get(
              "authorization",
            ),
          ).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          );

          expect(
            JSON.parse(
              requestOptions.body,
            ),
          ).toEqual(apiCase.body);
        },
      );
    }
  },
);