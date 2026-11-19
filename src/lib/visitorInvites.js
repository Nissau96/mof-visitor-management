// Small rules shared by the visitor-link screens.

const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
});

export function formatLinkExpiry(expiresAt) {
  return expiryFormat.format(new Date(expiresAt));
}

// A link can be cancelled until its visitor arrives.
export function canCancelInvite(invite) {
  return (
    invite.state === "unused" ||
    (invite.state === "used" && ["upcoming", "waiting"].includes(invite.visitState))
  );
}

// The floating staff button: receptionists and administrators find
// bookings and create links; Unit Heads only create links; IT neither.
export function quickActionsFor(role) {
  if (role === "receptionist" || role === "admin") {
    return { create: true, find: true };
  }

  if (role === "client_service_head") {
    return { create: true, find: false };
  }

  return null;
}
