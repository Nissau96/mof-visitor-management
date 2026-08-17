import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  LoaderCircle,
  LogIn,
  LogOut,
  Phone,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
} from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";
import { receptionDashboardSchema } from "../validation/receptionDashboard.js";

const EMPTY_FILTERS = {
  agency: "",
  division: "",
  query: "",
};

const dateTimeFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  },
);

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return dateTimeFormatter.format(date);
}

function getVisitContact(visitor) {
  if (visitor.purpose === "Meeting") {
    return visitor.meetingTitle || "Meeting";
  }

  return visitor.personVisiting || "Not provided";
}

function normalizeDashboardResult(result) {
  if (
    !result ||
    typeof result !== "object" ||
    !result.stats ||
    typeof result.stats !== "object" ||
    !result.pagination ||
    typeof result.pagination !== "object" ||
    !Array.isArray(result.visitors)
  ) {
    throw new Error(
      "The dashboard returned an invalid response.",
    );
  }

  const stats = {
    active: Number(result.stats.active),
    checkedInToday: Number(
      result.stats.checkedInToday,
    ),
    checkedOutToday: Number(
      result.stats.checkedOutToday,
    ),
  };

  const pagination = {
    page: Number(result.pagination.page),
    pageSize: Number(
      result.pagination.pageSize,
    ),
    totalCount: Number(
      result.pagination.totalCount,
    ),
    totalPages: Number(
      result.pagination.totalPages,
    ),
  };

  const validStats = Object.values(stats).every(
    (value) =>
      Number.isInteger(value) && value >= 0,
  );

  const validPagination = Object.values(
    pagination,
  ).every(
    (value) =>
      Number.isInteger(value) && value >= 0,
  );

  const validVisitors = result.visitors.every(
    (visitor) =>
      visitor &&
      typeof visitor === "object" &&
      typeof visitor.visitId === "string" &&
      typeof visitor.reference === "string" &&
      typeof visitor.fullName === "string" &&
      typeof visitor.agency === "string" &&
      typeof visitor.purpose === "string" &&
      typeof visitor.checkedInAt === "string",
  );

  if (
    !validStats ||
    !validPagination ||
    !validVisitors
  ) {
    throw new Error(
      "The dashboard returned an invalid response.",
    );
  }

  return {
    generatedAt:
      typeof result.generatedAt === "string"
        ? result.generatedAt
        : "",
    pagination,
    stats,
    visitors: result.visitors,
  };
}

function normalizeCheckoutResult(result) {
  const checkout = result?.checkout;

  if (
    !checkout ||
    typeof checkout !== "object" ||
    typeof checkout.visitId !== "string" ||
    typeof checkout.reference !== "string" ||
    checkout.status !== "checked_out" ||
    typeof checkout.checkedOutAt !== "string"
  ) {
    throw new Error(
      "Check-out returned an invalid response.",
    );
  }

  return {
    alreadyCheckedOut: Boolean(
      checkout.alreadyCheckedOut,
    ),
    checkedOutAt: checkout.checkedOutAt,
    reference: checkout.reference,
    status: checkout.status,
    visitId: checkout.visitId,
  };
}

function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= 5) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const start = Math.min(
    Math.max(currentPage - 2, 1),
    totalPages - 4,
  );

  return Array.from(
    { length: 5 },
    (_, index) => start + index,
  );
}

export default function StaffHomePage() {
  const { profile, session, signOut } = useAuth();

  const [dashboard, setDashboard] =
    useState(null);

  const [status, setStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [filterError, setFilterError] =
    useState("");

  const [filters, setFilters] =
    useState(EMPTY_FILTERS);

  const [queryDraft, setQueryDraft] =
    useState("");

  const [agencyDraft, setAgencyDraft] =
    useState("");

  const [divisionDraft, setDivisionDraft] =
    useState("");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [checkoutTarget, setCheckoutTarget] =
    useState(null);

  const [checkoutError, setCheckoutError] =
    useState("");

  const [checkoutSuccess, setCheckoutSuccess] =
    useState("");

  const [checkingOut, setCheckingOut] =
    useState(false);

  const accessToken =
    session?.access_token || "";

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/api/staff/dashboard", {
      body: JSON.stringify({
        agency: filters.agency,
        division: filters.division,
        page,
        query: filters.query,
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        const normalized =
          normalizeDashboardResult(result);

        setDashboard(normalized);
        setRequestError("");
        setStatus("ready");
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          (error.status === 401 ||
            error.status === 403)
        ) {
          void signOut().catch(() => undefined);
          return;
        }

        setRequestError(
          error instanceof Error && error.message
            ? error.message
            : "Dashboard information could not be loaded. Please try again.",
        );

        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    filters,
    page,
    refreshKey,
    signOut,
  ]);

  function submitFilters(event) {
    event.preventDefault();
    setFilterError("");

    const parsed =
      receptionDashboardSchema.safeParse({
        agency: agencyDraft,
        division: divisionDraft,
        page: 1,
        query: queryDraft,
      });

    if (!parsed.success) {
      setFilterError(
        parsed.error.issues[0]?.message ||
          "Check the dashboard filters and try again.",
      );
      return;
    }

    const nextFilters = {
      agency: parsed.data.agency,
      division: parsed.data.division,
      query: parsed.data.query,
    };

    setDashboard(null);
    setStatus("loading");
    setPage(1);
    setFilters(nextFilters);

    if (
      page === 1 &&
      filters.agency === nextFilters.agency &&
      filters.division ===
        nextFilters.division &&
      filters.query === nextFilters.query
    ) {
      setRefreshKey(
        (currentKey) => currentKey + 1,
      );
    }
  }

  function clearFilters() {
    setQueryDraft("");
    setAgencyDraft("");
    setDivisionDraft("");
    setFilterError("");
    setDashboard(null);
    setStatus("loading");
    setPage(1);
    setFilters(EMPTY_FILTERS);
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  function refreshDashboard() {
    setRequestError("");
    setStatus("loading");
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  function goToPage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage === page ||
      nextPage >
        (dashboard?.pagination.totalPages || 1)
    ) {
      return;
    }

    setDashboard(null);
    setRequestError("");
    setStatus("loading");
    setPage(nextPage);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  function changeAgency(event) {
    const nextAgency = event.target.value;

    setAgencyDraft(nextAgency);

    if (
      nextAgency !==
      MINISTRY_OF_FINANCE_AGENCY
    ) {
      setDivisionDraft("");
    }
  }

  function openCheckout(visitor) {
    setCheckoutError("");
    setCheckoutSuccess("");
    setCheckoutTarget(visitor);
  }

  function closeCheckout() {
    if (checkingOut) {
      return;
    }

    setCheckoutError("");
    setCheckoutTarget(null);
  }

  async function confirmCheckout() {
    if (!checkoutTarget || checkingOut) {
      return;
    }

    setCheckoutError("");
    setCheckingOut(true);

    try {
      const result = await apiRequest(
        "/api/staff/checkout",
        {
          body: JSON.stringify({
            visitId: checkoutTarget.visitId,
          }),
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          method: "POST",
        },
      );

      const checkout =
        normalizeCheckoutResult(result);

      const visitorName =
        checkoutTarget.fullName;

      setCheckoutTarget(null);

      setCheckoutSuccess(
        checkout.alreadyCheckedOut
          ? `${visitorName} was already checked out at ${formatDateTime(
              checkout.checkedOutAt,
            )}.`
          : `${visitorName} has been checked out successfully at ${formatDateTime(
              checkout.checkedOutAt,
            )}.`,
      );

      setDashboard(null);
      setRequestError("");
      setStatus("loading");
      setPage(1);
      setRefreshKey(
        (currentKey) => currentKey + 1,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 ||
          error.status === 403)
      ) {
        void signOut().catch(() => undefined);
        return;
      }

      setCheckoutError(
        error instanceof Error && error.message
          ? error.message
          : "Check-out could not be completed. Please try again.",
      );
    } finally {
      setCheckingOut(false);
    }
  }

  const loading = status === "loading";

  const filtersApplied = Boolean(
    filters.agency ||
      filters.division ||
      filters.query,
  );

  const visiblePages = getVisiblePages(
    page,
    dashboard?.pagination.totalPages || 0,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Reception dashboard
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Welcome, {profile.fullName}
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            Review visitors who are currently checked in
            and record their departure securely.
          </p>
        </div>

        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={refreshDashboard}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-5 ${
              loading ? "animate-spin" : ""
            }`}
          />
          Refresh dashboard
        </button>
      </header>

      {checkoutSuccess ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
          role="status"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-emerald-700"
          />

          <p className="flex-1 text-sm font-semibold leading-6">
            {checkoutSuccess}
          </p>

          <button
            aria-label="Dismiss check-out confirmation"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-100"
            onClick={() =>
              setCheckoutSuccess("")
            }
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-4"
            />
          </button>
        </div>
      ) : null}

      {dashboard ? (
        <section
          aria-label="Reception statistics"
          className="mt-8 grid gap-4 sm:grid-cols-3"
        >
          <MetricCard
            icon={Users}
            label="Currently checked in"
            tone="brand"
            value={dashboard.stats.active}
          />

          <MetricCard
            icon={LogIn}
            label="Checked in today"
            tone="emerald"
            value={
              dashboard.stats.checkedInToday
            }
          />

          <MetricCard
            icon={LogOut}
            label="Checked out today"
            tone="slate"
            value={
              dashboard.stats.checkedOutToday
            }
          />
        </section>
      ) : null}

      <section
        aria-labelledby="dashboard-filters-heading"
        className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
      >
        <div className="flex flex-col gap-2">
          <h2
            className="text-xl font-black text-slate-950"
            id="dashboard-filters-heading"
          >
            Search and filter
          </h2>

          <p className="text-sm leading-6 text-slate-600">
            Search by visitor name or visit reference.
            Search values are submitted in the request body
            and are not added to the URL.
          </p>
        </div>

        <form
          className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr_1fr_auto]"
          noValidate
          onSubmit={submitFilters}
        >
          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="dashboard-query"
            >
              Name or reference
            </label>

            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              />

              <input
                aria-describedby={
                  filterError
                    ? "dashboard-filter-error"
                    : undefined
                }
                autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pl-12 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100"
                id="dashboard-query"
                maxLength="80"
                onChange={(event) =>
                  setQueryDraft(
                    event.target.value,
                  )
                }
                placeholder="Name or VIS-reference"
                type="search"
                value={queryDraft}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="dashboard-agency"
            >
              Agency
            </label>

            <select
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100"
              id="dashboard-agency"
              onChange={changeAgency}
              value={agencyDraft}
            >
              <option value="">All agencies</option>

              {VISIT_AGENCIES.map((agency) => (
                <option
                  key={agency}
                  value={agency}
                >
                  {agency}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="dashboard-division"
            >
              Ministry division
            </label>

            <select
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              disabled={
                agencyDraft !==
                MINISTRY_OF_FINANCE_AGENCY
              }
              id="dashboard-division"
              onChange={(event) =>
                setDivisionDraft(
                  event.target.value,
                )
              }
              value={divisionDraft}
            >
              <option value="">
                All Ministry divisions
              </option>

              {MOF_DIVISIONS.map((division) => (
                <option
                  key={division}
                  value={division}
                >
                  {division}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              <Search
                aria-hidden="true"
                className="size-5"
              />
              Apply
            </button>
          </div>
        </form>

        {filterError ? (
          <p
            className="mt-4 text-sm font-semibold text-red-700"
            id="dashboard-filter-error"
            role="alert"
          >
            {filterError}
          </p>
        ) : null}

        {filtersApplied ? (
          <button
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
            disabled={loading}
            onClick={clearFilters}
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-4"
            />
            Clear filters
          </button>
        ) : null}
      </section>

      {loading && !dashboard ? (
        <div className="mt-6">
          <LoadingState message="Loading active visitors…" />
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6">
          <ErrorMessage
            message={requestError}
            onRetry={refreshDashboard}
            title="Dashboard unavailable"
          />
        </div>
      ) : null}

      {dashboard && status !== "error" ? (
        <section
          aria-busy={loading}
          aria-labelledby="active-visitors-heading"
          className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h2
                className="text-xl font-black text-slate-950"
                id="active-visitors-heading"
              >
                Currently checked-in visitors
              </h2>

              <p
                aria-live="polite"
                className="mt-2 text-sm text-slate-600"
              >
                {dashboard.pagination.totalCount}{" "}
                {dashboard.pagination.totalCount ===
                1
                  ? "matching visitor"
                  : "matching visitors"}
              </p>
            </div>

            {dashboard.generatedAt ? (
              <p className="text-sm text-slate-500">
                Updated{" "}
                {formatDateTime(
                  dashboard.generatedAt,
                )}
              </p>
            ) : null}
          </div>

          {dashboard.visitors.length === 0 ? (
            <div className="p-5 sm:p-8">
              <div className="rounded-2xl bg-slate-50 p-6 text-center">
                <Users
                  aria-hidden="true"
                  className="mx-auto size-10 text-slate-400"
                />

                <h3 className="mt-4 font-black text-slate-950">
                  No active visitors found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No checked-in visitor matches the current
                  search and filters.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 p-4 md:hidden">
                {dashboard.visitors.map(
                  (visitor) => (
                    <VisitorCard
                      key={visitor.visitId}
                      onCheckout={openCheckout}
                      visitor={visitor}
                    />
                  ),
                )}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-50 text-sm text-slate-700">
                    <tr>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Visitor
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Visit
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Destination
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Checked in
                      </th>
                      <th
                        className="px-6 py-4 text-right font-bold"
                        scope="col"
                      >
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {dashboard.visitors.map(
                      (visitor) => (
                        <VisitorRow
                          key={visitor.visitId}
                          onCheckout={
                            openCheckout
                          }
                          visitor={visitor}
                        />
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {dashboard.pagination.totalPages > 1 ? (
            <Pagination
              currentPage={page}
              goToPage={goToPage}
              totalPages={
                dashboard.pagination.totalPages
              }
              visiblePages={visiblePages}
            />
          ) : null}
        </section>
      ) : null}

      {checkoutTarget ? (
        <CheckoutDialog
          checkingOut={checkingOut}
          error={checkoutError}
          onCancel={closeCheckout}
          onConfirm={confirmCheckout}
          visitor={checkoutTarget}
        />
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}) {
  const toneClasses = {
    brand:
      "border-brand-100 bg-brand-50 text-brand-900",
    emerald:
      "border-emerald-100 bg-emerald-50 text-emerald-900",
    slate:
      "border-slate-200 bg-white text-slate-900",
  };

  return (
    <article
      className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${toneClasses[tone]}`}
    >
      <Icon
        aria-hidden="true"
        className="size-7"
      />

      <p className="mt-5 text-3xl font-black">
        {value}
      </p>

      <p className="mt-1 text-sm font-bold">
        {label}
      </p>
    </article>
  );
}

function CheckoutButton({ onClick }) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-4 text-sm font-black text-white transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200"
      onClick={onClick}
      type="button"
    >
      <LogOut
        aria-hidden="true"
        className="size-4"
      />
      Check out
    </button>
  );
}

function VisitorCard({
  onCheckout,
  visitor,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="wrap-break-word text-lg font-black text-slate-950">
            {visitor.fullName}
          </h3>

          <p className="mt-1 font-mono text-sm font-bold text-brand-800">
            {visitor.reference}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
          Checked in
        </span>
      </div>

      <dl className="mt-5 grid text-sm">
        <VisitDetail
          icon={Phone}
          label="Phone"
          value={visitor.phone || "Not provided"}
        />

        <VisitDetail
          icon={Building2}
          label="Destination"
          value={[
            visitor.agency,
            visitor.division,
          ]
            .filter(Boolean)
            .join(" — ")}
        />

        <VisitDetail
          icon={Users}
          label="Purpose"
          value={`${visitor.purpose} — ${getVisitContact(
            visitor,
          )}`}
        />

        <VisitDetail
          icon={Clock}
          label="Checked in"
          value={formatDateTime(
            visitor.checkedInAt,
          )}
        />
      </dl>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <CheckoutButton
          onClick={() => onCheckout(visitor)}
        />
      </div>
    </article>
  );
}

function VisitDetail({
  icon: Icon,
  label,
  value,
}) {
  return (
    <>
      <dt className="mt-4 flex items-start gap-3 font-semibold text-slate-600 first:mt-0">
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-brand-800"
        />
        <span>{label}</span>
      </dt>

      <dd className="ml-8 mt-1 wrap-break-word font-bold text-slate-950">
        {value}
      </dd>
    </>
  );
}

function VisitorRow({
  onCheckout,
  visitor,
}) {
  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="px-6 py-5">
        <p className="font-black text-slate-950">
          {visitor.fullName}
        </p>

        <p className="mt-1 font-mono text-sm font-bold text-brand-800">
          {visitor.reference}
        </p>

        <p className="mt-2 text-sm text-slate-600">
          {visitor.phone || "No phone provided"}
        </p>

        {visitor.organization ? (
          <p className="mt-1 text-sm text-slate-500">
            {visitor.organization}
          </p>
        ) : null}
      </td>

      <td className="px-6 py-5">
        <p className="font-bold text-slate-950">
          {visitor.purpose}
        </p>

        <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
          {getVisitContact(visitor)}
        </p>
      </td>

      <td className="px-6 py-5">
        <p className="font-bold text-slate-950">
          {visitor.agency}
        </p>

        {visitor.division ? (
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
            {visitor.division}
          </p>
        ) : null}
      </td>

      <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-700">
        {formatDateTime(visitor.checkedInAt)}
      </td>

      <td className="px-6 py-5 text-right">
        <CheckoutButton
          onClick={() => onCheckout(visitor)}
        />
      </td>
    </tr>
  );
}

function CheckoutDialog({
  checkingOut,
  error,
  onCancel,
  onConfirm,
  visitor,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      role="presentation"
    >
      <section
        aria-describedby="checkout-dialog-description"
        aria-labelledby="checkout-dialog-heading"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
            <CircleAlert
              aria-hidden="true"
              className="size-6"
            />
          </span>

          <div>
            <h2
              className="text-xl font-black text-slate-950"
              id="checkout-dialog-heading"
            >
              Confirm visitor check-out
            </h2>

            <p
              className="mt-2 leading-7 text-slate-600"
              id="checkout-dialog-description"
            >
              Confirm that this visitor is leaving the
              premises. This records the departure time and
              staff account performing the action.
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4">
          <div>
            <dt className="text-sm font-semibold text-slate-600">
              Visitor
            </dt>
            <dd className="mt-1 font-black text-slate-950">
              {visitor.fullName}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-semibold text-slate-600">
              Visit reference
            </dt>
            <dd className="mt-1 font-mono font-black text-brand-800">
              {visitor.reference}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-semibold text-slate-600">
              Checked in
            </dt>
            <dd className="mt-1 font-bold text-slate-950">
              {formatDateTime(
                visitor.checkedInAt,
              )}
            </dd>
          </div>
        </dl>

        {error ? (
          <div
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            autoFocus
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={checkingOut}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>

          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={checkingOut}
            onClick={onConfirm}
            type="button"
          >
            {checkingOut ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin"
              />
            ) : (
              <LogOut
                aria-hidden="true"
                className="size-5"
              />
            )}

            {checkingOut
              ? "Checking out…"
              : "Confirm check-out"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Pagination({
  currentPage,
  goToPage,
  totalPages,
  visiblePages,
}) {
  return (
    <nav
      aria-label="Active visitor pages"
      className="flex flex-col gap-4 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <p
        aria-live="polite"
        className="text-center text-sm font-semibold text-slate-600 sm:text-left"
      >
        Page {currentPage} of {totalPages}
      </p>

      <div className="flex items-center justify-center gap-2">
        <button
          aria-label="Previous page"
          className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={currentPage <= 1}
          onClick={() =>
            goToPage(currentPage - 1)
          }
          type="button"
        >
          <ChevronLeft
            aria-hidden="true"
            className="size-5"
          />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          {visiblePages.map((pageNumber) => (
            <button
              aria-current={
                pageNumber === currentPage
                  ? "page"
                  : undefined
              }
              aria-label={`Page ${pageNumber}`}
              className={`grid size-11 place-items-center rounded-xl border text-sm font-black ${
                pageNumber === currentPage
                  ? "border-brand-800 bg-brand-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              key={pageNumber}
              onClick={() =>
                goToPage(pageNumber)
              }
              type="button"
            >
              {pageNumber}
            </button>
          ))}
        </div>

        <button
          aria-label="Next page"
          className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={currentPage >= totalPages}
          onClick={() =>
            goToPage(currentPage + 1)
          }
          type="button"
        >
          <ChevronRight
            aria-hidden="true"
            className="size-5"
          />
        </button>
      </div>
    </nav>
  );
}