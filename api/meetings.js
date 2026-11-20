import { withAuditContext } from "./_lib/auditContext.js";
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
  recordAuditEvent,
  requireActiveStaff,
  requireStaffTowerScope,
} from "./_lib/staffAuth.js";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  wifiAccessToBoolean,
} from "../src/constants/visitorOptions.js";
import { readWeeklyQrAccess } from "../src/server/weeklyQrAccess.js";
import { sendMeetingBookingEmail } from "../src/server/meetingBookingEmail.js";
import { verifyWorkEmailToken } from "./_lib/workEmailToken.js";
import {
  bookingCancelSchema,
  bookingDecisionSchema,
  bookingFormSchema,
  bookingGuestsSchema,
  bookingListSchema,
  bookingRequestListSchema,
} from "../src/validation/meetingBookings.js";
import {
  meetingDeleteSchema,
  meetingVisitorsSchema,
  meetingListSchema,
  meetingSaveSchema,
  meetingStatusSchema,
} from "../src/validation/meetings.js";
import {
  bookingWifiSchema,
  wifiCountSchema,
  wifiGrantSchema,
  wifiListSchema,
  wifiResendSchema,
  wifiSecretSchema,
  wifiUpdateSchema,
} from "../src/validation/wifiAccess.js";
import {
  decryptWifiPassword,
  deliverWifiCredentials,
  encryptWifiPassword,
  getWifiNetworkName,
  getWifiSettings,
} from "../src/server/wifiCredentials.js";
import {
  bookedListSchema,
  bookerInviteCreateSchema,
  bookingFindSchema,
  inviteCancelSchema,
  inviteCreateSchema,
  inviteListSchema,
} from "../src/validation/visitorInvites.js";
import { createInviteToken } from "../src/server/visitorInviteToken.js";
import {
  createInviteLinkMessage,
  getInviteUrl,
  sendInviteEmail,
} from "../src/server/visitorInviteEmail.js";

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

const BOOKER_RATE_LIMIT = Object.freeze({
  limit: 60,
  scope: "meeting-booker-requests",
  windowSeconds: 10 * 60,
});

const WIFI_NOT_FOUND =
  "This Wi-Fi request was withdrawn or no longer exists. Refresh the list.";

function encryptOrExplain(password) {
  try {
    return encryptWifiPassword(password);
  } catch {
    throw new HttpError(
      "Wi-Fi passwords cannot be stored yet: WIFI_PASSWORD_SECRET is not set on the server.",
      503,
    );
  }
}

// Sends by SMS and email, then records what actually went out. Print is
// done by the browser, so it is recorded as chosen.
async function deliverAndRecord({ channels, client, data, password, values, actorId }) {
  const { delivered, problems } = await deliverWifiCredentials({
    channels,
    expiresAt: data.expiresAt,
    password,
    recipients: Array.isArray(data.recipients) ? data.recipients : [],
    tower: values.tower,
  });
  const recorded = [
    ...delivered,
    ...(channels.includes("print") ? ["print"] : []),
  ];

  let sentBy = recorded;

  if (recorded.length) {
    const { data: delivery } = await client.rpc("record_wifi_delivery", {
      p_actor_id: actorId,
      p_channels: recorded,
      p_entry_id: values.id,
      p_entry_type: values.type,
    });

    sentBy = Array.isArray(delivery?.sentBy) ? delivery.sentBy : recorded;
  }

  return { problems, sentBy };
}

const BOOKING_NOT_FOUND =
  "The booking could not be found. Refresh the list and try again.";

const INVITE_NOT_FOUND =
  "The visitor link could not be found. Refresh the list and try again.";

// Everyone except the IT role may create visitor booking links.
const INVITE_CREATOR_ROLES = Object.freeze([
  "receptionist",
  "client_service_head",
  "admin",
]);

// A new link gets a fresh token; only its hash reaches the database.
function prepareInvite(values) {
  const { hash, token } = createInviteToken();

  return { ...values, tokenHash: hash, token };
}

// Returns the link (shown once, never stored) and, when staff gave the
// visitor's email address, emails it. A failed email does not undo the
// link: staff can still copy or share it.
async function finishInvite(data, values, { request }) {
  const url = getInviteUrl(values.token, request);
  let emailSent = false;

  if (values.visitorEmail) {
    try {
      await sendInviteEmail({
        message: createInviteLinkMessage({
          expiresAt: data.expiresAt,
          hostName: data.hostName,
          url,
        }),
        to: values.visitorEmail,
      });
      emailSent = true;
    } catch {
      emailSent = false;
    }
  }

  return {
    ...data,
    emailRequested: Boolean(values.visitorEmail),
    emailSent,
    url,
  };
}

const MEETING_VIEW_ROLES = Object.freeze([
  "receptionist",
  "client_service_head",
  "admin",
]);

const MEETING_MANAGER_ROLES = Object.freeze([
  "receptionist",
  "admin",
]);

// The IT network team works the Wi-Fi requests; Super Administrators
// can see and work them too.
const WIFI_REVIEWER_ROLES = Object.freeze([
  "it_network_admin",
  "admin",
]);

// Staff operations reach this function through vercel.json rewrites
// (/api/staff/meetings/* → /api/meetings?operation=…), so meeting
// management does not need its own Vercel Function.
const STAFF_OPERATIONS = Object.freeze({
  "booking-decide": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    emailResult: true,
    notFound: BOOKING_NOT_FOUND,
    rpcName: "decide_meeting_booking",
    schema: bookingDecisionSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_booking_id: values.bookingId,
      p_decision: values.decision,
      p_reason: values.reason,
      p_tower: tower,
    }),
    unexpected:
      "The booking request could not be answered. Please try again.",
    write: true,
  }),
  "booked-list": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    rpcName: "get_booked_visitors",
    schema: bookedListSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_tower: tower || null,
      p_view: values.view,
    }),
    unexpected: "Booked visitors could not be loaded. Please try again.",
    write: false,
  }),
  "booking-find": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    notFound: "No booking matches this code. Check the code with the visitor.",
    rpcName: "find_visitor_booking",
    schema: bookingFindSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_code: values.code,
      p_tower: tower || null,
    }),
    unexpected: "The booking could not be searched. Please try again.",
    write: false,
  }),
  "booking-requests": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    expireBookingsFirst: true,
    rpcName: "get_meeting_booking_requests",
    schema: bookingRequestListSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_tower: tower,
      p_view: values.view,
    }),
    unexpected:
      "Booking requests could not be loaded. Please try again.",
    write: false,
  }),
  "invite-cancel": Object.freeze({
    allowedRoles: INVITE_CREATOR_ROLES,
    notFound: INVITE_NOT_FOUND,
    rpcName: "cancel_visitor_invite",
    schema: inviteCancelSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_creator_oid: null,
      p_invite_id: values.inviteId,
    }),
    unexpected: "The visitor link could not be cancelled. Please try again.",
    write: true,
  }),
  "invite-create": Object.freeze({
    after: finishInvite,
    allowedRoles: INVITE_CREATOR_ROLES,
    prepare: prepareInvite,
    rpcName: "create_visitor_invite",
    schema: inviteCreateSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_agency: values.agency,
      p_creator_email: null,
      p_creator_name: null,
      p_creator_oid: null,
      p_division: values.division,
      p_floor: values.floor,
      p_host_name: values.hostName,
      p_token_hash: values.tokenHash,
    }),
    unexpected: "The visitor link could not be created. Please try again.",
    write: true,
  }),
  "invite-list": Object.freeze({
    // The create dialog offers the host list; a name can still be typed.
    after: async (data, _values, { client }) => {
      const { data: hosts } = await client
        .from("hosts")
        .select("full_name")
        .eq("active", true)
        .order("full_name", { ascending: true });

      return {
        ...data,
        hosts: Array.isArray(hosts) ? hosts.map((host) => host.full_name) : [],
      };
    },
    allowedRoles: INVITE_CREATOR_ROLES,
    rpcName: "get_visitor_invites",
    schema: inviteListSchema,
    toArguments: (_values, actorId) => ({
      p_actor_id: actorId,
      p_creator_oid: null,
    }),
    unexpected: "Your visitor links could not be loaded. Please try again.",
    write: false,
  }),
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
    rpcName: "get_staff_meetings_with_wifi",
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
  "staff-visitors": Object.freeze({
    allowedRoles: MEETING_VIEW_ROLES,
    rpcName: "get_staff_meeting_visitors",
    schema: meetingVisitorsSchema,
    toArguments: (values, actorId, tower) => ({
      p_actor_id: actorId,
      p_meeting_id: values.meetingId,
      p_tower: tower,
    }),
    unexpected:
      "Registered visitors could not be loaded. Please try again.",
    write: false,
  }),
  "staff-save": Object.freeze({
    allowedRoles: MEETING_MANAGER_ROLES,
    rpcName: "save_staff_meeting_with_wifi",
    schema: meetingSaveSchema,
    toArguments: ({ meeting }, actorId, tower) => ({
      p_actor_id: actorId,
      p_floor: meeting.floor,
      p_ends_at: meeting.endsAt || null,
      p_ends_on:
        meeting.scheduleType === "single"
          ? meeting.startsOn
          : meeting.endsOn || null,
      p_host_agency: meeting.hostAgency,
      // Only Ministry of Finance meetings have a division.
      p_host_division:
        meeting.hostAgency === MINISTRY_OF_FINANCE_AGENCY
          ? meeting.hostDivision
          : "",
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
      p_wifi_requested: wifiAccessToBoolean(meeting.wifiAccess),
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
  "wifi-count": Object.freeze({
    allowedRoles: WIFI_REVIEWER_ROLES,
    rpcName: "get_wifi_waiting_count",
    schema: wifiCountSchema,
    toArguments: (_values, actorId) => ({
      p_actor_id: actorId,
    }),
    unexpected:
      "Wi-Fi requests could not be counted. Please try again.",
    write: false,
  }),
  "wifi-grant": Object.freeze({
    after: async (data, values, { actorId, client }) => {
      const { recipients, ...grant } = data;
      const delivery = await deliverAndRecord({
        actorId,
        channels: values.channels,
        client,
        data: { ...grant, recipients },
        password: values.password,
        values,
      });

      return {
        ...grant,
        networkName: getWifiNetworkName(undefined, values.tower),
        problems: delivery.problems,
        sentBy: delivery.sentBy,
      };
    },
    allowedRoles: WIFI_REVIEWER_ROLES,
    notFound: WIFI_NOT_FOUND,
    rpcName: "grant_wifi_access",
    schema: wifiGrantSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_date: values.date,
      p_duration: values.duration,
      p_entry_id: values.id,
      p_entry_type: values.type,
      p_note: values.note,
      p_password_cipher: encryptOrExplain(values.password),
    }),
    unexpected: "Wi-Fi access could not be granted. Please try again.",
    write: true,
  }),
  "wifi-list": Object.freeze({
    after: (data) => ({ ...data, settings: getWifiSettings() }),
    allowedRoles: WIFI_REVIEWER_ROLES,
    rpcName: "get_wifi_access_requests",
    schema: wifiListSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_view: values.view,
    }),
    unexpected:
      "Wi-Fi requests could not be loaded. Please try again.",
    write: false,
  }),
  "wifi-resend": Object.freeze({
    after: async (data, values, { actorId, client }) => {
      const password = decryptWifiPassword(data.cipher);
      const delivery = await deliverAndRecord({
        actorId,
        channels: values.channels,
        client,
        data,
        password,
        values,
      });

      return {
        expiresAt: data.expiresAt,
        networkName: getWifiNetworkName(undefined, values.tower),
        password: values.channels.includes("print") ? password : undefined,
        problems: delivery.problems,
        sentBy: delivery.sentBy,
      };
    },
    allowedRoles: WIFI_REVIEWER_ROLES,
    notFound: "This password has expired. Grant access again with a new password.",
    rpcName: "get_wifi_grant_secret",
    schema: wifiResendSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_entry_id: values.id,
      p_entry_type: values.type,
    }),
    unexpected: "The Wi-Fi details could not be sent. Please try again.",
    write: true,
  }),
  "wifi-secret": Object.freeze({
    after: async (data, values, { actorId, client }) => {
      // Showing a password is a sensitive event in the activity log.
      await recordAuditEvent(client, {
        action: "wifi.password_revealed",
        actorId,
        details: { entryType: values.type, tower: values.tower || undefined },
        entityId: values.id,
        entityType: values.type === "visit" ? "visit" : "meeting_booking_guest",
      });

      return {
        expiresAt: data.expiresAt,
        networkName: getWifiNetworkName(undefined, values.tower),
        password: decryptWifiPassword(data.cipher),
      };
    },
    allowedRoles: WIFI_REVIEWER_ROLES,
    notFound: "This password has expired. Grant access again with a new password.",
    rpcName: "get_wifi_grant_secret",
    schema: wifiSecretSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_entry_id: values.id,
      p_entry_type: values.type,
    }),
    unexpected: "The Wi-Fi password could not be shown. Please try again.",
    write: true,
  }),
  "wifi-update": Object.freeze({
    allowedRoles: WIFI_REVIEWER_ROLES,
    notFound:
      "This Wi-Fi request was withdrawn or no longer exists. Refresh the list.",
    rpcName: "set_wifi_access_status",
    schema: wifiUpdateSchema,
    toArguments: (values, actorId) => ({
      p_actor_id: actorId,
      p_entry_id: values.id,
      p_entry_type: values.type,
      p_note: values.note,
      p_status: values.status,
    }),
    unexpected:
      "The Wi-Fi request could not be updated. Please try again.",
    write: true,
  }),
});

// Booker operations: Ministry staff who book meetings through /book.
// They sign in with their work email; the verified token's object id
// identifies them, so they only ever see and change their own bookings.
const BOOKER_OPERATIONS = Object.freeze({
  "booker-invite-cancel": Object.freeze({
    notFound: INVITE_NOT_FOUND,
    rpcName: "cancel_visitor_invite",
    schema: inviteCancelSchema,
    toArguments: (values, booker) => ({
      p_actor_id: null,
      p_creator_oid: booker.oid,
      p_invite_id: values.inviteId,
    }),
    unexpected: "The visitor link could not be cancelled. Please try again.",
  }),
  "booker-invite-create": Object.freeze({
    after: finishInvite,
    prepare: prepareInvite,
    rpcName: "create_visitor_invite",
    schema: bookerInviteCreateSchema,
    // The person signed in is the host of their own links.
    toArguments: (values, booker) => ({
      p_actor_id: null,
      p_agency: values.agency,
      p_creator_email: booker.email,
      p_creator_name: booker.name,
      p_creator_oid: booker.oid,
      p_division: values.division,
      p_floor: values.floor,
      p_host_name: booker.name,
      p_token_hash: values.tokenHash,
    }),
    unexpected: "The visitor link could not be created. Please try again.",
  }),
  "booker-invite-list": Object.freeze({
    rpcName: "get_visitor_invites",
    schema: inviteListSchema,
    toArguments: (_values, booker) => ({
      p_actor_id: null,
      p_creator_oid: booker.oid,
    }),
    unexpected: "Your visitor links could not be loaded. Please try again.",
  }),
  "booker-cancel": Object.freeze({
    rpcName: "cancel_meeting_booking",
    schema: bookingCancelSchema,
    toArguments: (values, booker) => ({
      p_booker_oid: booker.oid,
      p_booking_id: values.bookingId,
    }),
    unexpected: "The booking could not be cancelled. Please try again.",
  }),
  "booker-guests": Object.freeze({
    rpcName: "save_meeting_booking_guests",
    schema: bookingGuestsSchema,
    toArguments: (values, booker) => ({
      p_booker_oid: booker.oid,
      p_booking_id: values.bookingId,
      p_guests: values.guests,
    }),
    unexpected: "The guest list could not be saved. Please try again.",
  }),
  "booker-list": Object.freeze({
    expireBookingsFirst: true,
    rpcName: "get_booker_meeting_bookings",
    schema: bookingListSchema,
    toArguments: (_values, booker) => ({
      p_booker_oid: booker.oid,
    }),
    unexpected: "Your bookings could not be loaded. Please try again.",
  }),
  "booker-submit": Object.freeze({
    rpcName: "submit_meeting_booking_with_wifi",
    schema: bookingFormSchema,
    toArguments: (values, booker) => ({
      p_booker_email: booker.email,
      p_floor: values.floor,
      p_booker_name: booker.name,
      p_booker_oid: booker.oid,
      p_ends_at: values.endsAt,
      p_guests: values.guests,
      p_host_agency: values.hostAgency,
      p_host_division:
        values.hostAgency === MINISTRY_OF_FINANCE_AGENCY
          ? values.hostDivision
          : "",
      p_notes: values.notes,
      p_recurrence_days:
        values.scheduleType === "weekly" ? values.recurrenceDays : [],
      p_ends_on: values.scheduleType === "single" ? null : values.endsOn,
      p_schedule_type: values.scheduleType,
      p_starts_on: values.startsOn,
      p_starts_at: values.startsAt,
      p_title: values.title,
      p_venue: values.venue,
      p_wifi_requested: wifiAccessToBoolean(values.wifiAccess),
    }),
    unexpected: "The meeting could not be booked. Please try again.",
  }),
  "booker-wifi": Object.freeze({
    rpcName: "set_meeting_booking_wifi",
    schema: bookingWifiSchema,
    toArguments: (values, booker) => ({
      p_booker_oid: booker.oid,
      p_booking_id: values.bookingId,
      p_wifi_requested: wifiAccessToBoolean(values.wifiAccess),
    }),
    unexpected: "The Wi-Fi request could not be changed. Please try again.",
  }),
});

// Requests still waiting when their meeting starts expire; each booker
// is emailed once, when the expiry is first noticed. Email failures do
// not stop the list from loading.
async function expireBookings(client, sendBookingEmail) {
  const { data, error } = await client.rpc("expire_meeting_bookings");

  if (error || !Array.isArray(data) || data.length === 0) {
    return;
  }

  await Promise.allSettled(data.map((booking) => sendBookingEmail(booking)));
}

async function trySendBookingEmail(sendBookingEmail, booking) {
  try {
    await sendBookingEmail(booking);
    return true;
  } catch {
    return false;
  }
}

function getDatabaseError(error, fallback, notFound) {
  // The meeting functions raise these codes with messages written for
  // staff, so they are shown as they are.
  switch (error?.code) {
    case "P0002":
      return new HttpError(
        notFound ||
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

// ?agency=IAA, or ?agency=Ministry of Finance (MoF)&division=Budget Office
function readMeetingDestination(request) {
  const parameters = new URL(request.url).searchParams;
  const agency = parameters.get("agency") || "";
  const division = parameters.get("division") || "";
  const ministry = agency === MINISTRY_OF_FINANCE_AGENCY;

  if (
    !VISIT_AGENCIES.includes(agency) ||
    (ministry && !MOF_DIVISIONS.includes(division))
  ) {
    throw new HttpError(
      "Choose the agency (and, for the Ministry, the division) you are visiting.",
      400,
    );
  }

  return {
    agency,
    division: ministry ? division : "",
  };
}

async function handleAvailableMeetings(
  request,
  enforceRateLimitForRequest,
  getAdminClientForRequest,
) {
  await readWeeklyQrAccess(request);

  await enforceRateLimitForRequest(
    request,
    MEETING_DIRECTORY_RATE_LIMIT,
  );

  // Visitors only see meetings hosted where they are going.
  const destination = readMeetingDestination(request);

  const { data, error } =
    await getAdminClientForRequest().rpc(
      "get_available_meeting_options",
      {
        p_agency: destination.agency,
        p_division: destination.division,
      },
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
    sendBookingEmail,
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

  const values = configuration.prepare
    ? configuration.prepare(parsed.data)
    : parsed.data;

  const client = getAdminClientForRequest();

  if (configuration.expireBookingsFirst) {
    await expireBookings(client, sendBookingEmail);
  }

  const { data, error } =
    await client.rpc(
      configuration.rpcName,
      configuration.toArguments(
        values,
        profile.userId,
        tower,
      ),
    );

  if (error) {
    throw getDatabaseError(
      error,
      configuration.unexpected,
      configuration.notFound,
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

  if (configuration.emailResult) {
    return json(
      {
        ...data,
        emailSent: await trySendBookingEmail(sendBookingEmail, data),
      },
      200,
    );
  }

  if (configuration.after) {
    return json(
      await configuration.after(data, values, {
        actorId: profile.userId,
        client,
        request,
      }),
      200,
    );
  }

  return json(data, 200);
}

async function handleBookerOperation(
  request,
  configuration,
  {
    enforceRateLimitForRequest,
    getAdminClientForRequest,
    sendBookingEmail,
    verifyWorkEmailForRequest,
  },
) {
  const booker = await verifyWorkEmailForRequest(request);

  await enforceRateLimitForRequest(request, {
    ...BOOKER_RATE_LIMIT,
    keyMode: "subject",
    subject: booker.oid,
  });

  const body = await readJsonBody(request);
  const parsed = configuration.schema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      parsed.error.issues[0]?.message ||
        "The booking request is invalid.",
      400,
    );
  }

  const values = configuration.prepare
    ? configuration.prepare(parsed.data)
    : parsed.data;

  const client = getAdminClientForRequest();

  if (configuration.expireBookingsFirst) {
    await expireBookings(client, sendBookingEmail);
  }

  const { data, error } = await client.rpc(
    configuration.rpcName,
    configuration.toArguments(values, booker),
  );

  if (error) {
    throw getDatabaseError(
      error,
      configuration.unexpected,
      configuration.notFound || BOOKING_NOT_FOUND,
    );
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpError(configuration.unexpected, 500);
  }

  const result = configuration.after
    ? await configuration.after(data, values, { booker, client, request })
    : data;

  return json(
    {
      ...result,
      booker: { email: booker.email, name: booker.name },
    },
    200,
  );
}

function bookerErrorResponse(error, configuration) {
  if (error instanceof RateLimitExceededError) {
    return json(
      {
        error: "Too many booking requests. Please wait before trying again.",
      },
      429,
      { "Retry-After": String(error.retryAfterSeconds) },
    );
  }

  if (error instanceof HttpError) {
    return json(
      { error: error.message },
      error.status,
      error.status === 401 ? { "WWW-Authenticate": "Bearer" } : {},
    );
  }

  return json({ error: configuration.unexpected }, 500);
}

export function createMeetingsHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
  requireActiveStaffForRequest = requireActiveStaff,
  sendBookingEmail = sendMeetingBookingEmail,
  verifyWorkEmailForRequest = verifyWorkEmailToken,
} = {}) {
  return {
    async fetch(request) {
      const operation =
        new URL(request.url).searchParams.get(
          "operation",
        ) || "";

      const staffConfiguration =
        STAFF_OPERATIONS[operation];

      const bookerConfiguration =
        BOOKER_OPERATIONS[operation];

      if (bookerConfiguration) {
        if (request.method !== "POST") {
          return methodNotAllowed(["POST"]);
        }

        try {
          return await handleBookerOperation(
            request,
            bookerConfiguration,
            {
              enforceRateLimitForRequest,
              getAdminClientForRequest,
              sendBookingEmail,
              verifyWorkEmailForRequest,
            },
          );
        } catch (error) {
          return bookerErrorResponse(error, bookerConfiguration);
        }
      }

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
                sendBookingEmail,
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

export default withAuditContext(createMeetingsHandler());
