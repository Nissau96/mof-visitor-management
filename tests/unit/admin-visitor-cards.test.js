import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dependencyMocks =
  vi.hoisted(() => ({
    enforceRateLimit: vi.fn(),
    getAdminClient: vi.fn(),
    requireActiveStaff: vi.fn(),
  }));

vi.mock(
  "../../api/_lib/staffAuth.js",
  () => ({
    requireActiveStaff:
      dependencyMocks.requireActiveStaff,
  }),
);

vi.mock(
  "../../api/_lib/supabase.js",
  () => ({
    getAdminClient:
      dependencyMocks.getAdminClient,
  }),
);

vi.mock(
  "../../api/_lib/rateLimit.js",
  async (importOriginal) => {
    const actual =
      await importOriginal();

    return {
      ...actual,
      enforceRateLimit:
        dependencyMocks.enforceRateLimit,
    };
  },
);

import {
  ADMIN_WRITE_RATE_LIMITS,
  createAdminHandler,
} from "../../api/admin.js";

const ADMIN_USER_ID =
  "11111111-1111-4111-8111-111111111111";

const CARD_ID =
  "22222222-2222-4222-8222-222222222222";

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

function configureDatabaseResult({
  data = null,
  error = null,
} = {}) {
  const rpc = vi
    .fn()
    .mockResolvedValue({
      data,
      error,
    });

  dependencyMocks.getAdminClient
    .mockReturnValue({
      rpc,
    });

  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();

  dependencyMocks.requireActiveStaff
    .mockResolvedValue({
      profile: {
        active: true,
        fullName:
          "Test Super Administrator",
        passwordChangeRequired:
          false,
        passwordSetupCompletedAt:
          "2026-08-28T08:00:00.000Z",
        role: "admin",
        temporaryPasswordExpiresAt:
          null,
        userId: ADMIN_USER_ID,
      },
    });

  dependencyMocks.enforceRateLimit
    .mockResolvedValue(undefined);
});

describe(
  "administrator visitor-card operations",
  () => {
    it(
      "loads the visitor-card inventory",
      async () => {
        const databaseResult = {
          cards: [],
          filters: {
            cardType: "all",
            search: "",
            status: "all",
            tower: "all",
          },
          pagination: {
            page: 1,
            pageSize: 10,
            totalCount: 0,
            totalPages: 0,
          },
          summary: {
            assignedCount: 0,
            availableCount: 349,
            deactivatedCount: 0,
            investigatingCount: 0,
            notReturnedCount: 0,
            regularCount: 299,
            tower1Count: 100,
            tower2Count: 249,
            vipCount: 50,
          },
        };

        const rpc =
          configureDatabaseResult({
            data: databaseResult,
          });

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin/cards/inventory",
                {
                  cardType: "all",
                  page: 1,
                  pageSize: 10,
                  search: "",
                  status: "all",
                  tower: "all",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(200);

        expect(result.body).toEqual(
          databaseResult,
        );

        expect(
          dependencyMocks
            .requireActiveStaff,
        ).toHaveBeenCalledWith(
          expect.any(Request),
          ["admin"],
        );

        expect(
          dependencyMocks
            .enforceRateLimit,
        ).not.toHaveBeenCalled();

        expect(rpc).toHaveBeenCalledWith(
          "get_admin_visitor_card_inventory",
          {
            p_actor_id:
              ADMIN_USER_ID,
            p_card_type: "all",
            p_page: 1,
            p_page_size: 10,
            p_search: "",
            p_status: "all",
            p_tower: "all",
          },
        );
      },
    );

    it(
      "creates a controlled range of visitor cards",
      async () => {
        const databaseResult = {
          cardCount: 3,
          cards: [
            {
              baseNumber: 300,
              cardId:
                "33333333-3333-4333-8333-333333333333",
              cardNumber:
                "MOF-V300",
              cardType: "regular",
              status: "available",
              tower: "tower_1",
            },
            {
              baseNumber: 301,
              cardId:
                "44444444-4444-4444-8444-444444444444",
              cardNumber:
                "MOF-V301",
              cardType: "regular",
              status: "available",
              tower: "tower_1",
            },
            {
              baseNumber: 302,
              cardId:
                "55555555-5555-4555-8555-555555555555",
              cardNumber:
                "MOF-V302",
              cardType: "regular",
              status: "available",
              tower: "tower_1",
            },
          ],
          cardsCreated: true,
          cardType: "regular",
          tower: "tower_1",
        };

        const rpc =
          configureDatabaseResult({
            data: databaseResult,
          });

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin/cards/create",
                {
                  cardType: "regular",
                  endNumber: 302,
                  startNumber: 300,
                  tower: "tower_1",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(201);

        expect(result.body).toEqual(
          databaseResult,
        );

        expect(
          dependencyMocks
            .enforceRateLimit,
        ).toHaveBeenCalledWith(
          expect.any(Request),
          {
            ...ADMIN_WRITE_RATE_LIMITS[
              "card-create"
            ],
            keyMode: "subject",
            subject: ADMIN_USER_ID,
          },
        );

        expect(rpc).toHaveBeenCalledWith(
          "create_admin_visitor_cards",
          {
            p_actor_id:
              ADMIN_USER_ID,
            p_card_type: "regular",
            p_end_number: 302,
            p_start_number: 300,
            p_tower: "tower_1",
          },
        );
      },
    );

    it(
      "assigns an available card to another tower",
      async () => {
        const databaseResult = {
          alreadyAssigned: false,
          cardId: CARD_ID,
          cardNumber: "MOF-VIP025",
          cardType: "vip",
          previousTower: "tower_2",
          tower: "tower_1",
          towerAssigned: true,
        };

        const rpc =
          configureDatabaseResult({
            data: databaseResult,
          });

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin/cards/assign-tower",
                {
                  cardId: CARD_ID,
                  tower: "tower_1",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(200);

        expect(result.body).toEqual(
          databaseResult,
        );

        expect(
          dependencyMocks
            .enforceRateLimit,
        ).toHaveBeenCalledWith(
          expect.any(Request),
          {
            ...ADMIN_WRITE_RATE_LIMITS[
              "card-tower-assign"
            ],
            keyMode: "subject",
            subject: ADMIN_USER_ID,
          },
        );

        expect(rpc).toHaveBeenCalledWith(
          "assign_admin_visitor_card_tower",
          {
            p_actor_id:
              ADMIN_USER_ID,
            p_card_id: CARD_ID,
            p_tower: "tower_1",
          },
        );
      },
    );

    it(
      "supports query dispatch used by Vercel rewrites",
      async () => {
        const databaseResult = {
          cards: [],
          filters: {
            cardType: "vip",
            search: "",
            status: "available",
            tower: "tower_2",
          },
          pagination: {
            page: 1,
            pageSize: 10,
            totalCount: 50,
            totalPages: 5,
          },
          summary: {
            assignedCount: 0,
            availableCount: 50,
            deactivatedCount: 0,
            investigatingCount: 0,
            notReturnedCount: 0,
            regularCount: 0,
            tower1Count: 0,
            tower2Count: 50,
            vipCount: 50,
          },
        };

        const rpc =
          configureDatabaseResult({
            data: databaseResult,
          });

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin?operation=card-inventory",
                {
                  cardType: "vip",
                  page: 1,
                  pageSize: 10,
                  search: "",
                  status: "available",
                  tower: "tower_2",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(200);

        expect(result.body).toEqual(
          databaseResult,
        );

        expect(rpc).toHaveBeenCalledWith(
          "get_admin_visitor_card_inventory",
          {
            p_actor_id:
              ADMIN_USER_ID,
            p_card_type: "vip",
            p_page: 1,
            p_page_size: 10,
            p_search: "",
            p_status: "available",
            p_tower: "tower_2",
          },
        );
      },
    );

    it(
      "rejects an invalid creation range before database access",
      async () => {
        const rpc =
          configureDatabaseResult();

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin/cards/create",
                {
                  cardType: "regular",
                  endNumber: 300,
                  startNumber: 301,
                  tower: "tower_1",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(400);

        expect(result.body.error).toBe(
          "The visitor-card information is invalid.",
        );

        expect(rpc).not.toHaveBeenCalled();
      },
    );

    it(
      "maps duplicate card numbers to HTTP 409",
      async () => {
        configureDatabaseResult({
          error: {
            code: "23505",
            message:
              "duplicate key value violates unique constraint",
          },
        });

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin/cards/create",
                {
                  cardType: "vip",
                  endNumber: 51,
                  startNumber: 51,
                  tower: "tower_2",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(result.body.error).toBe(
          "One or more of these visitor-card numbers already exist.",
        );
      },
    );

    it(
      "rejects malformed inventory responses",
      async () => {
        configureDatabaseResult({
          data: {
            cards: "invalid",
            filters: {},
            pagination: {},
            summary: {},
          },
        });

        const handler =
          createAdminHandler();

        const result =
          await readResponse(
            await handler.fetch(
              createRequest(
                "/api/admin/cards/inventory",
                {
                  cardType: "all",
                  page: 1,
                  pageSize: 10,
                  search: "",
                  status: "all",
                  tower: "all",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(500);

        expect(result.body.error).toBe(
          "Visitor-card inventory could not be loaded. Please try again.",
        );
      },
    );
  },
);