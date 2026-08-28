import { apiRequest } from "./api.js";

export const VISITOR_CARD_ENDPOINTS =
  Object.freeze({
    adminAssignTower:
      "/api/admin/cards/assign-tower",
    adminCreate:
      "/api/admin/cards/create",
    adminInventory:
      "/api/admin/cards/inventory",
    admit:
      "/api/staff/cards/admit",
    availableCards:
      "/api/staff/cards/search",
    cancelAdmission:
      "/api/staff/cards/cancel",
    checkedIn:
      "/api/staff/cards/checked-in",
    checkout:
      "/api/staff/checkout",
    incidentList:
      "/api/staff/cards/incidents",
    incidentResolve:
      "/api/staff/cards/incidents/resolve",
    incidentStart:
      "/api/staff/cards/incidents/start",
    pendingAdmissions:
      "/api/staff/cards/pending",
    reprint:
      "/api/staff/cards/reprint",
    reportNotReturned:
      "/api/staff/cards/report-not-returned",
  });

function authorizedPost(
  path,
  accessToken,
  body,
  signal,
) {
  return apiRequest(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization:
        `Bearer ${accessToken}`,
    },
    method: "POST",
    ...(signal
      ? {
          signal,
        }
      : {}),
  });
}

export function getPendingAdmissions({
  accessToken,
  page = 1,
  pageSize = 10,
  search = "",
  signal,
  tower = "",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .pendingAdmissions,
    accessToken,
    {
      page,
      pageSize,
      search,
      tower,
    },
    signal,
  );
}

export function getAvailableVisitorCards({
  accessToken,
  cardType,
  lastThreeDigits,
  signal,
  tower,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .availableCards,
    accessToken,
    {
      cardType,
      lastThreeDigits,
      tower,
    },
    signal,
  );
}

export function admitVisitorWithCard({
  accessToken,
  cardId,
  signal,
  tower,
  visitId,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS.admit,
    accessToken,
    {
      cardId,
      tower,
      visitId,
    },
    signal,
  );
}

export function cancelPendingVisitorAdmission({
  accessToken,
  reason,
  signal,
  tower,
  visitId,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .cancelAdmission,
    accessToken,
    {
      reason,
      tower,
      visitId,
    },
    signal,
  );
}

export function getCheckedInCardVisitors({
  accessToken,
  cardStatus = "all",
  page = 1,
  pageSize = 10,
  search = "",
  signal,
  tower = "",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS.checkedIn,
    accessToken,
    {
      cardStatus,
      page,
      pageSize,
      search,
      tower,
    },
    signal,
  );
}

export function checkoutCardVisitor({
  accessToken,
  signal,
  tower,
  visitId,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS.checkout,
    accessToken,
    {
      tower,
      visitId,
    },
    signal,
  );
}

export function reportVisitorCardNotReturned({
  accessToken,
  signal,
  tower,
  visitId,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .reportNotReturned,
    accessToken,
    {
      tower,
      visitId,
    },
    signal,
  );
}

export function getVisitorCardIncidents({
  accessToken,
  page = 1,
  pageSize = 10,
  resolution = "all",
  search = "",
  signal,
  status = "all",
  tower = "",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .incidentList,
    accessToken,
    {
      page,
      pageSize,
      resolution,
      search,
      status,
      tower,
    },
    signal,
  );
}

export function startVisitorCardIncidentInvestigation({
  accessToken,
  incidentId,
  notes,
  signal,
  tower = "",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .incidentStart,
    accessToken,
    {
      incidentId,
      notes,
      tower,
    },
    signal,
  );
}

export function resolveVisitorCardIncident({
  accessToken,
  incidentId,
  notes,
  resolution,
  signal,
  tower = "",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .incidentResolve,
    accessToken,
    {
      incidentId,
      notes,
      resolution,
      tower,
    },
    signal,
  );
}

export function reprintDeactivatedVisitorCard({
  accessToken,
  cardId,
  notes,
  signal,
  tower = "",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS.reprint,
    accessToken,
    {
      cardId,
      notes,
      tower,
    },
    signal,
  );
}

export function getAdminVisitorCardInventory({
  accessToken,
  cardType = "all",
  page = 1,
  pageSize = 10,
  search = "",
  signal,
  status = "all",
  tower = "all",
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .adminInventory,
    accessToken,
    {
      cardType,
      page,
      pageSize,
      search,
      status,
      tower,
    },
    signal,
  );
}

export function createAdminVisitorCards({
  accessToken,
  cardType,
  endNumber,
  signal,
  startNumber,
  tower,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .adminCreate,
    accessToken,
    {
      cardType,
      endNumber,
      startNumber,
      tower,
    },
    signal,
  );
}

export function assignAdminVisitorCardTower({
  accessToken,
  cardId,
  signal,
  tower,
}) {
  return authorizedPost(
    VISITOR_CARD_ENDPOINTS
      .adminAssignTower,
    accessToken,
    {
      cardId,
      tower,
    },
    signal,
  );
}