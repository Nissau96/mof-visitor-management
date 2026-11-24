import {
  Activity,
  Archive,
  Building2,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  Landmark,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareHeart,
  Moon,
  QrCode,
  Search,
  Smartphone,
  Sun,
  UserCog,
  Wifi,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import IdleSignOutDialog from "../components/IdleSignOutDialog.jsx";
import KioskDevicesDialog from "../components/KioskDevicesDialog.jsx";
import StaffQuickActions from "../components/StaffQuickActions.jsx";
import { quickActionsFor } from "../lib/visitorInvites.js";
import NotificationBell from "../components/NotificationBell.jsx";
import Toaster from "../components/Toaster.jsx";
import useAuth from "../hooks/useAuth.js";
import useStaffNotifications from "../hooks/useStaffNotifications.js";
import useWifiWaitingCount from "../hooks/useWifiWaitingCount.js";
import SidebarBadge from "../components/SidebarBadge.jsx";
import SiteCredit from "../components/SiteCredit.jsx";
import {
  BADGE_TONES,
  NAV_BADGE_SOURCES,
  mostUrgentBadgeTone,
  navBadgeFor,
} from "../lib/navBadges.js";
import {
  markIdleSignOut,
  useStaffIdleSignOut,
} from "../lib/staffIdle.js";
import {
  setTheme,
  useTheme,
} from "../lib/theme.js";

// Landscape tablets get an icon-only sidebar; the saved expand/collapse
// preference applies on desktop only.
const TABLET_LANDSCAPE_QUERY =
  "(min-width: 1024px) and (max-width: 1279.98px)";

function subscribeTabletLandscape(onChange) {
  const query = window.matchMedia(
    TABLET_LANDSCAPE_QUERY,
  );

  query.addEventListener("change", onChange);

  return () => {
    query.removeEventListener(
      "change",
      onChange,
    );
  };
}

function useTabletLandscape() {
  return useSyncExternalStore(
    subscribeTabletLandscape,
    () =>
      window.matchMedia(
        TABLET_LANDSCAPE_QUERY,
      ).matches,
    () => false,
  );
}

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
      "Unit Head",
    it_network_admin:
      "IT",
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

// Ctrl/Cmd+K focuses the field; Enter opens Visit History searched for
// the text. The text travels in router state so it never enters the URL.
function HistorySearch() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function handleShortcut(event) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    document.addEventListener(
      "keydown",
      handleShortcut,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleShortcut,
      );
    };
  }, []);

  function submit(event) {
    event.preventDefault();

    const search = value.trim();

    if (!search) {
      return;
    }

    navigate("/staff/history", {
      state: {
        historyFilters: {
          search,
        },
      },
    });
    setValue("");
    inputRef.current?.blur();
  }

  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={submit}
      role="search"
    >
      <label
        className="sr-only"
        htmlFor="staff-global-search"
      >
        Search visit history
      </label>

      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
      />

      <input
        autoComplete="off"
        className="min-h-12 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 py-2 pl-11 pr-4 sm:pr-20 text-sm text-slate-950 shadow-none outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
        id="staff-global-search"
        maxLength="80"
        onChange={(event) =>
          setValue(event.target.value)
        }
        placeholder="Search visitor or VIS reference"
        ref={inputRef}
        type="search"
        value={value}
      />

    </form>
  );
}

// Set up kiosk opens the kiosk dialog in place, so the mobile menu stays
// open behind it. White button and dark text are set with arbitrary
// values so the dark theme overrides for bg-white / text-brand-* leave
// this teal card alone.
function KioskCard({ collapsed }) {
  const [open, setOpen] = useState(false);

  const dialog = open ? (
    <KioskDevicesDialog onClose={() => setOpen(false)} />
  ) : null;

  if (collapsed) {
    return (
      <div className="hidden px-3 pb-3 lg:block">
        <button
          aria-label="Set up kiosk"
          className="grid min-h-11 w-full place-items-center rounded-xl bg-brand-800 text-white hover:bg-brand-900"
          onClick={() => setOpen(true)}
          title="Set up kiosk"
          type="button"
        >
          <Smartphone aria-hidden="true" className="size-5" />
        </button>
        {dialog}
      </div>
    );
  }

  return (
    <div className="p-3">
      <section
        aria-labelledby="sidebar-kiosk-heading"
        className="relative overflow-hidden rounded-3xl bg-brand-800 p-5 text-white"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full border border-white/15"
        >
          <span className="absolute inset-5 rounded-full border border-white/15" />
          <span className="absolute inset-10 rounded-full border border-white/15" />
        </span>

        <span
          aria-hidden="true"
          className="relative grid size-10 place-items-center rounded-xl bg-white/15"
        >
          <Smartphone className="size-5" />
        </span>

        <h2
          className="relative mt-4 font-black"
          id="sidebar-kiosk-heading"
        >
          Self-Check-In Kiosk
        </h2>

        <p className="relative mt-2 text-sm leading-6 text-white/90">
          Let visitors register on the lobby tablet while
          reception handles cards.
        </p>

        <button
          className="relative mt-5 flex min-h-11 w-full items-center justify-center rounded-full bg-[#ffffff] text-sm font-bold text-[#134e4a] transition hover:bg-[#f0fdfa]"
          onClick={() => setOpen(true)}
          type="button"
        >
          Set up kiosk
        </button>
      </section>
      {dialog}
    </div>
  );
}

function ThemeToggle() {
  const theme = useTheme();

  const dark = theme === "dark";

  return (
    <button
      aria-label={
        dark
          ? "Switch to light theme"
          : "Switch to dark theme"
      }
      className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-amber-500 shadow-sm transition hover:bg-slate-50"
      onClick={() =>
        setTheme(
          dark ? "light" : "dark",
        )
      }
      title={
        dark
          ? "Light theme"
          : "Dark theme"
      }
      type="button"
    >
      {dark ? (
        <Moon aria-hidden="true" className="size-5 text-brand-700" />
      ) : (
        <Sun aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}

function SidebarLink({
  badge,
  collapsed,
  end,
  external,
  icon: Icon,
  label,
  onNavigate,
  to,
}) {
  const baseClass = `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
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
      <SidebarBadge
        badge={badge}
        collapsed={collapsed}
      />
    </>
  );

  // Named in full so screen readers hear "Meetings, 3 need attention".
  const ariaLabel = badge
    ? `${label}, ${badge.count} need attention`
    : undefined;

  if (external) {
    return (
      <Link
        aria-label={ariaLabel}
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
      aria-label={ariaLabel}
      className={({ isActive }) =>
        `${baseClass} ${
          isActive
            ? "relative bg-brand-50 font-bold text-brand-800 before:absolute before:-left-3 before:inset-y-2 before:w-1 before:rounded-r-full before:bg-brand-600"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`
      }
      end={end}
      onClick={onNavigate}
      title={
        collapsed
          ? badge
            ? `${label} (${badge.count} need attention)`
            : label
          : undefined
      }
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

  const [
    collapsedPreference,
    setCollapsed,
  ] = useState(
    readCollapsedPreference,
  );

  const tabletLandscape =
    useTabletLandscape();

  const collapsed =
    collapsedPreference ||
    tabletLandscape;

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const {
    profile,
    session,
    signOut,
    tower,
  } = useAuth();

  const administrator =
    profile?.role === "admin";

  const receptionAccess =
    profile?.role === "receptionist" ||
    administrator;

  const location = useLocation();

  const {
    counts: attentionCounts,
    loadError: notificationsError,
    notifications,
    reload: reloadNotifications,
  } = useStaffNotifications({
    accessToken: session?.access_token || "",
    enabled: receptionAccess,
    refreshKey: location.pathname,
    tower: tower || "",
  });

  const itNetworkAdmin =
    profile?.role === "it_network_admin";

  // Visitor feedback: administrators and the client service head.
  const feedbackAccess =
    administrator || profile?.role === "client_service_head";

  // Wi-Fi requests: the IT network team, and administrators.
  const wifiAccess = itNetworkAdmin || administrator;

  const wifiWaiting = useWifiWaitingCount({
    accessToken: session?.access_token || "",
    enabled: wifiAccess,
    refreshKey: location.pathname,
  });

  // Intern (NSP) accounts keep the bell but get no menu badges.
  const badgeCounts =
    profile?.isNsp ||
    (!attentionCounts && wifiWaiting === null)
      ? null
      : { ...attentionCounts, wifiWaiting };

  const badgeFor = (path) =>
    navBadgeFor(badgeCounts, path);

  const menuButtonTone =
    mostUrgentBadgeTone(
      badgeCounts,
      Object.keys(NAV_BADGE_SOURCES),
    );

  // The Visitor Links page has its own Create button.
  const showQuickActions =
    Boolean(quickActionsFor(profile?.role)) &&
    location.pathname !== "/staff/visitor-links";

  const homePath =
    profile?.role ===
      "client_service_head"
      ? "/staff/cards"
      : itNetworkAdmin
        ? "/staff/wifi"
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

  async function handleSignOut(reason = "manual") {
    setSignOutError("");
    setSigningOut(true);

    try {
      await signOut({ reason });
    } catch (error) {
      setSignOutError(
        error instanceof Error && error.message
          ? error.message
          : "Sign-out could not be completed.",
      );

      setSigningOut(false);
    }
  }

  const idle = useStaffIdleSignOut({
    enabled: Boolean(session),
    onExpire() {
      markIdleSignOut();
      void handleSignOut("idle");
    },
  });

  const kioskCard = receptionAccess ? (
    <KioskCard collapsed={collapsed} />
  ) : null;

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-950 lg:flex lg:gap-4 lg:p-4 print:block print:min-h-0 print:bg-white print:p-0">
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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:shrink-0 lg:translate-x-0 lg:overflow-hidden lg:rounded-3xl lg:border lg:shadow-sm print:hidden ${
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
            className={`inline-flex min-w-0 flex-1 items-center gap-3 rounded-xl ${
              collapsed ? "lg:flex-none" : ""
            }`}
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

          {!collapsed &&
          !tabletLandscape ? (
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
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-6"
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
                  label="Dashboard"
                  onNavigate={closeMobile}
                  to="/staff"
                  badge={badgeFor("/staff")}
                />
                <SidebarLink
                  collapsed={collapsed}
                  icon={History}
                  label="Visit History"
                  onNavigate={closeMobile}
                  to="/staff/history"
                  badge={badgeFor("/staff/history")}
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

            {itNetworkAdmin ? null : (
              <SidebarLink
                collapsed={collapsed}
                icon={CreditCard}
                label="Visitor Cards"
                onNavigate={closeMobile}
                to="/staff/cards"
                badge={badgeFor("/staff/cards")}
              />
            )}

            {/* Intern/NSP accounts cannot generate reports. */}
            {receptionAccess && !profile?.isNsp ? (
              <SidebarLink
                collapsed={collapsed}
                icon={ChartColumn}
                label="Analytics & Reports"
                onNavigate={closeMobile}
                to="/staff/reports"
              />
            ) : null}

            {feedbackAccess ? (
              <SidebarLink
                collapsed={collapsed}
                icon={MessageSquareHeart}
                label="Visitor Feedback"
                onNavigate={closeMobile}
                to="/staff/feedback"
              />
            ) : null}

            {itNetworkAdmin ? null : (
              <SidebarLink
                collapsed={collapsed}
                icon={CalendarDays}
                label="Meetings"
                onNavigate={closeMobile}
                to="/staff/meetings"
                badge={badgeFor("/staff/meetings")}
              />
            )}

            {itNetworkAdmin ? null : (
              <SidebarLink
                collapsed={collapsed}
                icon={Link2}
                label="Visitor Links"
                onNavigate={closeMobile}
                to="/staff/visitor-links"
              />
            )}

            {wifiAccess ? (
              <SidebarLink
                collapsed={collapsed}
                icon={Wifi}
                label="WiFi Access"
                onNavigate={closeMobile}
                to="/staff/wifi"
                badge={badgeFor("/staff/wifi")}
              />
            ) : null}

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
                badge={badgeFor("/staff/admin/cards")}
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
              <SidebarLink
                collapsed={collapsed}
                icon={Activity}
                label="Activity Log"
                onNavigate={closeMobile}
                to="/staff/admin/activity"
              />
            </SidebarGroup>
          ) : null}
        </nav>

        {kioskCard}

        {collapsed &&
        !tabletLandscape ? (
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

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-0 lg:gap-4 print:block print:min-h-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:top-4 lg:rounded-3xl lg:border lg:shadow-sm print:hidden">
          <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6">
            <button
              aria-controls="staff-sidebar"
              aria-expanded={mobileOpen}
              aria-label={
                menuButtonTone
                  ? "Open navigation menu, some pages need attention"
                  : "Open navigation menu"
              }
              className="relative grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() =>
                setMobileOpen(true)
              }
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" />
              {menuButtonTone ? (
                <span
                  aria-hidden="true"
                  className={`absolute -right-1 -top-1 size-3 rounded-full ring-2 ring-white ${BADGE_TONES[menuButtonTone].dot}`}
                />
              ) : null}
            </button>

            {receptionAccess ? (
              <HistorySearch />
            ) : (
              <div className="flex-1" />
            )}

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <ThemeToggle />

              {receptionAccess &&
              session?.access_token ? (
                <NotificationBell
                  loadError={notificationsError}
                  notifications={notifications}
                  onReload={reloadNotifications}
                  userId={
                    session.user?.id ||
                    "staff"
                  }
                />
              ) : null}

            <UserMenu
              onSignOut={() => void handleSignOut("manual")}
              profile={profile}
              signingOut={signingOut}
            />
            </div>
          </div>
        </header>

        {signOutError ? (
          <div className="px-4 pt-4 print:hidden sm:px-6 lg:px-0 lg:pt-0" role="alert">
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              {signOutError}
            </p>
          </div>
        ) : null}

        <main
          className="flex-1 print:block"
          id="staff-main-content"
          tabIndex="-1"
        >
          <Outlet />
        </main>

        {/* On desktop this is a 64px row whose bottom edge meets the
            sidebar's, level with the floating booking button (also 64px,
            16px from the bottom). On phones the bottom padding keeps the
            button clear of the line. */}
        <footer
          className={`px-4 pt-4 sm:px-6 lg:flex lg:min-h-16 lg:items-center lg:justify-center lg:px-0 lg:py-0 print:hidden ${
            showQuickActions ? "pb-24" : "pb-6"
          }`}
        >
          <SiteCredit />
        </footer>
      </div>

      <Toaster />

      {showQuickActions ? (
        <StaffQuickActions
          accessToken={session?.access_token || ""}
          fullName={profile?.fullName || ""}
          role={profile?.role}
          tower={tower || ""}
        />
      ) : null}

      {idle.phase === "warning" && !signingOut ? (
        <IdleSignOutDialog
          onSignOut={() => void handleSignOut()}
          onStay={idle.staySignedIn}
          secondsLeft={idle.secondsLeft}
          signingOut={signingOut}
        />
      ) : null}
    </div>
  );
}
