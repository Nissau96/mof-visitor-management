import {
  lazy,
  Suspense,
} from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

const ProtectedRoute = lazy(() =>
  import("./components/ProtectedRoute.jsx"),
);

const StaffLayout = lazy(() =>
  import("./layouts/StaffLayout.jsx"),
);

const VisitorLayout = lazy(() =>
  import("./layouts/VisitorLayout.jsx"),
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

const StaffHomePage = lazy(() =>
  import("./pages/StaffHomePage.jsx"),
);

const StaffLoginPage = lazy(() =>
  import("./pages/StaffLoginPage.jsx"),
);

const StaffVisitHistoryPage = lazy(() =>
  import(
    "./pages/StaffVisitHistoryPage.jsx"
  ),
);

const VisitorLandingPage = lazy(() =>
  import("./pages/VisitorLandingPage.jsx"),
);

function RouteLoadingState() {
  return (
    <div
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center bg-slate-50 px-4"
      role="status"
    >
      <div className="flex min-h-32 w-full max-w-md items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-800"
        />
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

        <Route element={<ProtectedRoute />}>
          <Route
            element={<StaffLayout />}
            path="staff"
          >
            <Route
              index
              element={<StaffHomePage />}
            />

            <Route
              element={
                <StaffVisitHistoryPage />
              }
              path="history"
            />

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
              <Navigate replace to="/visit" />
            }
          />

          <Route
            path="visit"
            element={<VisitorLandingPage />}
          />

          <Route
            path="visit/new"
            element={<NewVisitorPage />}
          />

          <Route
            path="visit/returning"
            element={<ReturningVisitorPage />}
          />

          <Route
            path="*"
            element={<NotFoundPage />}
          />
        </Route>
      </Routes>
    </Suspense>
  );
}