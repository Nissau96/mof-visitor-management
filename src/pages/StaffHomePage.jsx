import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import heroIllustration from "../assets/images/reception-desk.webp";
import {
  ReceptionClockCard,
  WeeklyArrivalsCard,
} from "../components/DashboardInsights.jsx";
import {
  AGENCY_FILTER_OPTIONS,
  DIVISION_FILTER_OPTIONS,
} from "../constants/selectOptions.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import AppSelect from "../components/AppSelect.jsx";
import CheckoutConfirmDialog from "../components/CheckoutConfirmDialog.jsx";
import CheckedInVisitorsTable from "../components/CheckedInVisitorsTable.jsx";
import BookingRequestsPanel from "../components/BookingRequestsPanel.jsx";
import PendingAdmissionsTable from "../components/PendingAdmissionsTable.jsx";
import { AssignVisitorCardModal } from "../components/VisitorCardActions.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  TOWER_OPTIONS,
  VISIT_TOWER_VALUES,
  getTowerLabel,
} from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import usePendingAdmissions from "../hooks/usePendingAdmissions.js";
import { ApiError, apiRequest } from "../lib/api.js";
import { receptionDashboardSchema } from "../validation/receptionDashboard.js";
import { toast } from "../lib/toast.js";
import { ADMISSIONS_CHANGED_EVENT } from "../components/FindBookingDialog.jsx";

// The two tabs of the "Visitors on site" table. The open tab lives in
// the URL (?view=) so a reload or the back button keeps it.
const VISITOR_VIEWS = [
  {
    dotClassName: "bg-amber-400",
    id: "pending",
    label: "Pending admissions",
    shortLabel: "Pending",
  },
  {
    dotClassName: "bg-[#14b8a6]",
    id: "checked-in",
    label: "Currently checked in",
    shortLabel: "Checked in",
  },
];

const VIEW_IDS = VISITOR_VIEWS.map((option) => option.id);

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

const dateFormatter = new Intl.DateTimeFormat(
  "en-GB",
  {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Accra",
    year: "numeric",
  },
);

const monthShortFormatter = new Intl.DateTimeFormat(
  "en-GB",
  {
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

function getVisitContact(visitor) {
  if (visitor.purpose === "Meeting") {
    return visitor.meetingTitle || "Meeting";
  }

  return visitor.personVisiting || "";
}

// Maps a dashboard visitor to the shared checked-in table row.
function toCheckedInRow(visitor) {
  const notReturned =
    visitor.cardStatus === "not_returned";

  return {
    canCheckout: !notReturned,
    cardNumber: visitor.cardNumber || null,
    cardStatus: visitor.cardStatus || null,
    checkedInAt: visitor.checkedInAt,
    checkoutBlockedReason: notReturned
      ? `${visitor.cardNumber || "This card"} requires incident action`
      : "",
    destinationAgency: visitor.agency,
    destinationDetail:
      visitor.division ||
      getVisitContact(visitor),
    email: visitor.email || "",
    fullName: visitor.fullName,
    id: visitor.visitId,
    organization: visitor.organization || "",
    phone: visitor.phone || "",
    purpose: visitor.purpose || "",
    reference: visitor.reference,
    source: visitor,
    tower: visitor.tower,
    visitorType: visitor.visitorType || null,
    bookedGuest: Boolean(visitor.bookedGuest),
  };
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
    checkingOut,
    setCheckingOut,
  ] = useState(false);

  const accessToken =
    session?.access_token || "";

  const endExpiredSession = useCallback(() => {
    void signOut().catch(() => undefined);
  }, [signOut]);

  const administrator =
    profile.role === "admin";

  const [searchParams, setSearchParams] =
    useSearchParams();

  const [pendingPage, setPendingPage] =
    useState(1);

  const [assignTarget, setAssignTarget] =
    useState(null);

  const requestedView = VIEW_IDS.includes(
    searchParams.get("view"),
  )
    ? searchParams.get("view")
    : null;

  const pending = usePendingAdmissions({
    accessToken,
    listing: requestedView !== "checked-in",
    onAuthError: () => {
      void signOut().catch(() => undefined);
    },
    page: pendingPage,
    refreshKey,
    search: filters.query,
    tower,
  });

  // Without a chosen tab, open the waiting list, unless nobody is
  // waiting. null while the waiting count is still loading.
  const view =
    requestedView ||
    (!pending.countLoaded
      ? null
      : pending.count === 0
        ? "checked-in"
        : "pending");

  function changeView(nextView) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("view", nextView);
        return next;
      },
      { replace: true },
    );
  }

  // Arrow keys move between the two tabs.
  function moveBetweenViews(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const index = VIEW_IDS.indexOf(view);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? VIEW_IDS.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + VIEW_IDS.length) %
            VIEW_IDS.length;

    changeView(VIEW_IDS[nextIndex]);
    document.getElementById(`visitor-view-${VIEW_IDS[nextIndex]}`)?.focus();
  }

  function goToPendingPage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage === pendingPage ||
      nextPage > (pending.list.pagination.totalPages || 1)
    ) {
      return;
    }

    setPendingPage(nextPage);
  }

  function completeAssignment(message) {
    setAssignTarget(null);
    toast.success("Visitor card updated", message);
    refreshDashboard();
  }

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
    setPendingPage(1);
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

  function changeDivision(nextDivision) {

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

  // A card assigned from Find booking changes the lists here.
  useEffect(() => {
    function bump() {
      setRefreshKey((currentKey) => currentKey + 1);
    }

    window.addEventListener(ADMISSIONS_CHANGED_EVENT, bump);

    return () => window.removeEventListener(ADMISSIONS_CHANGED_EVENT, bump);
  }, []);

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
      setDashboard(null);
      setRequestError("");
      setStatus("loading");
      setPage(1);
      setPendingPage(1);
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

  function changeAgency(nextAgency) {

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

      toast.success(
        "Visitor checked out",
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

  const monthShortLabel =
    formatWith(
      monthShortFormatter,
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

  const listLoading =
    view === "pending"
      ? pending.list.status === "loading"
      : loading;

  const pendingTotal =
    pending.list.pagination.totalCount;

  const listSummary =
    view === "pending" && pending.list.fetchedAt
      ? `${pendingTotal} waiting · ${towerHeading}`
      : view === "checked-in" && dashboard
        ? `${totalCount} checked in · ${towerHeading}`
        : "";

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1.05fr)_minmax(0,0.85fr)]">
        {/*
          Hero colours use arbitrary values on purpose: dark-theme.css remaps
          brand/white utilities globally, and this banner needs its own
          mint (light) and deep-teal (dark) palette.
        */}
        <section
          aria-labelledby="dashboard-heading"
          className="relative flex min-h-60 flex-col overflow-hidden rounded-3xl border border-[#ccfbf1] bg-linear-to-br from-[#f0fdfa] via-[#e4f8f4] to-[#d2f1eb] shadow-sm min-[480px]:block md:col-span-2 2xl:col-span-1 dark:border-[#134e4a] dark:from-[#052422] dark:via-[#073230] dark:to-[#0a3c38]"
        >
          <div className="relative z-10 p-6 sm:p-7 min-[480px]:w-[46%] md:w-[50%] md:py-8 2xl:w-[47%]">
            <h1
              className="text-3xl font-black leading-tight tracking-tight text-[#134e4a] dark:text-[#ffffff]"
              id="dashboard-heading"
            >
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-[#0f766e] dark:text-[#5eead4]">
                Welcome to your
              </span>{" "}
              {workspaceName}
            </h1>

            <p className="mt-3 max-w-xs text-sm leading-6 text-[#334155] dark:text-[#cfe9e5]">
              Manage visitors, check-ins and cards
              from one place.
            </p>

            <span className="mt-5 inline-flex min-h-8 items-center rounded-full border border-[#b9e9e1] bg-[#ffffff] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#134e4a] dark:border-[#ffffff33] dark:bg-transparent dark:text-[#ffffff]">
              {administrator
                ? "Administrator"
                : "Receptionist"}
            </span>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none relative order-first h-48 min-[480px]:absolute min-[480px]:inset-y-0 min-[480px]:right-0 min-[480px]:order-none min-[480px]:h-auto min-[480px]:w-[48%] md:w-[58%] 2xl:w-[60%]"
          >
            {/* Soft room behind the desk: an arch and window panes. */}
            <div className="absolute inset-0 overflow-hidden min-[480px]:[mask-image:linear-gradient(to_right,transparent,#000_30%)]">
              <span className="absolute left-[18%] top-[10%] h-[150%] w-[62%] rounded-t-full bg-[#bdece3b3] dark:bg-[#0f4c47b3]" />

              {["left-[46%]", "left-[60%]", "left-[74%]"].map(
                (position) => (
                  <span
                    className={`absolute bottom-[30%] top-0 w-[11%] border-x border-[#ffffff99] bg-[#ffffff4d] dark:border-[#ffffff14] dark:bg-[#ffffff0a] ${position}`}
                    key={position}
                  />
                ),
              )}

              <span className="absolute inset-x-[8%] bottom-[2%] h-[14%] rounded-[50%] bg-[#134e4a33] blur-2xl dark:bg-[#00000066]" />
            </div>

            <img
              alt=""
              className="absolute bottom-0 left-1/2 h-[96%] w-auto max-w-none -translate-x-1/2 object-contain min-[480px]:-right-[22%] min-[480px]:left-auto min-[480px]:h-[72%] min-[480px]:translate-x-0 md:right-0 md:h-[96%] md:max-w-full md:object-right-bottom"
              src={heroIllustration}
            />
          </div>
        </section>

        <WeeklyArrivalsCard
          days={
            dashboard?.weeklyArrivals ||
            []
          }
          towerLabel={towerHeading}
        />

        <ReceptionClockCard />
      </div>

      <section
        aria-busy={loading}
        aria-label="Reception statistics"
        className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        <MetricCard
          action={{
            label: "Jump to checked-in visitors",
            onClick: () => {
              changeView("checked-in");
              document
                .getElementById(
                  "visitors-on-site-heading",
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            },
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
          shortLabel="Visitors This Month"
          shortNote={`${
            administrator
              ? "All towers"
              : towerHeading
          } · ${monthShortLabel}`}
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

      {/* Meetings booked by Ministry staff waiting for a decision; the
          card only appears when there is at least one. */}
      {accessToken ? (
        <BookingRequestsPanel
          accessToken={accessToken}
          mode="queue"
          onSessionExpired={endExpiredSession}
          tower={tower || ""}
        />
      ) : null}

      <section
        aria-busy={listLoading}
        aria-labelledby="visitors-on-site-heading"
        className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                className="text-xl font-black tracking-tight text-slate-950"
                id="visitors-on-site-heading"
              >
                Visitors on site
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Admit people waiting at reception, then track who is inside.
              </p>
            </div>

            <button
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-brand-600 bg-white px-3 text-sm font-bold text-brand-800 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
              disabled={listLoading}
              onClick={refreshDashboard}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${listLoading ? "animate-spin" : ""}`}
              />
              <span className="max-sm:sr-only">Refresh</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
              aria-label="Visitor views"
              className="flex gap-2"
              role="tablist"
            >
              {VISITOR_VIEWS.map((option) => {
                const active = view === option.id;
                const count =
                  option.id === "pending"
                    ? pending.count
                    : stats?.active;

                return (
                  <button
                    aria-controls="visitors-on-site-panel"
                    aria-selected={active}
                    className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2.5 rounded-full py-1.5 pl-4 pr-2 text-sm font-bold transition-shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:flex-none sm:gap-3 sm:pl-5 ${
                      active
                        ? "bg-linear-to-r from-[#0e8077] to-[#115e59] text-[#ffffff] shadow-lg shadow-[#115e59]/25"
                        : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                    id={`visitor-view-${option.id}`}
                    key={option.id}
                    onClick={() => changeView(option.id)}
                    onKeyDown={moveBetweenViews}
                    role="tab"
                    tabIndex={active ? 0 : -1}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${option.dotClassName}`}
                    />
                    <span className="sm:hidden">{option.shortLabel}</span>
                    <span className="max-sm:sr-only">{option.label}</span>
                    {Number.isInteger(count) ? (
                      <span
                        className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-black ${
                          active
                            ? "bg-[#ffffff] text-[#115e59]"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {administrator ? (
              <div
                aria-label="Tower filter"
                className="flex gap-1 self-start rounded-full border border-slate-200 bg-slate-100 p-1 max-sm:w-full lg:self-auto"
                role="group"
              >
                {[{ label: "All Towers", value: "" }, ...TOWER_OPTIONS].map(
                  (towerOption) => (
                    <button
                      aria-pressed={tower === towerOption.value}
                      className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-2.5 text-sm transition sm:flex-none sm:px-5 ${
                        tower === towerOption.value
                          ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
                          : "font-semibold text-slate-600 hover:text-slate-900"
                      }`}
                      key={towerOption.value || "all"}
                      onClick={() => changeTower(towerOption.value)}
                      type="button"
                    >
                      {towerOption.label}
                    </button>
                  ),
                )}
              </div>
            ) : (
              <div className="self-start lg:self-auto">
                <TowerBadge tower={tower} />
              </div>
            )}
          </div>
        </div>

        <form
          className="flex flex-col gap-3 border-y border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6"
          noValidate
          onSubmit={submitSearch}
          role="search"
        >
          <div className="relative min-w-0 sm:min-w-64 sm:flex-1">
            <label className="sr-only" htmlFor="dashboard-query">
              Name or reference
            </label>

            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />

            <input
              aria-describedby={
                filterError ? "dashboard-filter-error" : undefined
              }
              autoComplete="off"
              className="h-12 min-h-12 w-full rounded-full border border-slate-200 bg-white py-0 pl-11 pr-4 text-sm text-slate-950 shadow-none outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
              id="dashboard-query"
              maxLength="80"
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Search name or VIS reference"
              type="search"
              value={queryDraft}
            />
          </div>

          {/* The pending list can only be searched; agency filters apply to checked-in visitors. */}
          {view === "checked-in" ? (
            <>
              <AppSelect
                appearance="filter"
                className="sm:w-56"
                id="dashboard-agency"
                label="Agency"
                labelHidden
                onChange={changeAgency}
                options={AGENCY_FILTER_OPTIONS}
                value={agencyDraft}
              />

              {agencyDraft === MINISTRY_OF_FINANCE_AGENCY ? (
                <AppSelect
                  appearance="filter"
                  className="sm:w-56"
                  id="dashboard-division"
                  label="Ministry division"
                  labelHidden
                  onChange={changeDivision}
                  options={DIVISION_FILTER_OPTIONS}
                  value={divisionDraft}
                />
              ) : null}
            </>
          ) : null}

          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!filtersApplied && !queryDraft && !agencyDraft}
            onClick={clearFilters}
            type="button"
          >
            Reset
          </button>

          {filterError ? (
            <p
              className="w-full text-sm font-semibold text-red-700"
              id="dashboard-filter-error"
              role="alert"
            >
              {filterError}
            </p>
          ) : null}
        </form>

        <div
          aria-labelledby={view ? `visitor-view-${view}` : undefined}
          id="visitors-on-site-panel"
          role="tabpanel"
        >
          {listSummary ? (
            <div className="px-5 py-3 sm:px-6">
              <p
                aria-live="polite"
                className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800 ring-1 ring-brand-100"
              >
                {listSummary}
              </p>
            </div>
          ) : null}

          {view === null ? (
            <div className="p-5 sm:p-6">
              <LoadingState message={`Loading visitors for ${towerHeading}…`} />
            </div>
          ) : null}

          {view === "pending" ? (
            <PendingAdmissionsPanel
              goToPage={goToPendingPage}
              list={pending.list}
              onAssign={setAssignTarget}
              onRetry={refreshDashboard}
              searching={Boolean(filters.query)}
              towerHeading={towerHeading}
            />
          ) : null}

          {view === "checked-in" ? (
            <>
              {loading && !dashboard ? (
                <div className="p-5 sm:p-6">
                  <LoadingState
                    message={`Loading active visitors for ${towerHeading}…`}
                  />
                </div>
              ) : null}

              {status === "error" ? (
                <div className="p-5 sm:p-6">
                  <ErrorMessage
                    message={requestError}
                    onRetry={refreshDashboard}
                    title="Dashboard unavailable"
                  />
                </div>
              ) : null}

              {dashboard && status !== "error" ? (
                <div
                  className={
                    loading
                      ? "pointer-events-none opacity-60 transition"
                      : "transition"
                  }
                >
                  {dashboard.visitors.length === 0 ? (
                    <EmptyVisitors
                      message="No checked-in visitor matches the current tower, search and filters."
                      title="No active visitors found"
                    />
                  ) : (
                    <CheckedInVisitorsTable
                      onCheckout={openCheckout}
                      rows={dashboard.visitors.map(toCheckedInRow)}
                    />
                  )}

                  <TableFooter
                    showing={`Showing ${dashboard.visitors.length} of ${totalCount} active ${
                      totalCount === 1 ? "visitor" : "visitors"
                    } (${towerHeading})`}
                    updatedAt={dashboard.generatedAt}
                  />

                  <Pagination
                    currentPage={page}
                    goToPage={goToPage}
                    label="Checked-in visitor pages"
                    totalPages={dashboard.pagination.totalPages}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {assignTarget ? (
        <AssignVisitorCardModal
          accessToken={accessToken}
          onClose={() => setAssignTarget(null)}
          onSuccess={completeAssignment}
          visitor={assignTarget}
        />
      ) : null}

      {checkoutTarget ? (
        <CheckoutConfirmDialog
          checkingOut={checkingOut}
          error={checkoutError}
          onCancel={closeCheckout}
          onConfirm={confirmCheckout}
          staff={profile}
          visitor={
            checkoutTarget
          }
        />
      ) : null}
    </div>
  );
}

function EmptyVisitors({ message, title }) {
  return (
    <div className="p-5 sm:p-8">
      <div className="rounded-2xl bg-slate-50 p-6 text-center">
        <Users aria-hidden="true" className="mx-auto size-10 text-slate-400" />

        <h3 className="mt-4 font-black text-slate-950">{title}</h3>

        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      </div>
    </div>
  );
}

function TableFooter({ showing, updatedAt }) {
  return (
    <div className="flex flex-col gap-1 border-t border-slate-200 px-5 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p>{showing}</p>

      {updatedAt ? <p>Updated {formatDateTime(updatedAt)}</p> : null}
    </div>
  );
}

function PendingAdmissionsPanel({
  goToPage,
  list,
  onAssign,
  onRetry,
  searching,
  towerHeading,
}) {
  if (list.status === "error") {
    return (
      <div className="p-5 sm:p-6">
        <ErrorMessage
          message={list.error}
          onRetry={onRetry}
          title="Pending admissions unavailable"
        />
      </div>
    );
  }

  if (!list.fetchedAt) {
    return (
      <div className="p-5 sm:p-6">
        <LoadingState
          message={`Loading pending admissions for ${towerHeading}…`}
        />
      </div>
    );
  }

  const { totalCount, totalPages, page } = list.pagination;

  return (
    <div
      className={
        list.status === "loading"
          ? "pointer-events-none opacity-60 transition"
          : "transition"
      }
    >
      {list.records.length === 0 ? (
        <EmptyVisitors
          message={
            searching
              ? "No pending admission matches this search."
              : "Visitors appear here as soon as they register at reception."
          }
          title={searching ? "No pending admissions found" : "No one is waiting"}
        />
      ) : (
        <PendingAdmissionsTable onAssign={onAssign} records={list.records} />
      )}

      <TableFooter
        showing={`Showing ${list.records.length} of ${totalCount} pending ${
          totalCount === 1 ? "admission" : "admissions"
        } (${towerHeading})`}
        updatedAt={list.fetchedAt}
      />

      <Pagination
        currentPage={page}
        goToPage={goToPage}
        label="Pending admission pages"
        totalPages={totalPages}
      />
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
  shortLabel,
  shortNote,
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
      className={`card-float relative overflow-hidden rounded-3xl border p-4 shadow-sm sm:p-5 ${
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
          className={`hidden flex-1 text-sm font-bold sm:block ${
            featured
              ? "text-white"
              : "text-slate-700"
          }`}
        >
          {label}
        </p>

        <span
          aria-hidden="true"
          className="flex-1 sm:hidden"
        />

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
        className={`relative mt-3 text-sm font-bold sm:hidden ${
          featured
            ? "text-white"
            : "text-slate-700"
        }`}
      >
        {shortLabel || label}
      </p>

      <p
        className={`relative mt-1 text-3xl font-black sm:mt-4 sm:text-4xl ${
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
        {shortNote ? (
          <>
            <span className="sm:hidden">
              {shortNote}
            </span>
            <span className="hidden sm:inline">
              {note}
            </span>
          </>
        ) : (
          note
        )}
      </p>
    </article>
  );
}

function Pagination({ currentPage, goToPage, label, totalPages }) {
  if (totalPages < 1) {
    return null;
  }

  const pageButton =
    "grid size-11 place-items-center rounded-full border text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";
  const arrowButton = `${pageButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`;

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-4 sm:px-6"
    >
      <p aria-live="polite" className="text-sm font-bold text-slate-950">
        Page {currentPage} of {totalPages}
      </p>

      <div className="flex items-center gap-2">
        <button
          aria-label="Previous page"
          className={arrowButton}
          disabled={currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          {getVisiblePages(currentPage, totalPages).map((pageNumber) => (
            <button
              aria-current={pageNumber === currentPage ? "page" : undefined}
              aria-label={`Page ${pageNumber}`}
              className={`${pageButton} ${
                pageNumber === currentPage
                  ? "border-transparent bg-linear-to-r from-[#0e8077] to-[#115e59] text-[#ffffff] shadow-md shadow-[#115e59]/25"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              key={pageNumber}
              onClick={() => goToPage(pageNumber)}
              type="button"
            >
              {pageNumber}
            </button>
          ))}
        </div>

        <button
          aria-label="Next page"
          className={arrowButton}
          disabled={currentPage >= totalPages}
          onClick={() => goToPage(currentPage + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
    </nav>
  );
}
