import { apiRequest } from "./api.js";

export const MEETING_ENDPOINTS = Object.freeze({
  delete: "/api/staff/meetings/delete",
  list: "/api/staff/meetings/list",
  save: "/api/staff/meetings/save",
  status: "/api/staff/meetings/status",
});

function authorizedPost(path, accessToken, body, signal) {
  return apiRequest(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    ...(signal ? { signal } : {}),
  });
}

export function getStaffMeetings({
  accessToken,
  from = "",
  page = 1,
  pageSize = 10,
  search = "",
  signal,
  to = "",
  tower = "",
  view = "today",
}) {
  return authorizedPost(
    MEETING_ENDPOINTS.list,
    accessToken,
    { from, page, pageSize, search, to, tower, view },
    signal,
  );
}

export function saveStaffMeeting({
  accessToken,
  meeting,
  tower = "",
}) {
  return authorizedPost(
    MEETING_ENDPOINTS.save,
    accessToken,
    { meeting, tower },
  );
}

export function setStaffMeetingActive({
  accessToken,
  active,
  meetingId,
  tower = "",
}) {
  return authorizedPost(
    MEETING_ENDPOINTS.status,
    accessToken,
    { active, meetingId, tower },
  );
}

export function deleteStaffMeeting({
  accessToken,
  meetingId,
  tower = "",
}) {
  return authorizedPost(
    MEETING_ENDPOINTS.delete,
    accessToken,
    { meetingId, tower },
  );
}
