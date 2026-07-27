import { Navigate, Outlet, useLocation } from "react-router-dom";
import LoadingState from "./LoadingState.jsx";
import useAuth from "../hooks/useAuth.js";

export default function ProtectedRoute({
  allowedRoles = [],
}) {
  const location = useLocation();
  const { profile, session, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <LoadingState message="Verifying staff session…" />
      </div>
    );
  }

  if (
    status !== "authenticated" ||
    !session ||
    !profile
  ) {
    return (
      <Navigate
        replace
        state={{
          from: `${location.pathname}${location.search}`,
        }}
        to="/staff/login"
      />
    );
  }

  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(profile.role)
  ) {
    return <Navigate replace to="/staff" />;
  }

  return <Outlet />;
}