import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { Link } from "react-router-dom";
import heroIllustration from "../assets/images/reception-hero-cutout.png";
import {
  CardAssignmentCard,
  ReceptionClockCard,
  WeeklyArrivalsCard,
} from "../components/DashboardInsights.jsx";
import { getAccraIsoDate } from "../lib/accraDate.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  TOWER_OPTIONS,
  VISIT_AGENCIES,
  VISIT_TOWER_VALUES,
  getTowerLabel,
} from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError, apiRequest } from "../lib/api.js";
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

const timeFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    timeStyle: "short",
    timeZone: "Africa/Accra",
  },
);

const dateFormatter = new Intl.DateTimeFormat(
  "en-GB",
  {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Accra",
    year: "numeric",
  },
);

const monthFormatter = new Intl.DateTimeFormat(
  "en-GB",
  {
    month: "long",
    timeZone: "Africa/Accra",
    year: "numeric",
  },
);

function formatWith(formatter, value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return formatter.format(date);
}

function formatDateTime(value) {
  return formatWith(
    dateTimeFormatter,
    value,
  );
}

// One colour per agency so rows can be scanned by agency at a glance.
const AGENCY_PILL_CLASSES = {
  [MINISTRY_OF_FINANCE_AGENCY]:
    "border-brand-200 bg-brand-50 text-brand-800",
  IAA: "border-blue-200 bg-blue-50 text-blue-800",
  ITAB: "border-violet-200 bg-violet-50 text-violet-800",
  GIPC: "border-amber-200 bg-amber-50 text-amber-800",
  GCX: "border-cyan-200 bg-cyan-50 text-cyan-800",
  GIFMIS: "border-rose-200 bg-rose-50 text-rose-800",
  GIIF: "border-sky-200 bg-sky-50 text-sky-800",
  MIIF: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PPA: "border-indigo-200 bg-indigo-50 text-indigo-800",
};

// "Ministry of Finance (MoF)" -> "MoF"; agencies without an abbreviation
// are shown in full.
function getAgencyShortName(agency) {
  return agency.match(/\(([^)]+)\)\s*$/)?.[1] || agency;
}

function getInitials(fullName) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getVisitContact(visitor) {
  if (visitor.purpose === "Meeting") {
    return visitor.meetingTitle || "Meeting";
  }

  return visitor.personVisiting || "Not provided";
}

function getCardStatus(visitor) {
  return visitor.cardStatus === "assigned"
    ? "Assigned"
    : "Checked in";
}

function VisitorTypeBadge({ type }) {
  if (type !== "vip" && type !== "regular") {
    return <span className="text-sm text-slate-500">—</span>;
  }

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
        type === "vip"
          ? "border-amber-300 bg-amber-100 text-amber-900"
          : "border-blue-200 bg-blue-50 text-blue-700"
      }`}
    >
      {type === "vip" ? "VIP" : "Regular"}
    </span>
  );
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
    active: Number(
      result.stats.active,
    ),
    checkedInToday: Number(
      result.stats.checkedInToday,
    ),
    checkedOutToday: Number(
      result.stats.checkedOutToday,
    ),
    checkedInThisMonth: Number(
      result.stats.checkedInThisMonth,
    ),
  };

  const pagination = {
    page: Number(
      result.pagination.page,
    ),
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

  const validStats =
    Object.values(stats).every(
      (value) =>
        Number.isInteger(value) &&
        value >= 0,
    );

  const validPagination =
    Object.values(
      pagination,
    ).every(
      (value) =>
        Number.isInteger(value) &&
        value >= 0,
    );

  const validVisitors =
    result.visitors.every(
      (visitor) =>
        visitor &&
        typeof visitor ===
          "object" &&
        typeof visitor.visitId ===
          "string" &&
        typeof visitor.reference ===
          "string" &&
        typeof visitor.fullName ===
          "string" &&
        typeof visitor.agency ===
          "string" &&
        typeof visitor.purpose ===
          "string" &&
        typeof visitor.checkedInAt ===
          "string" &&
        VISIT_TOWER_VALUES.includes(
          visitor.tower,
        ),
    );

  const validTowerScope =
    result.towerScope === null ||
    result.towerScope === "" ||
    VISIT_TOWER_VALUES.includes(
      result.towerScope,
    );

  if (
    !validStats ||
    !validPagination ||
    !validVisitors ||
    !validTowerScope
  ) {
    throw new Error(
      "The dashboard returned an invalid response.",
    );
  }

  return {
    generatedAt:
      typeof result.generatedAt ===
      "string"
        ? result.generatedAt
        : "",
    pagination,
    staffRole:
      typeof result.staffRole ===
      "string"
        ? result.staffRole
        : "",
    // Insight widgets degrade to placeholders if these are missing.
    cardAssignment:
      Number.isInteger(
        result.cardAssignment?.assigned,
      ) &&
      Number.isInteger(
        result.cardAssignment?.notAssigned,
      )
        ? result.cardAssignment
        : null,
    stats,
    weeklyArrivals: Array.isArray(
      result.weeklyArrivals,
    )
      ? result.weeklyArrivals.filter(
          (day) =>
            typeof day?.date === "string" &&
            (day.count === null ||
              Number.isInteger(day.count)),
        )
      : [],
    towerScope:
      result.towerScope || "",
    visitors:
      result.visitors,
  };
}

function normalizeCheckoutResult(result) {
  const checkout =
    result?.checkout;

  if (
    !checkout ||
    typeof checkout !== "object" ||
    typeof checkout.visitId !==
      "string" ||
    typeof checkout.reference !==
      "string" ||
    !VISIT_TOWER_VALUES.includes(
      checkout.tower,
    ) ||
    checkout.status !==
      "checked_out" ||
    typeof checkout.checkedOutAt !==
      "string"
  ) {
    throw new Error(
      "Check-out returned an invalid response.",
    );
  }

  return {
    alreadyCheckedOut:
      Boolean(
        checkout.alreadyCheckedOut,
      ),
    checkedOutAt:
      checkout.checkedOutAt,
    reference:
      checkout.reference,
    status:
      checkout.status,
    tower:
      checkout.tower,
    visitId:
      checkout.visitId,
  };
}

function getVisiblePages(
  currentPage,
  totalPages,
) {
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
    Math.max(
      currentPage - 2,
      1,
    ),
    totalPages - 4,
  );

  return Array.from(
    { length: 5 },
    (_, index) =>
      start + index,
  );
}

export default function StaffHomePage() {
  const {
    profile,
    session,
    setTowerScope,
    signOut,
    tower,
  } = useAuth();

  const [
    dashboard,
    setDashboard,
  ] = useState(null);

  const [
    status,
    setStatus,
  ] = useState("loading");

  const [
    requestError,
    setRequestError,
  ] = useState("");

  const [
    filterError,
    setFilterError,
  ] = useState("");

  const [
    filters,
    setFilters,
  ] = useState(EMPTY_FILTERS);

  const [
    queryDraft,
    setQueryDraft,
  ] = useState("");

  const [
    agencyDraft,
    setAgencyDraft,
  ] = useState("");

  const [
    divisionDraft,
    setDivisionDraft,
  ] = useState("");

  const [
    page,
    setPage,
  ] = useState(1);

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    checkoutTarget,
    setCheckoutTarget,
  ] = useState(null);

  const [
    checkoutError,
    setCheckoutError,
  ] = useState("");

  const [
    checkoutSuccess,
    setCheckoutSuccess,
  ] = useState("");

  const [
    checkingOut,
    setCheckingOut,
  ] = useState(false);

  const accessToken =
    session?.access_token || "";

  const administrator =
    profile.role === "admin";

  useEffect(() => {
    const controller =
      new AbortController();

    apiRequest(
      "/api/staff/dashboard",
      {
        body: JSON.stringify({
          agency:
            filters.agency,
          division:
            filters.division,
          page,
          query:
            filters.query,
          tower,
        }),
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
        method: "POST",
        signal:
          controller.signal,
      },
    )
      .then((result) => {
        if (
          controller.signal
            .aborted
        ) {
          return;
        }

        const normalized =
          normalizeDashboardResult(
            result,
          );

        setDashboard(
          normalized,
        );
        setRequestError("");
        setStatus("ready");
      })
      .catch((error) => {
        if (
          controller.signal
            .aborted ||
          error?.name ===
            "AbortError"
        ) {
          return;
        }

        if (
          error instanceof
            ApiError &&
          (
            error.status ===
              401 ||
            error.status ===
              403
          )
        ) {
          void signOut().catch(
            () => undefined,
          );
          return;
        }

        setRequestError(
          error instanceof
            Error &&
            error.message
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
    tower,
  ]);

  // Filters apply as soon as they change; the dashboard keeps showing the
  // previous results (dimmed) so the toolbar never unmounts mid-typing.
  function applyFilters(
    draft,
    { forceRefresh = false } = {},
  ) {
    setFilterError("");

    const parsed =
      receptionDashboardSchema.safeParse(
        {
          ...draft,
          page: 1,
          tower,
        },
      );

    if (
      !parsed.success
    ) {
      setFilterError(
        parsed.error
          .issues[0]
          ?.message ||
          "Check the dashboard filters and try again.",
      );
      return;
    }

    const nextFilters = {
      agency:
        parsed.data.agency,
      division:
        parsed.data.division,
      query:
        parsed.data.query,
    };

    const unchanged =
      page === 1 &&
      filters.agency ===
        nextFilters.agency &&
      filters.division ===
        nextFilters.division &&
      filters.query ===
        nextFilters.query;

    if (
      unchanged &&
      !forceRefresh
    ) {
      return;
    }

    setRequestError("");
    setStatus("loading");
    setPage(1);
    setFilters(
      nextFilters,
    );

    if (unchanged) {
      setRefreshKey(
        (currentKey) =>
          currentKey + 1,
      );
    }
  }

  const applySearchDraft =
    useEffectEvent(() => {
      applyFilters({
        agency:
          agencyDraft,
        division:
          divisionDraft,
        query:
          queryDraft,
      });
    });

  useEffect(() => {
    const timeout =
      window.setTimeout(
        applySearchDraft,
        400,
      );

    return () => {
      window.clearTimeout(
        timeout,
      );
    };
  }, [queryDraft]);

  function submitSearch(event) {
    event.preventDefault();

    applyFilters(
      {
        agency:
          agencyDraft,
        division:
          divisionDraft,
        query:
          queryDraft,
      },
      {
        forceRefresh: true,
      },
    );
  }

  function changeDivision(event) {
    const nextDivision =
      event.target.value;

    setDivisionDraft(
      nextDivision,
    );

    applyFilters({
      agency:
        agencyDraft,
      division:
        nextDivision,
      query:
        queryDraft,
    });
  }

  function clearFilters() {
    setQueryDraft("");
    setAgencyDraft("");
    setDivisionDraft("");

    applyFilters(
      EMPTY_FILTERS,
      {
        forceRefresh: true,
      },
    );
  }

  function refreshDashboard() {
    setRequestError("");
    setStatus("loading");
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function changeTower(nextTower) {
    if (
      !administrator ||
      nextTower === tower
    ) {
      return;
    }

    try {
      setTowerScope(
        nextTower,
      );
      setCheckoutTarget(null);
      setCheckoutError("");
      setCheckoutSuccess("");
      setDashboard(null);
      setRequestError("");
      setStatus("loading");
      setPage(1);
    } catch (error) {
      setRequestError(
        error instanceof
          Error &&
          error.message
          ? error.message
          : "The tower filter could not be changed.",
      );
      setStatus("error");
    }
  }

  function goToPage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage === page ||
      nextPage >
        (
          dashboard?.pagination
            .totalPages ||
          1
        )
    ) {
      return;
    }

    setRequestError("");
    setStatus("loading");
    setPage(nextPage);

    window.scrollTo({
      behavior:
        "smooth",
      top: 0,
    });
  }

  function changeAgency(event) {
    const nextAgency =
      event.target.value;

    // The division filter only exists for MoF; clear it so a hidden
    // dropdown can never narrow the results.
    const nextDivision =
      nextAgency ===
      MINISTRY_OF_FINANCE_AGENCY
        ? divisionDraft
        : "";

    setAgencyDraft(
      nextAgency,
    );
    setDivisionDraft(
      nextDivision,
    );

    applyFilters({
      agency:
        nextAgency,
      division:
        nextDivision,
      query:
        queryDraft,
    });
  }

  function openCheckout(visitor) {
    setCheckoutError("");
    setCheckoutSuccess("");
    setCheckoutTarget(
      visitor,
    );
  }

  function closeCheckout() {
    if (checkingOut) {
      return;
    }

    setCheckoutError("");
    setCheckoutTarget(null);
  }

  async function confirmCheckout() {
    if (
      !checkoutTarget ||
      checkingOut
    ) {
      return;
    }

    setCheckoutError("");
    setCheckingOut(true);

    try {
      const result =
        await apiRequest(
          "/api/staff/checkout",
          {
            body: JSON.stringify(
              {
                tower,
                visitId:
                  checkoutTarget.visitId,
              },
            ),
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
            method:
              "POST",
          },
        );

      const checkout =
        normalizeCheckoutResult(
          result,
        );

      const visitorName =
        checkoutTarget.fullName;

      setCheckoutTarget(null);

      setCheckoutSuccess(
        checkout.alreadyCheckedOut
          ? `${visitorName} was already checked out from ${getTowerLabel(
              checkout.tower,
            )} at ${formatDateTime(
              checkout.checkedOutAt,
            )}.`
          : `${visitorName} has been checked out successfully from ${getTowerLabel(
              checkout.tower,
            )} at ${formatDateTime(
              checkout.checkedOutAt,
            )}.`,
      );

      setDashboard(null);
      setRequestError("");
      setStatus("loading");
      setPage(1);
      setRefreshKey(
        (currentKey) =>
          currentKey + 1,
      );
    } catch (error) {
      if (
        error instanceof
          ApiError &&
        (
          error.status ===
            401 ||
          error.status ===
            403
        )
      ) {
        void signOut().catch(
          () => undefined,
        );
        return;
      }

      setCheckoutError(
        error instanceof
          Error &&
          error.message
          ? error.message
          : "Check-out could not be completed. Please try again.",
      );
    } finally {
      setCheckingOut(
        false,
      );
    }
  }

  const loading =
    status === "loading";

  const filtersApplied =
    Boolean(
      filters.agency ||
        filters.division ||
        filters.query,
    );

  const visiblePages =
    getVisiblePages(
      page,
      dashboard?.pagination
        .totalPages || 0,
    );

  const towerHeading =
    tower
      ? getTowerLabel(tower)
      : "All towers";

  const workspaceName =
    administrator
      ? "Admin Command Center"
      : "Reception Workspace";

  const referenceTime =
    dashboard?.generatedAt ||
    new Date().toISOString();

  const monthLabel =
    formatWith(
      monthFormatter,
      referenceTime,
    );

  const stats =
    dashboard?.stats;

  const todayIso =
    getAccraIsoDate();

  const completionRate =
    stats &&
    stats.checkedInToday > 0
      ? Math.round(
          (stats.checkedOutToday /
            stats.checkedInToday) *
            100,
        )
      : null;

  const totalCount =
    dashboard?.pagination
      .totalCount ?? 0;

  const matchingSummary = `${totalCount} ${
    totalCount === 1
      ? "matching visitor"
      : "matching visitors"
  } in ${towerHeading}`;

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      {/*
        Hero colours use arbitrary values on purpose: dark-theme.css remaps
        brand/white utilities globally, and this banner needs its own
        mint (light) and deep-teal (dark) palette.
      */}
      <section
        aria-labelledby="dashboard-heading"
        className="relative overflow-hidden rounded-3xl border border-[#ccfbf1] bg-linear-to-br from-[#f0fdfa] via-[#e4f8f4] to-[#d2f1eb] shadow-sm dark:border-[#134e4a] dark:from-[#052422] dark:via-[#073230] dark:to-[#0a3c38]"
      >
        <div className="relative p-6 sm:p-8 lg:w-[46%] lg:py-10 lg:pl-10">
          <h1
            className="text-3xl font-black tracking-tight text-[#134e4a] sm:text-4xl dark:text-[#ffffff]"
            id="dashboard-heading"
          >
            Welcome to your{" "}
            {workspaceName}
          </h1>

          <p className="mt-3 max-w-xl leading-7 text-[#334155] dark:text-[#cfe9e5]">
            Manage visitors, monitor check-ins, issue
            visitor cards, and keep reception activities
            running smoothly from one place.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex min-h-8 items-center rounded-full bg-[#ccfbf1] px-4 text-xs font-black uppercase tracking-[0.08em] text-[#134e4a] dark:bg-[#ffffff1a] dark:text-[#ffffff]">
              {workspaceName}
            </span>

            <span className="inline-flex min-h-8 items-center rounded-full border border-[#b9e9e1] bg-[#ffffff] px-4 text-xs font-black uppercase tracking-[0.08em] text-[#334155] dark:border-[#ffffff33] dark:bg-transparent dark:text-[#ffffff]">
              {administrator
                ? "Administrator"
                : "Receptionist"}
            </span>
          </div>

          <p className="mt-6 flex max-w-lg items-center gap-3 rounded-xl bg-[#ffffff99] px-4 py-3 text-sm font-semibold text-[#134e4a] dark:bg-[#ffffff14] dark:text-[#ccfbf1]">
            <Users
              aria-hidden="true"
              className="size-5 shrink-0"
            />
            A professional, secure and seamless
            visitor experience.
          </p>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none relative aspect-[1365/620] lg:absolute lg:inset-y-0 lg:right-0 lg:m-0 lg:aspect-auto lg:w-[56%]"
        >
          <div className="absolute inset-0 overflow-hidden lg:[mask-image:linear-gradient(to_right,transparent,#000_22%)]">
            <span className="absolute left-[12%] top-[7%] h-[150%] w-[64%] rounded-t-full bg-[#bdece3b3] dark:bg-[#0f4c47b3]" />

            {["left-[40%]", "left-[52%]", "left-[64%]"].map(
              (position) => (
                <span
                  className={`absolute bottom-[24%] top-0 w-[10%] border-x border-[#ffffff99] bg-[#ffffff4d] dark:border-[#ffffff14] dark:bg-[#ffffff0a] ${position}`}
                  key={position}
                />
              ),
            )}

            <span className="absolute inset-y-0 right-0 w-[12%] bg-linear-to-b from-[#0f766e] to-[#115e59] dark:from-[#0d9488] dark:to-[#0f766e]" />

            <span className="absolute inset-x-[4%] bottom-[1%] h-[16%] rounded-[50%] bg-[#134e4a33] blur-2xl dark:bg-[#00000066]" />
          </div>

          <img
            alt=""
            className="absolute inset-x-0 bottom-0 w-full [mask-image:linear-gradient(to_bottom,transparent_0%,#000_10%)] lg:left-auto lg:right-0 lg:h-[94%] lg:w-full lg:object-contain lg:object-[100%_100%]"
            src={heroIllustration}
          />
        </div>
      </section>

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
              setCheckoutSuccess(
                "",
              )
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

      <section
        aria-busy={loading}
        aria-label="Reception statistics"
        className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          action={{
            label: "Jump to checked-in visitors",
            onClick: () =>
              document
                .getElementById(
                  "active-visitors-heading",
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                }),
          }}
          featured
          icon={UserCheck}
          label="Currently Checked In"
          note={
            tower
              ? `In ${towerHeading}`
              : "Across all towers"
          }
          tone="emerald"
          value={stats?.active}
        />

        <MetricCard
          action={{
            label: "View today's arrivals in Visit History",
            state: {
              historyFilters: {
                dateFrom: todayIso,
                dateTo: todayIso,
              },
            },
            to: "/staff/history",
          }}
          icon={LogIn}
          label="Arrivals Today"
          note={formatWith(
            dateFormatter,
            referenceTime,
          )}
          tone="blue"
          value={
            stats?.checkedInToday
          }
        />

        <MetricCard
          action={{
            label: "View today's check-outs in Visit History",
            state: {
              historyFilters: {
                dateFrom: todayIso,
                dateTo: todayIso,
                status: "checked_out",
              },
            },
            to: "/staff/history",
          }}
          icon={LogOut}
          label="Checked Out Today"
          note={
            completionRate === null
              ? "No arrivals yet"
              : `${completionRate}% completion`
          }
          tone="slate"
          value={
            stats?.checkedOutToday
          }
        />

        <MetricCard
          action={{
            label: "View this month's visits in Visit History",
            state: {
              historyFilters: {
                dateFrom: `${todayIso.slice(0, 8)}01`,
                dateTo: todayIso,
              },
            },
            to: "/staff/history",
          }}
          icon={CalendarDays}
          label="Total Visitors This Month"
          note={`${
            administrator
              ? "All towers"
              : towerHeading
          } · ${monthLabel}`}
          tone="amber"
          value={
            stats?.checkedInThisMonth
          }
        />
      </section>

      <section
        aria-label="Reception insights"
        className="mt-4 grid gap-4 lg:grid-cols-4"
      >
        <WeeklyArrivalsCard
          days={
            dashboard?.weeklyArrivals ||
            []
          }
          towerLabel={towerHeading}
        />

        <CardAssignmentCard
          assignment={
            dashboard?.cardAssignment
          }
        />

        <ReceptionClockCard
          towerLabel={towerHeading}
        />
      </section>

      <section
        aria-busy={loading}
        aria-labelledby="active-visitors-heading"
        className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className="text-xl font-black text-slate-950"
                id="active-visitors-heading"
              >
                Currently Checked-In Visitors
              </h2>

              {dashboard ? (
                <p
                  aria-live="polite"
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
                >
                  {matchingSummary}
                </p>
              ) : null}
            </div>

            <form
              className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end"
              noValidate
              onSubmit={submitSearch}
              role="search"
            >
              <div className="relative sm:w-64">
                <label
                  className="sr-only"
                  htmlFor="dashboard-query"
                >
                  Name or reference
                </label>

                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                />

                <input
                  aria-describedby={
                    filterError
                      ? "dashboard-filter-error"
                      : undefined
                  }
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pl-9 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100"
                  id="dashboard-query"
                  maxLength="80"
                  onChange={(
                    event,
                  ) =>
                    setQueryDraft(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Search name or VIS-reference"
                  type="search"
                  value={queryDraft}
                />
              </div>

              <label
                className="sr-only"
                htmlFor="dashboard-agency"
              >
                Agency
              </label>

              <select
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100 sm:w-56"
                id="dashboard-agency"
                onChange={
                  changeAgency
                }
                value={
                  agencyDraft
                }
              >
                <option value="">
                  All agencies
                </option>

                {VISIT_AGENCIES.map(
                  (agency) => (
                    <option
                      key={agency}
                      value={agency}
                    >
                      {agency}
                    </option>
                  ),
                )}
              </select>

              {agencyDraft ===
              MINISTRY_OF_FINANCE_AGENCY ? (
                <>
                  <label
                    className="sr-only"
                    htmlFor="dashboard-division"
                  >
                    Ministry division
                  </label>

                  <select
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-700 focus:ring-4 focus:ring-brand-100 sm:w-56"
                    id="dashboard-division"
                    onChange={
                      changeDivision
                    }
                    value={
                      divisionDraft
                    }
                  >
                    <option value="">
                      All divisions
                    </option>

                    {MOF_DIVISIONS.map(
                      (division) => (
                        <option
                          key={division}
                          value={
                            division
                          }
                        >
                          {division}
                        </option>
                      ),
                    )}
                  </select>
                </>
              ) : null}

              <button
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !filtersApplied &&
                  !queryDraft &&
                  !agencyDraft
                }
                onClick={
                  clearFilters
                }
                type="button"
              >
                Reset
              </button>
            </form>
          </div>

          {filterError ? (
            <p
              className="text-sm font-semibold text-red-700"
              id="dashboard-filter-error"
              role="alert"
            >
              {filterError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {administrator ? (
              <div
                aria-label="Tower filter"
                className="inline-flex rounded-xl bg-slate-100 p-1"
                role="group"
              >
                {[
                  {
                    label:
                      "All Towers",
                    value: "",
                  },
                  ...TOWER_OPTIONS,
                ].map(
                  (towerOption) => (
                    <button
                      aria-pressed={
                        tower ===
                        towerOption.value
                      }
                      className={`min-h-9 rounded-lg px-4 text-sm font-bold transition ${
                        tower ===
                        towerOption.value
                          ? "bg-white text-brand-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      key={
                        towerOption.value ||
                        "all"
                      }
                      onClick={() =>
                        changeTower(
                          towerOption.value,
                        )
                      }
                      type="button"
                    >
                      {
                        towerOption.label
                      }
                    </button>
                  ),
                )}
              </div>
            ) : (
              <TowerBadge
                tower={tower}
              />
            )}

            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={
                refreshDashboard
              }
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${
                  loading
                    ? "animate-spin"
                    : ""
                }`}
              />
              Refresh
            </button>
          </div>
        </div>

        {loading &&
        !dashboard ? (
          <div className="p-5 sm:p-6">
            <LoadingState
              message={`Loading active visitors for ${towerHeading}…`}
            />
          </div>
        ) : null}

        {status ===
        "error" ? (
          <div className="p-5 sm:p-6">
            <ErrorMessage
              message={
                requestError
              }
              onRetry={
                refreshDashboard
              }
              title="Dashboard unavailable"
            />
          </div>
        ) : null}

        {dashboard &&
        status !==
          "error" ? (
          <div
            className={
              loading
                ? "pointer-events-none opacity-60 transition"
                : "transition"
            }
          >
            {dashboard
              .visitors
              .length ===
            0 ? (
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
                    tower, search and filters.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 p-4 md:hidden">
                  {dashboard.visitors.map(
                    (visitor) => (
                      <VisitorCard
                        key={
                          visitor.visitId
                        }
                        onCheckout={
                          openCheckout
                        }
                        visitor={
                          visitor
                        }
                      />
                    ),
                  )}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-300 border-collapse text-left">
                    <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      <tr>
                        {[
                          "Reference",
                          "Agency",
                          "Visitor",
                          "Contact",
                          "Purpose of Visit",
                          "Person / Division Visiting",
                          "Card",
                          "Check-In",
                          "Action",
                        ].map(
                          (
                            label,
                          ) => (
                            <th
                              className="whitespace-nowrap px-4 py-3 text-center font-bold"
                              key={
                                label
                              }
                              scope="col"
                            >
                              {
                                label
                              }
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {dashboard.visitors.map(
                        (
                          visitor,
                        ) => (
                          <VisitorRow
                            key={
                              visitor.visitId
                            }
                            onCheckout={
                              openCheckout
                            }
                            visitor={
                              visitor
                            }
                          />
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing{" "}
                {
                  dashboard
                    .visitors
                    .length
                }{" "}
                of {totalCount}{" "}
                active{" "}
                {totalCount === 1
                  ? "visitor"
                  : "visitors"}{" "}
                ({towerHeading})
              </p>

              {dashboard
                .generatedAt ? (
                <p>
                  Updated{" "}
                  {formatDateTime(
                    dashboard.generatedAt,
                  )}
                </p>
              ) : null}
            </div>

            {dashboard
              .pagination
              .totalPages >=
            1 ? (
              <Pagination
                currentPage={
                  page
                }
                goToPage={
                  goToPage
                }
                totalPages={
                  dashboard
                    .pagination
                    .totalPages
                }
                visiblePages={
                  visiblePages
                }
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {checkoutTarget ? (
        <CheckoutDialog
          checkingOut={
            checkingOut
          }
          error={
            checkoutError
          }
          onCancel={
            closeCheckout
          }
          onConfirm={
            confirmCheckout
          }
          visitor={
            checkoutTarget
          }
        />
      ) : null}
    </div>
  );
}

function TowerBadge({
  tower,
}) {
  const towerOne =
    tower ===
    "tower_1";

  return (
    <span
      className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
        towerOne
          ? "bg-sky-100 text-sky-900"
          : "bg-violet-100 text-violet-900"
      }`}
    >
      <MapPin
        aria-hidden="true"
        className="size-4"
      />
      {getTowerLabel(
        tower,
      )}
    </span>
  );
}

function MetricCard({
  action,
  featured = false,
  icon: Icon,
  label,
  note,
  tone,
  value,
}) {
  const toneClasses = {
    amber: {
      icon: "bg-amber-50 text-amber-700",
      note: "bg-amber-50 text-amber-800",
    },
    blue: {
      icon: "bg-blue-50 text-blue-700",
      note: "bg-blue-50 text-blue-800",
    },
    emerald: {
      icon: "bg-brand-50 text-brand-800",
      note: "bg-brand-50 text-brand-800",
    },
    slate: {
      icon: "bg-slate-100 text-slate-700",
      note: "bg-slate-100 text-slate-700",
    },
  };

  const actionClass = `grid size-10 shrink-0 place-items-center rounded-full border transition focus-visible:ring-4 ${
    featured
      ? "border-white/30 bg-white text-brand-800 hover:bg-brand-50 focus-visible:ring-white/40"
      : "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:ring-brand-200"
  }`;

  const actionIcon = (
    <ArrowUpRight
      aria-hidden="true"
      className="size-4"
    />
  );

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm ${
        featured
          ? "border-brand-800 bg-brand-800 text-white"
          : "border-slate-200 bg-white"
      }`}
    >
      {featured ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-14 size-52 rounded-full border-[14px] border-white/10"
        >
          <span className="absolute inset-6 rounded-full border-[10px] border-white/10" />
        </span>
      ) : null}

      <div className="relative flex items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
            featured
              ? "bg-white/15 text-white"
              : toneClasses[tone].icon
          }`}
        >
          <Icon
            aria-hidden="true"
            className="size-5"
          />
        </span>

        <p
          className={`flex-1 text-sm font-bold ${
            featured
              ? "text-white"
              : "text-slate-700"
          }`}
        >
          {label}
        </p>

        {action?.to ? (
          <Link
            aria-label={action.label}
            className={actionClass}
            state={action.state}
            title={action.label}
            to={action.to}
          >
            {actionIcon}
          </Link>
        ) : action ? (
          <button
            aria-label={action.label}
            className={actionClass}
            onClick={action.onClick}
            title={action.label}
            type="button"
          >
            {actionIcon}
          </button>
        ) : null}
      </div>

      <p
        className={`relative mt-4 text-4xl font-black ${
          featured
            ? "text-white"
            : "text-slate-950"
        }`}
      >
        {Number.isInteger(value)
          ? value
          : "—"}
      </p>

      <p
        className={`relative mt-3 inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
          featured
            ? "bg-white/15 text-white"
            : toneClasses[tone].note
        }`}
      >
        {note}
      </p>
    </article>
  );
}

function CheckoutButton({
  onClick,
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-4 text-sm font-black text-white transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200"
      onClick={
        onClick
      }
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
          <h3 className="wrap-break-word text-lg font-bold text-slate-950">
            {visitor.fullName}
          </h3>

          <p className="mt-1 font-mono text-sm font-bold text-brand-800">
            {visitor.reference}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          {getCardStatus(
            visitor,
          )}
        </span>
      </div>

      <dl className="mt-5 grid text-sm">
        <VisitDetail icon={Building2} label="Agency" value={visitor.agency} />
        <dt className="mt-4 font-semibold text-slate-600">Visitor Type</dt>
        <dd className="mt-1"><VisitorTypeBadge type={visitor.visitorType} /></dd>
        <dt className="mt-4 font-semibold text-slate-600">Given Card</dt>
        <dd className="mt-1">
          <span className="inline-flex rounded-full border border-brand-100 bg-brand-50 px-3 py-1 font-bold text-brand-800">
            {visitor.cardNumber || "Not assigned"}
          </span>
        </dd>
        <VisitDetail icon={Mail} label="Contact Details" value={
          <span className="grid gap-1">
            {visitor.email ? <span>{visitor.email}</span> : null}
            {visitor.phone ? <span>{visitor.phone}</span> : null}
          </span>
        } />
        <VisitDetail icon={Users} label="Person / Div. Visiting" value={
          [getVisitContact(visitor), visitor.division].filter(Boolean).join(" — ")
        } />
        <VisitDetail icon={Users} label="Purpose of Visit" value={visitor.purpose} />
        <VisitDetail icon={Building2} label="Institution" value={visitor.organization || "Not provided"} />

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
          onClick={() =>
            onCheckout(
              visitor,
            )
          }
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
        <span>
          {label}
        </span>
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
  const cardAssigned =
    visitor.cardStatus ===
      "assigned" &&
    visitor.cardNumber;

  return (
    <tr className="text-center align-middle transition hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-3">
        <span className="inline-flex rounded-md border border-brand-100 bg-brand-50 px-2 py-1 font-mono text-xs font-bold text-brand-800">
          {visitor.reference}
        </span>
      </td>

      <td className="px-4 py-3 text-sm">
        <span
          className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${
            AGENCY_PILL_CLASSES[visitor.agency] ||
            "border-slate-200 bg-slate-100 text-slate-700"
          }`}
          title={visitor.agency}
        >
          {getAgencyShortName(visitor.agency)}
        </span>
        <p className="mt-1 text-xs text-slate-500">
          {getTowerLabel(visitor.tower)}
        </p>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-black text-brand-800"
          >
            {getInitials(visitor.fullName)}
          </span>

          <div className="min-w-0 text-left">
            <p className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-slate-950">
              {visitor.fullName}
              {visitor.visitorType ? (
                <VisitorTypeBadge type={visitor.visitorType} />
              ) : null}
            </p>
            <p className="text-xs text-slate-500">
              {visitor.organization || "No institution provided"}
            </p>
          </div>
        </div>
      </td>

      <td className="min-w-48 px-4 py-3 text-sm">
        {visitor.phone ? (
          <p className="font-medium text-slate-800">
            {visitor.phone}
          </p>
        ) : null}
        {visitor.email ? (
          <p className="break-all text-xs text-slate-500">
            {visitor.email}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-3">
        <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
          {visitor.purpose}
        </span>
      </td>

      <td className="min-w-56 px-4 py-3 text-sm">
        {visitor.division ? (
          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {visitor.division}
          </span>
        ) : null}
        <p className="mt-1 font-semibold text-slate-800">
          {getVisitContact(visitor)}
        </p>
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${
            cardAssigned
              ? "bg-emerald-50 text-brand-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${
              cardAssigned
                ? "bg-emerald-500"
                : "bg-amber-500"
            }`}
          />
          {cardAssigned
            ? `Card #${visitor.cardNumber}`
            : "Not assigned"}
        </span>
        <p className="mt-1 text-xs text-slate-500">
          {getCardStatus(visitor)}
        </p>
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-sm">
        <p className="font-bold text-slate-900">
          {formatWith(timeFormatter, visitor.checkedInAt)}
        </p>
        <p className="text-xs text-slate-500">
          {formatWith(dateFormatter, visitor.checkedInAt)}
        </p>
      </td>

      <td className="px-4 py-3">
        <button
          aria-label={`Check out ${visitor.fullName}`}
          title={`Check out ${visitor.fullName}`}
          className="inline-grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:ring-4 focus-visible:ring-brand-200"
          onClick={() =>
            onCheckout(
              visitor,
            )
          }
          type="button"
        >
          <LogOut
            aria-hidden="true"
            className="size-4"
          />
        </button>
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
              premises. This records the departure time,
              tower and staff account performing the action.
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
              Reception tower
            </dt>

            <dd className="mt-2">
              <TowerBadge
                tower={
                  visitor.tower
                }
              />
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
            disabled={
              checkingOut
            }
            onClick={
              onCancel
            }
            type="button"
          >
            Cancel
          </button>

          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              checkingOut
            }
            onClick={
              onConfirm
            }
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
        Page {currentPage} of{" "}
        {totalPages}
      </p>

      <div className="flex items-center justify-center gap-2">
        <button
          aria-label="Previous page"
          className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={
            currentPage <=
            1
          }
          onClick={() =>
            goToPage(
              currentPage -
                1,
            )
          }
          type="button"
        >
          <ChevronLeft
            aria-hidden="true"
            className="size-5"
          />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          {visiblePages.map(
            (
              pageNumber,
            ) => (
              <button
                aria-current={
                  pageNumber ===
                  currentPage
                    ? "page"
                    : undefined
                }
                aria-label={`Page ${pageNumber}`}
                className={`grid size-11 place-items-center rounded-xl border text-sm font-black ${
                  pageNumber ===
                  currentPage
                    ? "border-brand-800 bg-brand-800 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                key={
                  pageNumber
                }
                onClick={() =>
                  goToPage(
                    pageNumber,
                  )
                }
                type="button"
              >
                {
                  pageNumber
                }
              </button>
            ),
          )}
        </div>

        <button
          aria-label="Next page"
          className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={
            currentPage >=
            totalPages
          }
          onClick={() =>
            goToPage(
              currentPage +
                1,
            )
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
