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
import StaffSetupPage from "../../src/pages/StaffSetupPage.jsx";
import useAuth from "../../src/hooks/useAuth.js";
import {
  ApiError,
  apiRequest,
} from "../../src/lib/api.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  default: vi.fn(),
}));

vi.mock(
  "../../src/lib/api.js",
  async (importOriginal) => {
    const original =
      await importOriginal();

    return {
      ...original,
      apiRequest: vi.fn(),
    };
  },
);

const NEW_PASSWORD =
  "NewPersonalPassword!2026";

function createAuth(overrides = {}) {
  return {
    profile: {
      fullName:
        "Test Receptionist",
      passwordChangeRequired: true,
      role: "receptionist",
      temporaryPasswordExpiresAt:
        "2099-08-25T14:30:00.000Z",
    },
    session: {
      access_token:
        "isolated-access-token",
    },
    signOut:
      vi.fn().mockResolvedValue(
        undefined,
      ),
    status: "authenticated",
    ...overrides,
  };
}

function renderSetup({
  auth = createAuth(),
} = {}) {
  useAuth.mockReturnValue(auth);

  const view = render(
    <MemoryRouter
      initialEntries={[
        "/staff/setup",
      ]}
    >
      <Routes>
        <Route
          element={
            <StaffSetupPage />
          }
          path="/staff/setup"
        />

        <Route
          element={
            <h1>Staff sign-in</h1>
          }
          path="/staff/login"
        />

        <Route
          element={
            <h1>Staff dashboard</h1>
          }
          path="/staff"
        />

        <Route
          element={
            <h1>Visitor portal</h1>
          }
          path="/visit"
        />
      </Routes>
    </MemoryRouter>,
  );

  return {
    auth,
    ...view,
  };
}

async function completePasswordForm(
  user,
  {
    confirmPassword =
      NEW_PASSWORD,
    password =
      NEW_PASSWORD,
  } = {},
) {
  await user.type(
    screen.getByLabelText(
      /^New password/i,
    ),
    password,
  );

  await user.type(
    screen.getByLabelText(
      /^Confirm new password/i,
    ),
    confirmPassword,
  );
}

describe("StaffSetupPage", () => {
  beforeEach(() => {
    useAuth.mockReset();
    apiRequest.mockReset();
  });

  it("shows the account-checking state", () => {
    renderSetup({
      auth: createAuth({
        profile: null,
        session: null,
        status: "loading",
      }),
    });

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "Checking account setup…",
    );
  });

  it("requires unauthenticated staff to sign in", () => {
    renderSetup({
      auth: createAuth({
        profile: null,
        session: null,
        status:
          "unauthenticated",
      }),
    });

    expect(
      screen.getByRole("heading", {
        name: "Sign in required",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name:
          "Go to staff sign-in",
      }),
    ).toHaveAttribute(
      "href",
      "/staff/login",
    );
  });

  it("redirects a completed staff account to the dashboard", async () => {
    renderSetup({
      auth: createAuth({
        profile: {
          fullName:
            "Test Receptionist",
          passwordChangeRequired:
            false,
          role: "receptionist",
          temporaryPasswordExpiresAt:
            null,
        },
      }),
    });

    expect(
      await screen.findByRole(
        "heading",
        {
          name:
            "Staff dashboard",
        },
      ),
    ).toBeInTheDocument();
  });

  it("shows mandatory setup and temporary-password expiry", () => {
    renderSetup();

    expect(
      screen.getByRole("heading", {
        name:
          "Create your password",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Welcome, Test Receptionist/i,
      ),
    ).toBeInTheDocument();

    expect(
      screen.getAllByText(
        "Temporary password expires",
      ),
    ).toHaveLength(2);

    expect(
      screen.getByRole("button", {
        name:
          "Create password",
      }),
    ).toBeEnabled();
  });

  it("shows validation errors without calling the API", async () => {
    const user = userEvent.setup();

    renderSetup();

    await user.click(
      screen.getByRole("button", {
        name:
          "Create password",
      }),
    );

    expect(
      await screen.findAllByText(
        "Password must contain at least 12 characters.",
      ),
    ).toHaveLength(2);

    expect(
      apiRequest,
    ).not.toHaveBeenCalled();
  });

  it("changes the password, signs out and requires a fresh sign-in", async () => {
    const user = userEvent.setup();
    const auth = createAuth();

    apiRequest.mockResolvedValue({
      passwordChanged: true,
      requiresSignIn: true,
    });

    renderSetup({ auth });

    await completePasswordForm(
      user,
    );

    await user.click(
      screen.getByRole("button", {
        name:
          "Create password",
      }),
    );

    await waitFor(() => {
      expect(
        apiRequest,
      ).toHaveBeenCalledWith(
        "/api/staff/session",
        {
          body: JSON.stringify({
            confirmPassword:
              NEW_PASSWORD,
            password:
              NEW_PASSWORD,
          }),
          headers: {
            Authorization:
              "Bearer isolated-access-token",
          },
          method: "PUT",
        },
      );
    });

    expect(
      await screen.findByRole(
        "heading",
        {
          name:
            "Password created",
        },
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name:
          "Sign in with your new password",
      }),
    ).toHaveAttribute(
      "href",
      "/staff/login",
    );

    expect(
      auth.signOut,
    ).toHaveBeenCalledOnce();
  });

  it("shows the server message when the temporary password has expired", async () => {
    const user = userEvent.setup();

    apiRequest.mockRejectedValue(
      new ApiError(
        "Your temporary password has expired. Contact an administrator for a new temporary password.",
        403,
      ),
    );

    renderSetup();

    await completePasswordForm(
      user,
    );

    await user.click(
      screen.getByRole("button", {
        name:
          "Create password",
      }),
    );

    expect(
      await screen.findByText(
        "Your temporary password has expired. Contact an administrator for a new temporary password.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Password setup unsuccessful",
      ),
    ).toBeInTheDocument();
  });

  it("rejects setup when the access token is missing", async () => {
    const user = userEvent.setup();

    renderSetup({
      auth: createAuth({
        session: {},
      }),
    });

    await completePasswordForm(
      user,
    );

    await user.click(
      screen.getByRole("button", {
        name:
          "Create password",
      }),
    );

    expect(
      await screen.findByText(
        "Your temporary staff session has expired. Sign in again or contact an administrator.",
      ),
    ).toBeInTheDocument();

    expect(
      apiRequest,
    ).not.toHaveBeenCalled();
  });

  it("signs out and returns to sign-in when setup is cancelled", async () => {
    const user = userEvent.setup();
    const auth = createAuth();

    renderSetup({ auth });

    await user.click(
      screen.getByRole("button", {
        name: "Cancel setup",
      }),
    );

    expect(
      auth.signOut,
    ).toHaveBeenCalledOnce();

    expect(
      await screen.findByRole(
        "heading",
        {
          name: "Staff sign-in",
        },
      ),
    ).toBeInTheDocument();
  });
});
