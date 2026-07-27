import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, apiRequest } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import AuthContext from "./authContext.js";

const ALLOWED_STAFF_ROLES = new Set([
  "receptionist",
  "admin",
]);

const INITIAL_AUTH_STATE = {
  message: "",
  profile: null,
  session: null,
  status: "loading",
};

function getSessionErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Your staff session has expired. Sign in again.";
    }

    if (error.status === 403) {
      return "This account is not authorised for staff access.";
    }
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

export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState(
    INITIAL_AUTH_STATE,
  );

  const validationSequence = useRef(0);

  const validateSession = useCallback(
    async (session, showLoading = true) => {
      const sequence = validationSequence.current + 1;
      validationSequence.current = sequence;

      if (!session?.access_token) {
        setAuth({
          message: "",
          profile: null,
          session: null,
          status: "unauthenticated",
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

        if (
          validationSequence.current !== sequence
        ) {
          return profile;
        }

        setAuth({
          message: "",
          profile,
          session,
          status: "authenticated",
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

        setAuth({
          message,
          profile: null,
          session: null,
          status: "unauthenticated",
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

        if (event === "SIGNED_OUT" || !session) {
          validationSequence.current += 1;

          setAuth({
            message: "",
            profile: null,
            session: null,
            status: "unauthenticated",
          });

          return;
        }

        window.setTimeout(() => {
          if (disposed) {
            return;
          }

          void validateSession(
            session,
            event === "INITIAL_SESSION",
          ).catch(() => undefined);
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
    async ({ email, password }) => {
      setAuth((currentAuth) => ({
        ...currentAuth,
        message: "",
      }));

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error || !data.session) {
        throw new Error(
          "The email address or password is incorrect.",
        );
      }

      await validateSession(data.session);

      return true;
    },
    [validateSession],
  );

  const signOut = useCallback(async () => {
    validationSequence.current += 1;

    const { error } = await supabase.auth.signOut();

    setAuth({
      message: "",
      profile: null,
      session: null,
      status: "unauthenticated",
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
      signIn,
      signOut,
      status: auth.status,
    }),
    [
      auth,
      clearAuthMessage,
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