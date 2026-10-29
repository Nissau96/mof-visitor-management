import {
  RateLimitExceededError,
  enforceRateLimit,
} from "./_lib/rateLimit.js";
import { getAdminClient } from "./_lib/supabase.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "./_lib/http.js";
import {
  requireActiveStaff,
  requireStaffTowerScope,
} from "./_lib/staffAuth.js";
import { readWeeklyQrAccess } from "../src/server/weeklyQrAccess.js";
import {
  meetingDeleteSchema,
  meetingListSchema,
  meetingSaveSchema,
  meetingStatusSchema,
} from "../src/validation/meetings.js";

export const MEETING_DIRECTORY_RATE_LIMIT =
  Object.freeze({
    limit: 300,
    scope: "public-meeting-directory",
    windowSeconds: 10 * 60,
  });

const MEETING_WRITE_RATE_LIMIT = Object.freeze({
  limit: 120,
  scope: "staff-meeting-changes",
  windowSeconds: 10 * 60,
});

const MEETING_VIEW_ROLES = Object.freeze([
  "receptionist",
  "client_service_head",
  "admin",
]);

const MEETING_MANAGER_ROLES = Object.freeze([
  "receptionist",
  "admin",
]);

// Staff operations reach this function through vercel.json rewrites
// (/api/staff/meetings/* → /api/meetings?operation=…), so meeting
// management does not need its own Vercel Function.
const STAFF_OPERATIONS = Object.freeze({
  "staff-delete": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    rpcName: "delete_staff_meeting",
    schema: meetingDeleteSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_meeting_id: values.meetingId,
      p_tower: tower,
    }),
    unexpected:
      "The meeting could not be deleted. Please try again.",
    write: true,
  }),
  "staff-list": Object.freeze({
    allowedRoles: MEETING_VIEW_ROLES,
    rpcName: "get_staff_meetings",
    schema: meetingListSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_from: values.from || null,
      p_page: values.page,
      p_page_size: values.pageSize,
      p_search: values.search,
      p_to: values.to || null,
      p_tower: tower,
      p_view: values.view,
    }),
    unexpected:
      "Meetings could not be loaded. Please try again.",
    write: false,
  }),
  "staff-save": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    rpcName: "save_staff_meeting",
    schema: meetingSaveSchema,
    toArguments: ({ meeting }, actorId, tower) => ({
      p_actor_id: actorId,
      p_ends_at: meeting.endsAt || null,
      p_ends_on:
        meeting.scheduleType === "single"
          ? meeting.startsOn
          : meeting.endsOn || null,
      p_host_division: meeting.hostDivision,
      p_meeting_id: meeting.meetingId,
      p_meeting_tower: meeting.meetingTower,
      p_recurrence_days:
        meeting.scheduleType === "weekly"
          ? [...new Set(meeting.recurrenceDays)].sort()
          : [],
      p_schedule_type: meeting.scheduleType,
      p_starts_at: meeting.startsAt || null,
      p_starts_on: meeting.startsOn,
      p_title: meeting.title,
      p_tower: tower,
      p_venue: meeting.venue,
    }),
    unexpected:
      "The meeting could not be saved. Please try again.",
    write: true,
  }),
  "staff-status": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    rpcName: "set_staff_meeting_active",
    schema: meetingStatusSchema,
    toArguments: (values, actorId, tower) => ({
      p_active: values.active,
      p_actor_id: actorId,
      p_meeting_id: values.meetingId,
      p_tower: tower,
    }),
    unexpected:
      "The meeting status could not be changed. Please try again.",
    write: true,
  }),
});

function getDatabaseError(error, fallback) {
  // The meeting functions raise these codes with messages written for
  // staff, so they are shown as they are.
  switch (error?.code) {
    case "P0002":
      return new HttpError(
        "The meeting could not be found. Refresh the list and try again.",
        404,
      );
    case "42501":
      return new HttpError(
        error.message ||
          "You do not have permission to manage this meeting.",
        403,
      );
    case "55000":
      return new HttpError(error.message || fallback, 409);
    case "22023":
    case "23514":
      return new HttpError(
        error.message ||
          "Check the meeting details and try again.",
        400,
      );
    default:
      return new HttpError(fallback, 500);
  }
}

async function handleAvailableMeetings(
  request,
  enforceRateLimitForRequest,
  getAdminClientForRequest,
) {
  readWeeklyQrAccess(request);

  await enforceRateLimitForRequest(
    request,
    MEETING_DIRECTORY_RATE_LIMIT,
  );

  const { data, error } =
    await getAdminClientForRequest().rpc(
      "get_available_meeting_options",
    );

  if (error) {
    return json(
      {
        error:
          "Available meetings could not be loaded. Please try again.",
      },
      500,
    );
  }

  const meetings = Array.isArray(data)
    ? data.map((meeting) => ({
        endsAt: meeting.endsAt || null,
        id: meeting.id,
        startsAt: meeting.startsAt || null,
        title: meeting.title,
        venue: meeting.venue || null,
      }))
    : [];

  return json(
    {
      meetings,
    },
    200,
  );
}

async function handleStaffOperation(
  request,
  configuration,
  {
    enforceRateLimitForRequest,
    getAdminClientForRequest,
    requireActiveStaffForRequest,
  },
) {
  const { profile } =
    await requireActiveStaffForRequest(
      request,
      configuration.allowedRoles,
    );

  if (configuration.write) {
    await enforceRateLimitForRequest(request, {
      ...MEETING_WRITE_RATE_LIMIT,
      keyMode: "subject",
      subject: profile.userId,
    });
  }

  const body = await readJsonBody(request);
  const parsed =
    configuration.schema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      parsed.error.issues[0]?.message ||
        "The meeting request is invalid.",
      400,
    );
  }

  const tower = requireStaffTowerScope(
    profile,
    parsed.data.tower,
  );

  const { data, error } =
    await getAdminClientForRequest().rpc(
      configuration.rpcName,
      configuration.toArguments(
        parsed.data,
        profile.userId,
        tower,
      ),
    );

  if (error) {
    throw getDatabaseError(
      error,
      configuration.unexpected,
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new HttpError(
      configuration.unexpected,
      500,
    );
  }

  return json(data, 200);
}

export function createMeetingsHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
  requireActiveStaffForRequest = requireActiveStaff,
} = {}) {
  return {
    async fetch(request) {
      const operation =
        new URL(request.url).searchParams.get(
          "operation",
        ) || "";

      const staffConfiguration =
        STAFF_OPERATIONS[operation];

      if (operation && !staffConfiguration) {
        return json(
          {
            error: "Meeting operation not found.",
          },
          404,
        );
      }

      if (
        request.method !==
        (staffConfiguration ? "POST" : "GET")
      ) {
        return methodNotAllowed([
          staffConfiguration ? "POST" : "GET",
        ]);
      }

      try {
        return staffConfiguration
          ? await handleStaffOperation(
              request,
              staffConfiguration,
              {
                enforceRateLimitForRequest,
                getAdminClientForRequest,
                requireActiveStaffForRequest,
              },
            )
          : await handleAvailableMeetings(
              request,
              enforceRateLimitForRequest,
              getAdminClientForRequest,
            );
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          return json(
            {
              error: staffConfiguration
                ? "Too many meeting changes. Please wait before trying again."
                : "Too many meeting-list requests. Please wait before trying again.",
            },
            429,
            {
              "Retry-After": String(
                error.retryAfterSeconds,
              ),
            },
          );
        }

        if (error instanceof HttpError) {
          return json(
            {
              error: error.message,
            },
            error.status,
            error.status === 401
              ? { "WWW-Authenticate": "Bearer" }
              : {},
          );
        }

        return json(
          {
            error: staffConfiguration
              ? staffConfiguration.unexpected
              : "Available meetings could not be loaded. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createMeetingsHandler();
