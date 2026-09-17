import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import StaffLoginPage from "../../src/pages/StaffLoginPage.jsx";
import useAuth from "../../src/hooks/useAuth.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  default: vi.fn(),
}));

function createAuth(overrides = {}) {
  return {
    authMessage: "",
    clearAuthMessage: vi.fn(),
    profile: null,
    session: null,
    setTowerScope: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    status: "unauthenticated",
    tower: "",
    ...overrides,
  };
}

function renderLogin({
  auth = createAuth(),
  initialEntry = "/staff/login",
} = {}) {
  useAuth.mockReturnValue(auth);

  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={<StaffLoginPage />}
          path="/staff/login"
        />

        <Route
          element={<h1>Staff dashboard</h1>}
          path="/staff"
        />

        <Route
          element={<h1>Visit history</h1>}
          path="/staff/history"
        />
      </Routes>
    </MemoryRouter>,
  );

  return {
    auth,
    ...view,
  };
}

async function completeLoginForm(
  user,
  tower = "tower_1",
) {
  await user.type(
    screen.getByRole("textbox", {
      name: /Email address/i,
    }),
    "  RECEPTIONIST.DEV@EXAMPLE.COM  ",
  );

  await user.selectOptions(
    screen.getByRole("combobox", {
      name: /Assigned Tower/i,
    }),
    tower,
  );

  await user.type(
    screen.getByLabelText(/^Password/i),
    "Invented development password",
  );
}

describe("StaffLoginPage", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("shows a session loading state", () => {
    renderLogin({
      auth: createAuth({
        status: "loading",
      }),
    });

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "Checking staff session…",
    );
  });

  it("redirects an authenticated staff member to the requested destination", async () => {
    renderLogin({
      auth: createAuth({
        profile: {
          fullName: "Test Receptionist",
          role: "receptionist",
        },
        session: {
          access_token:
            "synthetic-access-token",
        },
        status: "authenticated",
        tower: "tower_1",
      }),
      initialEntry: {
        pathname: "/staff/login",
        state: {
          from:
            "/staff/history?status=checked-in",
        },
      },
    });

    expect(
      await screen.findByRole("heading", {
        name: "Visit history",
      }),
    ).toBeInTheDocument();
  });

  it("shows validation errors without attempting sign-in", async () => {
    const user = userEvent.setup();
    const auth = createAuth();

    renderLogin({ auth });

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    expect(
      await screen.findByText(
        "Enter a valid email address.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Enter your password.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Select the tower where you will be working.",
      ),
    ).toBeInTheDocument();

    expect(
      auth.signIn,
    ).not.toHaveBeenCalled();
  });

  it("allows the password visibility to be toggled", async () => {
    const user = userEvent.setup();

    renderLogin();

    const passwordInput =
      screen.getByLabelText(/^Password/i);

    expect(passwordInput).toHaveAttribute(
      "type",
      "password",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Show password",
      }),
    );

    expect(passwordInput).toHaveAttribute(
      "type",
      "text",
    );

    expect(
      screen.getByRole("button", {
        name: "Hide password",
      }),
    ).toBeInTheDocument();
  });

  it("normalizes the email, submits the tower and returns to the requested protected route", async () => {
    const user = userEvent.setup();

    const auth = createAuth({
      signIn: vi
        .fn()
        .mockResolvedValue(true),
    });

    renderLogin({
      auth,
      initialEntry: {
        pathname: "/staff/login",
        state: {
          from:
            "/staff/history?status=checked-in",
        },
      },
    });

    await completeLoginForm(
      user,
      "tower_1",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    await waitFor(() => {
      expect(
        auth.signIn,
      ).toHaveBeenCalledWith({
        email:
          "receptionist.dev@example.com",
        password:
          "Invented development password",
        tower: "tower_1",
      });
    });

    expect(
      auth.clearAuthMessage,
    ).toHaveBeenCalledOnce();

    expect(
      await screen.findByRole("heading", {
        name: "Visit history",
      }),
    ).toBeInTheDocument();
  });

  it("shows the authentication error returned by sign-in", async () => {
    const user = userEvent.setup();

    const auth = createAuth({
      signIn: vi.fn().mockRejectedValue(
        new Error(
          "The email address or password is incorrect.",
        ),
      ),
    });

    renderLogin({ auth });

    await completeLoginForm(
      user,
      "tower_2",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    expect(
      await screen.findByText(
        "The email address or password is incorrect.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Sign-in unsuccessful",
      ),
    ).toBeInTheDocument();

    expect(
      auth.signIn,
    ).toHaveBeenCalledWith({
      email:
        "receptionist.dev@example.com",
      password:
        "Invented development password",
      tower: "tower_2",
    });
  });

  it("displays a session verification message from the authentication provider", () => {
    renderLogin({
      auth: createAuth({
        authMessage:
          "Your staff session has expired. Sign in again.",
      }),
    });

    expect(
      screen.getByText(
        "Your staff session has expired. Sign in again.",
      ),
    ).toBeInTheDocument();
  });

  it("rejects an unsafe post-login destination", async () => {
    const user = userEvent.setup();

    const auth = createAuth({
      signIn: vi
        .fn()
        .mockResolvedValue(true),
    });

    renderLogin({
      auth,
      initialEntry: {
        pathname: "/staff/login",
        state: {
          from: "//malicious.example",
        },
      },
    });

    await completeLoginForm(
      user,
      "tower_1",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    await waitFor(() => {
      expect(
        auth.signIn,
      ).toHaveBeenCalledWith({
        email:
          "receptionist.dev@example.com",
        password:
          "Invented development password",
        tower: "tower_1",
      });
    });

    expect(
      await screen.findByRole("heading", {
        name: "Staff dashboard",
      }),
    ).toBeInTheDocument();
  });
});