import {
  Archive,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  History,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  QrCode,
  UserCog,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
} from "react-router-dom";
import useAuth from "../hooks/useAuth.js";

const COLLAPSED_STORAGE_KEY =
  "mof-staff-sidebar-collapsed";

function readCollapsedPreference() {
  try {
    return (
      window.localStorage.getItem(
        COLLAPSED_STORAGE_KEY,
      ) === "true"
    );
  } catch {
    return false;
  }
}

function getRoleLabel(role) {
  const labels = {
    admin: "Super Administrator",
    client_service_head:
      "Client Service Head",
    receptionist: "Receptionist",
  };

  return labels[role] || "Staff";
}

function getInitials(fullName = "") {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "S";
}

function SidebarLink({
  collapsed,
  end,
  external,
  icon: Icon,
  label,
  onNavigate,
  to,
}) {
  const baseClass = `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
    collapsed ? "lg:justify-center lg:px-0" : ""
  }`;

  const content = (
    <>
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0"
      />
      <span className={collapsed ? "lg:sr-only" : ""}>
        {label}
      </span>
    </>
  );

  if (external) {
    return (
      <Link
        className={`${baseClass} text-slate-600 hover:bg-slate-100 hover:text-slate-900`}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        to={to}
      >
        {content}
      </Link>
    );
  }

  return (
    <NavLink
      className={({ isActive }) =>
        `${baseClass} ${
          isActive
            ? "bg-brand-50 text-brand-900 ring-1 ring-brand-100"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`
      }
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      to={to}
    >
      {content}
    </NavLink>
  );
}

function SidebarGroup({
  children,
  collapsed,
  label,
}) {
  return (
    <div className="grid gap-1">
      <p
        className={`px-3 pb-1 pt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 ${
          collapsed ? "lg:sr-only" : ""
        }`}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function UserMenu({
  onSignOut,
  profile,
  signingOut,
}) {
  const [open, setOpen] =
    useState(false);

  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointer(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(
          event.target,
        )
      ) {
        setOpen(false);
      }
    }

    function handleKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointer,
    );
    document.addEventListener(
      "keydown",
      handleKey,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointer,
      );
      document.removeEventListener(
        "keydown",
        handleKey,
      );
    };
  }, [open]);

  return (
    <div
      className="relative"
      ref={menuRef}
    >
      <button
        aria-controls="staff-user-menu"
        aria-expanded={open}
        className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-left shadow-sm transition hover:bg-slate-50"
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
        type="button"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-800 text-sm font-black text-white"
        >
          {getInitials(
            profile?.fullName,
          )}
        </span>

        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-bold text-slate-950">
            {profile?.fullName}
          </span>
          <span className="block text-xs text-slate-500">
            {getRoleLabel(
              profile?.role,
            )}
          </span>
        </span>

        <span className="sr-only sm:hidden">
          Account menu
        </span>

        <ChevronDown
          aria-hidden="true"
          className={`size-4 text-slate-500 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
          id="staff-user-menu"
        >
          <div className="px-3 py-2 sm:hidden">
            <p className="truncate text-sm font-bold text-slate-950">
              {profile?.fullName}
            </p>
            <p className="text-xs text-slate-500">
              {getRoleLabel(
                profile?.role,
              )}
            </p>
          </div>

          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
            disabled={signingOut}
            onClick={onSignOut}
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
            {signingOut
              ? "Signing out…"
              : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function StaffLayout() {
  const [signOutError, setSignOutError] =
    useState("");

  const [signingOut, setSigningOut] =
    useState(false);

  const [collapsed, setCollapsed] =
    useState(
      readCollapsedPreference,
    );

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const { profile, signOut } = useAuth();

  const administrator =
    profile?.role === "admin";

  const receptionAccess =
    profile?.role === "receptionist" ||
    administrator;

  const homePath =
    profile?.role ===
      "client_service_head"
      ? "/staff/cards"
      : "/staff";

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    function handleKey(event) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    document.addEventListener(
      "keydown",
      handleKey,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKey,
      );
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(
          COLLAPSED_STORAGE_KEY,
          String(next),
        );
      } catch {
        // Preference is a convenience only.
      }

      return next;
    });
  }

  function closeMobile() {
    setMobileOpen(false);
  }

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

  const kioskLink = (
    <SidebarLink
      collapsed={collapsed}
      external
      icon={ExternalLink}
      label="Self-Check-In Kiosk"
      onNavigate={closeMobile}
      to="/visit"
    />
  );

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950 lg:flex print:block print:min-h-0 print:bg-white">
      <a className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 print:hidden" href="#staff-main-content">
        Skip to main content
      </a>

      {mobileOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden print:hidden"
          onClick={closeMobile}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:shrink-0 lg:translate-x-0 print:hidden ${
          mobileOpen
            ? "translate-x-0"
            : "max-lg:invisible -translate-x-full"
        } ${collapsed ? "lg:w-20" : "lg:w-64"}`}
        id="staff-sidebar"
      >
        <div
          className={`flex min-h-20 items-center gap-3 border-b border-slate-100 px-4 ${
            collapsed ? "lg:justify-center lg:px-2" : ""
          }`}
        >
          <Link
            className="inline-flex min-w-0 flex-1 items-center gap-3 rounded-xl"
            onClick={closeMobile}
            to={homePath}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-800 text-white">
              <Building2 aria-hidden="true" className="size-6" />
            </span>

            <span className={`min-w-0 ${collapsed ? "lg:sr-only" : ""}`}>
              <span className="block whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] text-brand-800">
                Ministry of Finance
              </span>
              <span className="block font-black text-slate-950">
                Staff Portal
              </span>
            </span>
          </Link>

          <button
            aria-label="Close navigation menu"
            className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={closeMobile}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>

          {!collapsed ? (
            <button
              aria-label="Collapse sidebar"
              className="hidden size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:grid"
              onClick={toggleCollapsed}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
          ) : null}
        </div>

        <nav
          aria-label="Staff navigation"
          className="flex-1 overflow-y-auto px-3 pb-6"
        >
          <SidebarGroup
            collapsed={collapsed}
            label="Workspace"
          >
            {receptionAccess ? (
              <>
                <SidebarLink
                  collapsed={collapsed}
                  end
                  icon={LayoutDashboard}
                  label={
                    administrator
                      ? "Admin Command Center"
                      : "Reception Dashboard"
                  }
                  onNavigate={closeMobile}
                  to="/staff"
                />
                <SidebarLink
                  collapsed={collapsed}
                  icon={History}
                  label="Visit History"
                  onNavigate={closeMobile}
                  to="/staff/history"
                />
                <SidebarLink
                  collapsed={collapsed}
                  icon={QrCode}
                  label="Weekly QR Passes"
                  onNavigate={closeMobile}
                  to="/staff/weekly-qr"
                />
              </>
            ) : null}

            <SidebarLink
              collapsed={collapsed}
              icon={CreditCard}
              label="Visitor Cards"
              onNavigate={closeMobile}
              to="/staff/cards"
            />

            {!administrator ? kioskLink : null}
          </SidebarGroup>

          {administrator ? (
            <SidebarGroup
              collapsed={collapsed}
              label="Management"
            >
              <SidebarLink
                collapsed={collapsed}
                icon={Archive}
                label="Card Inventory"
                onNavigate={closeMobile}
                to="/staff/admin/cards"
              />
              <SidebarLink
                collapsed={collapsed}
                icon={Landmark}
                label="Hosts & Divisions"
                onNavigate={closeMobile}
                to="/staff/admin/hosts"
              />
              <SidebarLink
                collapsed={collapsed}
                icon={UserCog}
                label="Staff Directory"
                onNavigate={closeMobile}
                to="/staff/admin/staff"
              />
              {kioskLink}
            </SidebarGroup>
          ) : null}
        </nav>

        {collapsed ? (
          <div className="hidden border-t border-slate-100 p-3 lg:block">
            <button
              aria-label="Expand sidebar"
              className="grid min-h-10 w-full place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={toggleCollapsed}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:justify-end lg:px-8">
            <button
              aria-controls="staff-sidebar"
              aria-expanded={mobileOpen}
              aria-label="Open navigation menu"
              className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() =>
                setMobileOpen(true)
              }
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>

            <UserMenu
              onSignOut={handleSignOut}
              profile={profile}
              signingOut={signingOut}
            />
          </div>
        </header>

        {signOutError ? (
          <div className="px-4 pt-4 print:hidden sm:px-6 lg:px-8" role="alert">
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              {signOutError}
            </p>
          </div>
        ) : null}

        <main className="flex-1 print:block" id="staff-main-content" tabIndex="-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
