import {
  render,
  screen,
} from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import ProtectedRoute from "../../src/components/ProtectedRoute.jsx";
import useAuth from "../../src/hooks/useAuth.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  default: vi.fn(),
}));

const AUTHENTICATED_RECEPTIONIST = {
  profile: {
    fullName: "Test Receptionist",
    role: "receptionist",
  },
  session: {
    access_token: "synthetic-access-token",
  },
  status: "authenticated",
};

function LoginDestination() {
  const location = useLocation();

  return (
    <div>
      <h1>Staff login</h1>
      <output data-testid="requested-destination">
        {location.state?.from || ""}
      </output>
    </div>
  );
}

function renderProtectedRoute({
  allowedRoles = [],
  auth = AUTHENTICATED_RECEPTIONIST,
  initialEntry =
    "/staff/history?status=checked-in",
} = {}) {
  useAuth.mockReturnValue(auth);

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={<LoginDestination />}
          path="/staff/login"
        />

        <Route
          element={<h1>Staff home</h1>}
          path="/staff"
        />

        <Route
          element={
            <ProtectedRoute
              allowedRoles={allowedRoles}
            />
          }
        >
          <Route
            element={<h1>Visit history</h1>}
            path="/staff/history"
          />

          <Route
            element={<h1>Admin management</h1>}
            path="/staff/admin"
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("shows a session verification state while authentication loads", () => {
    renderProtectedRoute({
      auth: {
        profile: null,
        session: null,
        status: "loading",
      },
    });

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "Verifying staff session…",
    );
  });

  it("redirects an unauthenticated visitor to staff login", async () => {
    renderProtectedRoute({
      auth: {
        profile: null,
        session: null,
        status: "unauthenticated",
      },
    });

    expect(
      await screen.findByRole("heading", {
        name: "Staff login",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByTestId(
        "requested-destination",
      ),
    ).toHaveTextContent(
      "/staff/history?status=checked-in",
    );
  });

  it("redirects when an authenticated state is missing its profile", async () => {
    renderProtectedRoute({
      auth: {
        profile: null,
        session: {
          access_token:
            "synthetic-access-token",
        },
        status: "authenticated",
      },
    });

    expect(
      await screen.findByRole("heading", {
        name: "Staff login",
      }),
    ).toBeInTheDocument();
  });

  it("renders the protected route for an authenticated receptionist", () => {
    renderProtectedRoute();

    expect(
      screen.getByRole("heading", {
        name: "Visit history",
      }),
    ).toBeInTheDocument();
  });

  it("redirects a receptionist away from an administrator-only route", async () => {
    renderProtectedRoute({
      allowedRoles: ["admin"],
      initialEntry: "/staff/admin",
    });

    expect(
      await screen.findByRole("heading", {
        name: "Staff home",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Admin management",
      }),
    ).not.toBeInTheDocument();
  });

  it("permits an administrator to access an administrator-only route", () => {
    renderProtectedRoute({
      allowedRoles: ["admin"],
      auth: {
        ...AUTHENTICATED_RECEPTIONIST,
        profile: {
          fullName: "Test Administrator",
          role: "admin",
        },
      },
      initialEntry: "/staff/admin",
    });

    expect(
      screen.getByRole("heading", {
        name: "Admin management",
      }),
    ).toBeInTheDocument();
  });
});