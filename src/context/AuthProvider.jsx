import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VISIT_TOWER_VALUES } from "../constants/visitorOptions.js";
import { ApiError, apiRequest } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import AuthContext from "./authContext.js";

const ALLOWED_STAFF_ROLES = new Set([
  "receptionist",
  "admin",
]);

const ALLOWED_STAFF_TOWERS = new Set(
  VISIT_TOWER_VALUES,
);

const STAFF_TOWER_STORAGE_KEY =
  "mof-visitor-management.staff-tower";

const INITIAL_AUTH_STATE = {
  message: "",
  profile: null,
  session: null,
  status: "loading",
  tower: "",
};

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

async function requestStaffProfile(session) {
  if (!session?.access_token) {
    throw new ApiError(
      "A valid staff session is required.",
      401,
    );
  }

  const response = await apiRequest(
    "/api/staff/session",
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

      try {
        const profile =
          await requestStaffProfile(session);

        const explicitSelection =
          typeof requestedTower === "string";

        const tower = resolveSessionTower(
          profile,
          explicitSelection
            ? requestedTower
            : readStoredTower(),
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

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error || !data.session) {
        writeStoredTower("");

        throw new Error(
          "The email address or password is incorrect.",
        );
      }

      await validateSession(data.session, {
        requestedTower: normalizedTower,
      });

      return true;
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
      signOut,
      status: auth.status,
      tower: auth.tower,
    }),
    [
      auth,
      clearAuthMessage,
      setTowerScope,
      signIn,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}