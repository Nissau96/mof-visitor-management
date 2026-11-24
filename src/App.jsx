import {
  lazy,
  Suspense,
} from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import useAuth from "./hooks/useAuth.js";

const ProtectedRoute = lazy(() =>
  import("./components/ProtectedRoute.jsx"),
);

const VisitorAccessGate = lazy(() =>
  import(
    "./components/VisitorAccessGate.jsx"
  ),
);

const StaffLayout = lazy(() =>
  import("./layouts/StaffLayout.jsx"),
);

const VisitorLayout = lazy(() =>
  import("./layouts/VisitorLayout.jsx"),
);

const AdminHostsPage = lazy(() =>
  import("./pages/AdminHostsPage.jsx"),
);

const AdminVisitorCardsPage = lazy(() =>
  import(
    "./pages/AdminVisitorCardsPage.jsx"
  ),
);

const AdminStaffPage = lazy(() =>
  import("./pages/AdminStaffPage.jsx"),
);
const StaffActivityLogPage = lazy(() =>
  import("./pages/StaffActivityLogPage.jsx"),
);

const NewVisitorPage = lazy(() =>
  import("./pages/NewVisitorPage.jsx"),
);

const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage.jsx"),
);

const ReturningVisitorPage = lazy(() =>
  import("./pages/ReturningVisitorPage.jsx"),
);

const StaffMeetingsPage = lazy(() =>
  import("./pages/StaffMeetingsPage.jsx"),
);

const StaffHomePage = lazy(() =>
  import("./pages/StaffHomePage.jsx"),
);

const StaffVisitorCardsPage = lazy(() =>
  import(
    "./pages/StaffVisitorCardsPage.jsx"
  ),
);

const StaffLoginPage = lazy(() =>
  import("./pages/StaffLoginPage.jsx"),
);

const MicrosoftSignInCallbackPage = lazy(() =>
  import("./pages/MicrosoftSignInCallbackPage.jsx"),
);

const BookingLayout = lazy(() =>
  import("./layouts/BookingLayout.jsx"),
);

const BookMeetingPage = lazy(() =>
  import("./pages/BookMeetingPage.jsx"),
);

const MyBookingsPage = lazy(() =>
  import("./pages/MyBookingsPage.jsx"),
);

const StaffSetupPage = lazy(() =>
  import("./pages/StaffSetupPage.jsx"),
);

const StaffVisitHistoryPage = lazy(() =>
  import(
    "./pages/StaffVisitHistoryPage.jsx"
  ),
);

const StaffReportsPage = lazy(() =>
  import("./pages/StaffReportsPage.jsx"),
);

const StaffVisitorLinksPage = lazy(() =>
  import("./pages/StaffVisitorLinksPage.jsx"),
);

const BookInvitePage = lazy(() =>
  import("./pages/BookInvitePage.jsx"),
);

const VisitorInvitePage = lazy(() =>
  import("./pages/VisitorInvitePage.jsx"),
);

const StaffWifiPage = lazy(() =>
  import("./pages/StaffWifiPage.jsx"),
);

// Intern/NSP accounts do receptionist work but cannot generate reports;
// the server refuses their report requests too.
function ReportsRoute() {
  const { profile } = useAuth();

  return profile?.isNsp ? (
    <Navigate replace to="/staff" />
  ) : (
    <StaffReportsPage />
  );
}

const StaffWeeklyQrPage = lazy(() =>
  import(
    "./pages/StaffWeeklyQrPage.jsx"
  ),
);

const VisitorKioskPage = lazy(() =>
  import("./pages/VisitorKioskPage.jsx"),
);

const StaffFeedbackPage = lazy(() =>
  import("./pages/StaffFeedbackPage.jsx"),
);

const VisitorFeedbackPage = lazy(() =>
  import("./pages/VisitorFeedbackPage.jsx"),
);

const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage.jsx"),
);

const VisitorLandingPage = lazy(() =>
  import("./pages/VisitorLandingPage.jsx"),
);

function StaffIndexPage() {
  const { profile } = useAuth();

  if (
    profile?.role ===
      "client_service_head"
  ) {
    return (
      <Navigate
        replace
        to="/staff/cards"
      />
    );
  }

  // The IT network team only works Wi-Fi requests.
  if (profile?.role === "it_network_admin") {
    return <Navigate replace to="/staff/wifi" />;
  }

  return <StaffHomePage />;
}

function RouteLoadingState() {
  return (
    <div aria-live="polite" className="flex min-h-dvh items-center justify-center bg-slate-50 px-4" role="status">
      <div className="flex min-h-32 w-full max-w-md items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-800" />

        <span className="font-semibold">
          Loading application…
        </span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingState />}>
      <Routes>
        <Route
          element={<StaffLoginPage />}
          path="staff/login"
        />

        {/* Public privacy notice; also the policy URL given to Meta. */}
        <Route element={<PrivacyPage />} path="privacy" />

        {/* Public: the link visitors get on WhatsApp after check-out. */}
        <Route element={<VisitorFeedbackPage />} path="feedback/:token" />

        <Route
          element={<MicrosoftSignInCallbackPage />}
          path="staff/auth/microsoft"
        />

        <Route
          element={<StaffSetupPage />}
          path="staff/setup"
        />

        {/* Ministry staff book meetings for their guests. */}
        <Route element={<BookingLayout />} path="book">
          <Route index element={<BookMeetingPage />} />
          <Route element={<MyBookingsPage />} path="mine" />
          <Route element={<BookInvitePage />} path="invite" />
          <Route
            element={<Navigate replace to="/book" />}
            path="*"
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route
            element={<StaffLayout />}
            path="staff"
          >
            <Route
              index
              element={<StaffIndexPage />}
            />

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "receptionist",
                    "client_service_head",
                    "admin",
                  ]}
                />
              }
            >
              <Route
                element={
                  <StaffVisitorCardsPage />
                }
                path="cards"
              />

              <Route
                element={<StaffMeetingsPage />}
                path="meetings"
              />

              <Route
                element={<StaffVisitorLinksPage />}
                path="visitor-links"
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "it_network_admin",
                    "admin",
                  ]}
                />
              }
            >
              <Route
                element={<StaffWifiPage />}
                path="wifi"
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "receptionist",
                    "admin",
                  ]}
                />
              }
            >
              <Route
                element={
                  <StaffVisitHistoryPage />
                }
                path="history"
              />

              <Route
                element={<ReportsRoute />}
                path="reports"
              />

              <Route
                element={
                  <StaffWeeklyQrPage />
                }
                path="weekly-qr"
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["client_service_head", "admin"]}
                />
              }
            >
              <Route
                element={<StaffFeedbackPage />}
                path="feedback"
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["admin"]}
                />
              }
            >
              <Route
                element={<AdminHostsPage />}
                path="admin/hosts"
              />

              <Route
                element={
                  <AdminVisitorCardsPage />
                }
                path="admin/cards"
              />

              <Route
                element={<AdminStaffPage />}
                path="admin/staff"
              />

              <Route
                element={<StaffActivityLogPage />}
                path="admin/activity"
              />
            </Route>

            <Route
              path="*"
              element={
                <Navigate replace to="/staff" />
              }
            />
          </Route>
        </Route>

        <Route element={<VisitorLayout />}>
          <Route
            index
            element={
              <Navigate replace to="/visit/kiosk" />
            }
          />

          {/* Booking links are opened away from the building, so they
              do not need the weekly QR pass. */}
          <Route
            path="invite/:token"
            element={<VisitorInvitePage />}
          />

          <Route element={<VisitorAccessGate />}>
            <Route
              path="visit"
              element={<VisitorLandingPage />}
            />

            <Route
              path="visit/kiosk"
              element={<VisitorKioskPage />}
            />

            <Route
              path="visit/new"
              element={<NewVisitorPage />}
            />

            <Route
              path="visit/returning"
              element={<ReturningVisitorPage />}
            />
          </Route>

          <Route
            path="*"
            element={<NotFoundPage />}
          />
        </Route>
      </Routes>
    </Suspense>
  );
}