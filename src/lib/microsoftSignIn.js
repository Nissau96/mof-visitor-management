// "Sign in with Microsoft" runs in a popup, like Microsoft's own apps.
// The popup returns to MICROSOFT_CALLBACK_PATH, where supabase-js
// finishes the sign-in (the session is saved in shared storage), tells
// the main window on MICROSOFT_SIGN_IN_CHANNEL and closes itself. If
// the browser blocks the popup, the main window redirects instead.

export const MICROSOFT_CALLBACK_PATH = "/staff/auth/microsoft";
export const MICROSOFT_SIGN_IN_CHANNEL = "mof-visitor-management.microsoft-sign-in";

const POPUP_NAME = "mof-microsoft-sign-in";
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 640;

export function isMicrosoftCallbackPage() {
  return window.location.pathname === MICROSOFT_CALLBACK_PATH;
}

// Must run straight from the click, before any await, or the browser
// treats it as an unrequested popup and blocks it. Returns null then.
export function openMicrosoftPopup() {
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2),
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2),
  );

  try {
    return window.open(
      "",
      POPUP_NAME,
      `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`,
    );
  } catch {
    return null;
  }
}

// Supabase returns with ?error_description=… when Microsoft or Supabase
// refuses the sign-in before a session exists.
export function readMicrosoftError(search) {
  const parameters = new URLSearchParams(search);
  const description = parameters.get("error_description") || "";

  if (!description && !parameters.get("error")) {
    return "";
  }

  if (/signup|not allowed|not found/i.test(description)) {
    return "Your Microsoft account is not registered for staff access. Ask an administrator to add you.";
  }

  return "Microsoft sign-in did not complete. Please try again.";
}
