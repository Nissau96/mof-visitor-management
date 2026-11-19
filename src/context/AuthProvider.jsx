import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VISIT_TOWER_VALUES } from "../constants/visitorOptions.js";
import { ApiError, apiRequest } from "../lib/api.js";
import {
  isMicrosoftCallbackPage,
  MICROSOFT_CALLBACK_PATH,
  MICROSOFT_SIGN_IN_CHANNEL,
} from "../lib/microsoftSignIn.js";
import {
  clearIdleSignOut,
  resetStaffActivity,
} from "../lib/staffIdle.js";
import { supabase } from "../lib/supabase.js";
import AuthContext from "./authContext.js";

const ALLOWED_STAFF_ROLES = new Set([
  "receptionist",
  "client_service_head",
  "it_network_admin",
  "admin",
]);

const ALLOWED_STAFF_TOWERS = new Set(
  VISIT_TOWER_VALUES,
);

const STAFF_TOWER_STORAGE_KEY =
  "mof-visitor-management.staff-tower";

// Set just before a sign-in and read once by the first session check,
// which then asks the server to record the sign-in. It survives the
// round trip to Microsoft because sessionStorage belongs to the tab.
const FRESH_SIGN_IN_STORAGE_KEY =
  "mof-visitor-management.fresh-sign-in";

function markFreshSignIn() {
  // A new session starts its own idle clock.
  resetStaffActivity();
  clearIdleSignOut();

  try {
    window.sessionStorage.setItem(
      FRESH_SIGN_IN_STORAGE_KEY,
      "1",
    );
  } catch {
    // The sign-in still works; it is only not recorded as new.
  }
}

function takeFreshSignIn() {
  try {
    const fresh =
      window.sessionStorage.getItem(
        FRESH_SIGN_IN_STORAGE_KEY,
      ) === "1";

    window.sessionStorage.removeItem(
      FRESH_SIGN_IN_STORAGE_KEY,
    );

    return fresh;
  } catch {
    return false;
  }
}

const INITIAL_AUTH_STATE = {
  message: "",
  profile: null,
  session: null,
  status: "loading",
  tower: "",
};

const POPUP_TIMEOUT_MS = 5 * 60 * 1_000;
const POPUP_CLOSE_GRACE_MS = 1_000;

// Waits for the popup to report back on MICROSOFT_SIGN_IN_CHANNEL, or
// to be closed, or to time out. finish() loads the session the popup
// saved and returns whether one exists.
function waitForMicrosoftPopup(popup, finish) {
  return new Promise((resolve, reject) => {
    const channel =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel(MICROSOFT_SIGN_IN_CHANNEL)
        : null;
    let settled = false;
    let closedTimer = null;

    function settle(callback) {
      if (settled) {
        return;
      }

      settled = true;
      window.clearInterval(watcher);
      window.clearTimeout(timeout);
      window.clearTimeout(closedTimer);
      channel?.close();
      callback();
    }

    async function complete() {
      try {
        const signedIn = await finish();

        if (!signedIn) {
          takeFreshSignIn();
        }

        settle(() =>
          resolve({ status: signedIn ? "signed-in" : "cancelled" }),
        );
      } catch (error) {
        settle(() => reject(error));
      }
    }

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.ok) {
          void complete();
          return;
        }

        takeFreshSignIn();
        settle(() =>
          reject(
            new Error(
              event.data?.message ||
                "Microsoft sign-in did not complete. Please try again.",
            ),
          ),
        );
      };
    }

    // Closing the popup by hand cancels. A short grace period lets a
    // message sent just before closing arrive first.
    const watcher = window.setInterval(() => {
      if (popup.closed && !closedTimer) {
        closedTimer = window.setTimeout(() => {
          void complete();
        }, POPUP_CLOSE_GRACE_MS);
      }
    }, 500);

    const timeout = window.setTimeout(() => {
      popup.close();
      takeFreshSignIn();
      settle(() => resolve({ status: "cancelled" }));
    }, POPUP_TIMEOUT_MS);
  });
}

function normalizeTower(value) {
  const tower = String(value || "")
    .trim()
    .toLowerCase();

  return ALLOWED_STAFF_TOWERS.has(tower)
    ? tower
    : "";
}

function readStoredTower() {
  try {
    return normalizeTower(
      window.sessionStorage.getItem(
        STAFF_TOWER_STORAGE_KEY,
      ),
    );
  } catch {
    return "";
  }
}

function writeStoredTower(tower) {
  try {
    if (tower) {
      window.sessionStorage.setItem(
        STAFF_TOWER_STORAGE_KEY,
        tower,
      );

      return;
    }

    window.sessionStorage.removeItem(
      STAFF_TOWER_STORAGE_KEY,
    );
  } catch {
    // Authentication remains usable when browser storage
    // is unavailable. Receptionists will be asked to sign
    // in again after a page reload.
  }
}

function getSessionErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return error.message;
    }

    // The server explains refusals in plain words (wrong sign-in
    // method, access ended, outside the Ministry network, sign in
    // again); show them as they are.
    if (
      (
        error.status === 401 ||
        error.status === 403
      ) &&
      error.message
    ) {
      return error.message;
    }

    if (error.status === 401) {
      return "Your staff session has expired. Sign in again.";
    }

    if (error.status === 403) {
      return "This account is not authorised for staff access.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The staff session could not be verified. Please try again.";
}

async function requestStaffProfile(
  session,
  { freshSignIn = false, tower = "" } = {},
) {
  if (!session?.access_token) {
    throw new ApiError(
      "A valid staff session is required.",
      401,
    );
  }

  const query = freshSignIn
    ? `?${new URLSearchParams({ signedIn: "1", tower })}`
    : "";

  const response = await apiRequest(
    `/api/staff/session${query}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      method: "GET",
    },
  );

  const profile = response?.profile;

  if (
    !profile?.fullName ||
    typeof profile.passwordChangeRequired !==
      "boolean" ||
    !ALLOWED_STAFF_ROLES.has(profile.role)
  ) {
    throw new ApiError(
      "This account is not authorised for staff access.",
      403,
    );
  }

  return profile;
}

function resolveSessionTower(
  profile,
  requestedTower,
  explicitSelection,
) {
  const tower = normalizeTower(
    requestedTower,
  );

  // Client Service Heads work across towers for visitor-card
  // incident investigation and resolution.
  if (
    profile.role ===
      "client_service_head"
  ) {
    return "";
  }

  // The IT network team works Wi-Fi requests for both towers.
  if (profile.role === "it_network_admin") {
    return "";
  }

  // Administrators begin with all-tower access after a new
  // login. They can subsequently select a tower filter.
  if (
    profile.role === "admin" &&
    explicitSelection
  ) {
    return "";
  }

  if (profile.role === "admin") {
    return tower;
  }

  if (!tower) {
    throw new ApiError(
      "Select the tower where you are currently working and sign in again.",
      400,
    );
  }

  return tower;
}

export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState(
    INITIAL_AUTH_STATE,
  );

  const validationSequence = useRef(0);

  const validateSession = useCallback(
    async (
      session,
      {
        requestedTower,
        showLoading = true,
      } = {},
    ) => {
      const sequence =
        validationSequence.current + 1;

      validationSequence.current = sequence;

      if (!session?.access_token) {
        writeStoredTower("");

        setAuth({
          message: "",
          profile: null,
          session: null,
          status: "unauthenticated",
          tower: "",
        });

        return null;
      }

      if (showLoading) {
        setAuth((currentAuth) => ({
          ...currentAuth,
          message: "",
          session,
          status: "loading",
        }));
      }

      // A sign-in that just returned from Microsoft carries its tower
      // in storage; treat it like a tower chosen on the form.
      const freshSignIn = takeFreshSignIn();

      const explicitSelection =
        typeof requestedTower === "string" ||
        freshSignIn;

      const selectedTower =
        typeof requestedTower === "string"
          ? requestedTower
          : readStoredTower();

      try {
        const profile =
          await requestStaffProfile(session, {
            freshSignIn,
            tower: normalizeTower(selectedTower),
          });

        const tower = resolveSessionTower(
          profile,
          selectedTower,
          explicitSelection,
        );

        if (
          validationSequence.current !== sequence
        ) {
          return profile;
        }

        writeStoredTower(tower);

        setAuth({
          message: "",
          profile,
          session,
          status: "authenticated",
          tower,
        });

        return profile;
      } catch (error) {
        if (
          validationSequence.current !== sequence
        ) {
          return null;
        }

        const message =
          getSessionErrorMessage(error);

        writeStoredTower("");

        setAuth({
          message,
          profile: null,
          session: null,
          status: "unauthenticated",
          tower: "",
        });

        await supabase.auth
          .signOut()
          .catch(() => undefined);

        throw new Error(message, {
          cause: error,
        });
      }
    },
    [],
  );

  useEffect(() => {
    // The Microsoft popup only finishes the sign-in and closes; the main
    // window checks the session and records it.
    if (isMicrosoftCallbackPage()) {
      return undefined;
    }

    let disposed = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (disposed) {
          return;
        }

        if (
          event === "SIGNED_OUT" ||
          !session
        ) {
          validationSequence.current += 1;
          writeStoredTower("");

          setAuth({
            message: "",
            profile: null,
            session: null,
            status: "unauthenticated",
            tower: "",
          });

          return;
        }

        window.setTimeout(() => {
          if (disposed) {
            return;
          }

          void validateSession(session, {
            showLoading:
              event === "INITIAL_SESSION",
          }).catch(() => undefined);
        }, 0);
      },
    );

    return () => {
      disposed = true;
      validationSequence.current += 1;
      subscription.unsubscribe();
    };
  }, [validateSession]);

  const signIn = useCallback(
    async ({ email, password, tower }) => {
      setAuth((currentAuth) => ({
        ...currentAuth,
        message: "",
      }));

      const normalizedTower =
        normalizeTower(tower);

      if (!normalizedTower) {
        throw new Error(
          "Select the tower where you will be working.",
        );
      }

      writeStoredTower(normalizedTower);
      markFreshSignIn();

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error || !data.session) {
        writeStoredTower("");
        takeFreshSignIn();

        throw new Error(
          "The email address or password is incorrect.",
        );
      }

      const profile =
        await validateSession(
          data.session,
          {
            requestedTower:
              normalizedTower,
          },
        );

      return profile;
    },
    [validateSession],
  );

  // Leaves the page for Microsoft. On the way back supabase-js finishes
  // the sign-in and the usual session check runs with the stored tower.
  // popup: a window already opened from the click (openMicrosoftPopup),
  // or null when the browser blocked it, in which case the whole page
  // goes to Microsoft and comes back to /staff/login.
  // Resolves { status: "signed-in" | "cancelled" | "redirecting" }.
  const signInWithMicrosoft = useCallback(
    async ({ popup, tower }) => {
      setAuth((currentAuth) => ({
        ...currentAuth,
        message: "",
      }));

      const normalizedTower =
        normalizeTower(tower);

      if (!normalizedTower) {
        popup?.close();

        throw new Error(
          "Select the tower where you will be working.",
        );
      }

      writeStoredTower(normalizedTower);
      markFreshSignIn();

      const usePopup = Boolean(popup && !popup.closed);

      const { data, error } =
        await supabase.auth.signInWithOAuth({
          options: {
            redirectTo: `${window.location.origin}${
              usePopup ? MICROSOFT_CALLBACK_PATH : "/staff/login"
            }`,
            // Always ask for the Microsoft password, even when the
            // browser is already signed in to Outlook or SharePoint, so a
            // shared reception PC cannot reuse someone else's session.
            queryParams: { prompt: "login" },
            scopes: "email",
            skipBrowserRedirect: true,
          },
          provider: "azure",
        });

      if (error || !data?.url) {
        popup?.close();
        writeStoredTower("");
        takeFreshSignIn();

        throw new Error(
          "Microsoft sign-in could not be started. Please try again.",
        );
      }

      if (!usePopup) {
        window.location.assign(data.url);
        return { status: "redirecting" };
      }

      popup.location.href = data.url;

      return waitForMicrosoftPopup(popup, async () => {
        // The popup saved the session in shared storage; supabase-js
        // usually reports it here too, but check directly so the main
        // window never waits on that.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          await validateSession(session);
        }

        return Boolean(session);
      });
    },
    [validateSession],
  );

  const setTowerScope = useCallback(
    (requestedTower) => {
      if (
        auth.status !== "authenticated" ||
        auth.profile?.role !== "admin"
      ) {
        throw new Error(
          "Only administrators can change the tower filter during a session.",
        );
      }

      const rawTower = String(
        requestedTower || "",
      )
        .trim()
        .toLowerCase();

      const tower =
        rawTower === ""
          ? ""
          : normalizeTower(rawTower);

      if (rawTower && !tower) {
        throw new Error(
          "Select a valid tower.",
        );
      }

      writeStoredTower(tower);

      setAuth((currentAuth) => ({
        ...currentAuth,
        tower,
      }));
    },
    [
      auth.profile?.role,
      auth.status,
    ],
  );

  const signOut = useCallback(async () => {
    validationSequence.current += 1;
    writeStoredTower("");
    resetStaffActivity();

    const { error } =
      await supabase.auth.signOut();

    setAuth({
      message: "",
      profile: null,
      session: null,
      status: "unauthenticated",
      tower: "",
    });

    if (error) {
      throw new Error(
        "Sign-out could not be completed. Close this browser window before leaving the device.",
      );
    }
  }, []);

  const clearAuthMessage = useCallback(() => {
    setAuth((currentAuth) => ({
      ...currentAuth,
      message: "",
    }));
  }, []);

  const contextValue = useMemo(
    () => ({
      authMessage: auth.message,
      clearAuthMessage,
      profile: auth.profile,
      session: auth.session,
      setTowerScope,
      signIn,
      signInWithMicrosoft,
      signOut,
      status: auth.status,
      tower: auth.tower,
    }),
    [
      auth,
      clearAuthMessage,
      setTowerScope,
      signIn,
      signInWithMicrosoft,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}