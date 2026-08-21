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
import VisitorAccessGate from "../../src/components/VisitorAccessGate.jsx";
import {
  ApiError,
  apiRequest,
} from "../../src/lib/api.js";

vi.mock("../../src/lib/api.js", async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
    apiRequest: vi.fn(),
  };
});

function renderGate({
  browserEntry = "/visit",
  routerEntry = "/visit",
} = {}) {
  window.history.replaceState(
    {},
    "",
    browserEntry,
  );

  return render(
    <MemoryRouter initialEntries={[routerEntry]}>
      <Routes>
        <Route element={<VisitorAccessGate />}>
          <Route
            element={<h1>Visitor application</h1>}
            path="/visit"
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("VisitorAccessGate", () => {
  beforeEach(() => {
    apiRequest.mockReset();

    window.history.replaceState(
      {},
      "",
      "/visit",
    );
  });

  it("shows a loading state while access is being checked", () => {
    apiRequest.mockReturnValue(
      new Promise(() => {}),
    );

    renderGate();

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "Verifying visitor access",
    );
  });

  it("exchanges a QR fragment and removes it from the browser URL", async () => {
    apiRequest.mockResolvedValue({
      access: {
        valid: true,
      },
    });

    renderGate({
      browserEntry:
        "/visit#weeklyAccess=synthetic-weekly-token",
    });

    expect(
      await screen.findByRole("heading", {
        name: "Visitor application",
      }),
    ).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({
        body: JSON.stringify({
          token:
            "synthetic-weekly-token",
        }),
        method: "PUT",
      }),
    );

    expect(window.location.pathname).toBe(
      "/visit",
    );

    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("checks the existing cookie when no QR fragment is present", async () => {
    apiRequest.mockResolvedValue({
      access: {
        valid: true,
      },
    });

    renderGate();

    expect(
      await screen.findByRole("heading", {
        name: "Visitor application",
      }),
    ).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("shows the reception QR instructions when access is denied", async () => {
    apiRequest.mockRejectedValue(
      new ApiError(
        "Synthetic unauthorised response.",
        401,
      ),
    );

    renderGate();

    expect(
      await screen.findByRole("heading", {
        name: "Scan the reception QR code",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Scan the current visitor QR code at reception to access the application.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a rate-limit message after too many access attempts", async () => {
    apiRequest.mockRejectedValue(
      new ApiError(
        "Synthetic rate-limit response.",
        429,
      ),
    );

    renderGate();

    expect(
      await screen.findByRole("heading", {
        name: "Access could not be verified",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Too many access attempts were made. Please wait before scanning the QR code again.",
      ),
    ).toBeInTheDocument();
  });

  it("checks access again when the visitor retries", async () => {
    const user = userEvent.setup();

    apiRequest
      .mockRejectedValueOnce(
        new ApiError(
          "Synthetic unauthorised response.",
          401,
        ),
      )
      .mockResolvedValueOnce({
        access: {
          valid: true,
        },
      });

    renderGate();

    await user.click(
      await screen.findByRole("button", {
        name: "Check access again",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Visitor application",
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledTimes(
        2,
      );
    });

    expect(apiRequest).toHaveBeenLastCalledWith(
      "/api/register",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
