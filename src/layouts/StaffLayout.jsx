import {
  Building2,
  ExternalLink,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
} from "react-router-dom";
import useAuth from "../hooks/useAuth.js";

function getNavigationClass({ isActive }) {
  return `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold ${
    isActive
      ? "bg-brand-50 text-brand-900"
      : "text-slate-700 hover:bg-slate-100"
  }`;
}

export default function StaffLayout() {
  const [signOutError, setSignOutError] =
    useState("");

  const [signingOut, setSigningOut] =
    useState(false);

  const { profile, signOut } = useAuth();

  async function handleSignOut() {
    setSignOutError("");
    setSigningOut(true);

    try {
      await signOut();
    } catch (error) {
      setSignOutError(
        error instanceof Error && error.message
          ? error.message
          : "Sign-out could not be completed.",
      );
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 text-slate-950">
      <a
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#staff-main-content"
      >
        Skip to main content
      </a>

      <div
        aria-hidden="true"
        className="h-1.5 bg-accent"
      />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            className="inline-flex min-h-12 items-center gap-3 rounded-xl"
            to="/staff"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-brand-800 text-white">
              <Building2
                aria-hidden="true"
                className="size-6"
              />
            </span>

            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.14em] text-brand-800">
                Ministry of Finance
              </span>
              <span className="block font-bold">
                Staff portal
              </span>
            </span>
          </Link>

          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            disabled={signingOut}
            onClick={handleSignOut}
            type="button"
          >
            {signingOut ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <LogOut
                aria-hidden="true"
                className="size-4"
              />
            )}

            <span className="hidden sm:inline">
              {signingOut
                ? "Signing out…"
                : "Sign out"}
            </span>
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Staff navigation"
          className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8"
        >
          <NavLink
            className={getNavigationClass}
            end
            to="/staff"
          >
            <LayoutDashboard
              aria-hidden="true"
              className="size-4"
            />
            Dashboard
          </NavLink>

          <NavLink
            className={getNavigationClass}
            to="/staff/history"
          >
            <History
              aria-hidden="true"
              className="size-4"
            />
            Visit history
          </NavLink>

          <Link
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold text-slate-700 hover:bg-slate-100"
            to="/visit"
          >
            <ExternalLink
              aria-hidden="true"
              className="size-4"
            />
            Visitor portal
          </Link>
        </nav>
      </div>

      {signOutError ? (
        <div
          className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 lg:px-8"
          role="alert"
        >
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {signOutError}
          </p>
        </div>
      ) : null}

      <main
        className="flex-1"
        id="staff-main-content"
        tabIndex="-1"
      >
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-5 text-sm text-slate-600 sm:px-6 md:flex-row md:justify-between lg:px-8">
          <p>
            Signed in as {profile?.fullName}.
          </p>
          <p className="capitalize">
            Role: {profile?.role}
          </p>
        </div>
      </footer>
    </div>
  );
}