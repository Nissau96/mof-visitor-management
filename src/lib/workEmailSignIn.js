import {
  BrowserAuthError,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";

// Work email (Microsoft Entra ID) sign-in for the meeting booking page.
// Bookers are Ministry staff without an account in this app, so this
// signs them in with Microsoft directly, not through Supabase. The ID
// token is sent to the API, which checks it on every request.

const CLIENT_ID = import.meta.env.VITE_ENTRA_CLIENT_ID || "";
const TENANT_ID = import.meta.env.VITE_ENTRA_TENANT_ID || "";

export const WORK_EMAIL_SIGN_IN_CONFIGURED = Boolean(CLIENT_ID && TENANT_ID);

const SCOPES = ["openid", "profile", "email", "User.Read"];

// Refresh the ID token when it has less than this long left.
const REFRESH_MARGIN_SECONDS = 5 * 60;

let applicationPromise = null;

function getApplication() {
  if (!WORK_EMAIL_SIGN_IN_CONFIGURED) {
    return Promise.reject(
      new Error("Work email sign-in is not configured."),
    );
  }

  applicationPromise ??= (async () => {
    const application = new PublicClientApplication({
      auth: {
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientId: CLIENT_ID,
        // A static page that runs no script; the opener reads the result.
        redirectUri: `${window.location.origin}/book-auth.html`,
      },
      cache: {
        // Signed in for this tab only.
        cacheLocation: "sessionStorage",
      },
    });

    await application.initialize();

    return application;
  })();

  return applicationPromise;
}

function toBooker(account) {
  return account
    ? {
        email: String(account.username || "").toLowerCase(),
        name: account.name || account.username || "",
      }
    : null;
}

function currentAccount(application) {
  const account =
    application.getActiveAccount() || application.getAllAccounts()[0] || null;

  if (account) {
    application.setActiveAccount(account);
  }

  return account;
}

export async function getSignedInBooker() {
  if (!WORK_EMAIL_SIGN_IN_CONFIGURED) {
    return null;
  }

  return toBooker(currentAccount(await getApplication()));
}

function describeSignInError(error) {
  if (
    error instanceof BrowserAuthError &&
    ["user_cancelled", "popup_window_error", "empty_window_error"].includes(
      error.errorCode,
    )
  ) {
    return error.errorCode === "user_cancelled"
      ? ""
      : "The sign-in window could not open. Allow pop-ups for this site and try again.";
  }

  return "Work email sign-in did not complete. Please try again.";
}

// Opens Microsoft's sign-in window. Resolves with the booker, or null if
// they closed the window.
export async function signInWithWorkEmail() {
  const application = await getApplication();

  try {
    const result = await application.loginPopup({
      prompt: "select_account",
      scopes: SCOPES,
    });

    application.setActiveAccount(result.account);

    return toBooker(result.account);
  } catch (error) {
    const message = describeSignInError(error);

    if (!message) {
      return null;
    }

    throw new Error(message, { cause: error });
  }
}

function secondsLeft(idToken) {
  try {
    const payload = JSON.parse(
      atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );

    return Number(payload.exp) - Date.now() / 1_000;
  } catch {
    return 0;
  }
}

export class WorkEmailSignInRequiredError extends Error {
  constructor(message = "Sign in with your work email to continue.") {
    super(message);
    this.name = "WorkEmailSignInRequiredError";
  }
}

// A current ID token for the API, refreshed quietly when close to expiry.
export async function getWorkEmailIdToken() {
  const application = await getApplication();
  const account = currentAccount(application);

  if (!account) {
    throw new WorkEmailSignInRequiredError();
  }

  try {
    let result = await application.acquireTokenSilent({
      account,
      scopes: SCOPES,
    });

    if (secondsLeft(result.idToken) < REFRESH_MARGIN_SECONDS) {
      result = await application.acquireTokenSilent({
        account,
        forceRefresh: true,
        scopes: SCOPES,
      });
    }

    return result.idToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      throw new WorkEmailSignInRequiredError(
        "Your work email sign-in has expired. Sign in again.",
      );
    }

    throw error;
  }
}

// Signs out of this page only; the Microsoft 365 session is untouched.
export async function signOutWorkEmail() {
  if (!WORK_EMAIL_SIGN_IN_CONFIGURED) {
    return;
  }

  const application = await getApplication();
  application.setActiveAccount(null);
  await application.clearCache();
}
