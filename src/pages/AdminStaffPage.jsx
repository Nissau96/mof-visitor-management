import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Check,
  CirclePlus,
  Clock,
  KeyRound,
  LoaderCircle,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import {
  Controller,
  useForm,
  useWatch,
} from "react-hook-form";
import AdminDialog, {
  DIALOG_BUTTON,
  DIALOG_CANCEL_BUTTON,
  DIALOG_INPUT,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "../components/AdminDialog.jsx";
import {
  FILLED_BUTTON,
  InitialsAvatar,
  OUTLINE_BUTTON,
  SearchPill,
  StateChip,
  SuccessBanner,
  TABLE_HEAD_CELL,
} from "../components/AdminRecords.jsx";
import AppSelect from "../components/AppSelect.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import ListPagination from "../components/ListPagination.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SegmentedButton from "../components/SegmentedButton.jsx";
import SegmentedChoice from "../components/SegmentedChoice.jsx";
import StatCard from "../components/StatCard.jsx";
import useAuth from "../hooks/useAuth.js";
import {
  ApiError,
  apiRequest,
} from "../lib/api.js";
import {
  adminStaffDeleteSchema,
  adminStaffInviteSchema,
  adminStaffListSchema,
  adminStaffPasswordReissueSchema,
  adminStaffUpdateSchema,
} from "../validation/adminManagement.js";

const PAGE_SIZE = 10;

const INITIAL_FILTERS = Object.freeze({
  role: "all",
  search: "",
  status: "all",
});

const dateTimeFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  },
);

const dateFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeZone: "Africa/Accra",
  },
);

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : dateFormatter.format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return dateTimeFormatter.format(date);
}

function normalizeStaffList(result) {
  if (
    !result ||
    typeof result !== "object" ||
    !Array.isArray(result.staff) ||
    !result.pagination ||
    typeof result.pagination !== "object"
  ) {
    throw new Error(
      "Staff administration returned an invalid response.",
    );
  }

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

  const validPagination = Object.values(
    pagination,
  ).every(
    (value) =>
      Number.isInteger(value) && value >= 0,
  );

  const validStaff = result.staff.every(
    (staffMember) =>
      staffMember &&
      typeof staffMember === "object" &&
      typeof staffMember.userId === "string" &&
      typeof staffMember.fullName === "string" &&
      typeof staffMember.email === "string" &&
      (
        staffMember.role === "admin" ||
        staffMember.role ===
          "client_service_head" ||
        staffMember.role === "receptionist"
      ) &&
      typeof staffMember.active === "boolean" &&
      typeof staffMember.emailConfirmed ===
        "boolean" &&
      typeof staffMember.createdAt === "string" &&
      (
        staffMember.lastSignInAt === null ||
        typeof staffMember.lastSignInAt ===
          "string"
      ) &&
      typeof staffMember.passwordChangeRequired ===
        "boolean" &&
      (
        staffMember.temporaryPasswordExpiresAt ===
          null ||
        typeof staffMember.temporaryPasswordExpiresAt ===
          "string"
      ) &&
      (
        staffMember.passwordSetupCompletedAt ===
          null ||
        typeof staffMember.passwordSetupCompletedAt ===
          "string"
      ),
  );

  if (!validPagination || !validStaff) {
    throw new Error(
      "Staff administration returned an invalid response.",
    );
  }

  return {
    pagination,
    staff: result.staff,
    summary: normalizeStaffSummary(
      result.summary,
    ),
  };
}

function temporaryPasswordExpired(
  expiry,
) {
  if (!expiry) {
    return false;
  }

  const expiryTime = Date.parse(expiry);

  return (
    Number.isFinite(expiryTime) &&
    expiryTime <= Date.now()
  );
}

// Whole-table counts. Null until the summary migration is applied, in
// which case the stat cards are hidden.
function normalizeStaffSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const counts = Object.fromEntries(
    [
      "activeCount",
      "adminCount",
      "clientServiceHeadCount",
      "deactivatedCount",
      "receptionistCount",
      "setupExpiredCount",
      "setupPendingCount",
      "totalCount",
    ].map((key) => [key, Number(summary[key])]),
  );

  return Object.values(counts).every(
    (value) =>
      Number.isInteger(value) && value >= 0,
  )
    ? counts
    : null;
}

const RECORDS_ID = "staff-records";

function scrollToRecords(options) {
  document
    .getElementById(RECORDS_ID)
    ?.scrollIntoView(options);
}

const ROLE_OPTIONS = Object.freeze([
  Object.freeze({ label: "Receptionist", value: "receptionist" }),
  Object.freeze({ label: "Client Service Head", value: "client_service_head" }),
  Object.freeze({ label: "Administrator", value: "admin" }),
]);

const ROLE_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ label: "All roles", value: "all" }),
  ...ROLE_OPTIONS,
]);

const STATUS_FILTERS = Object.freeze([
  Object.freeze({ label: "All", value: "all" }),
  Object.freeze({ label: "Active", value: "active" }),
  Object.freeze({ label: "Setup pending", value: "setup_pending" }),
  Object.freeze({ label: "Setup expired", value: "setup_expired" }),
  Object.freeze({ label: "Deactivated", value: "inactive" }),
]);

const ACCESS_CHOICES = Object.freeze([
  Object.freeze({ label: "Active", value: true }),
  Object.freeze({ label: "Inactive", value: false }),
]);

function formatRoleCounts(summary) {
  const parts = [
    [summary.adminCount, "Administrator", "Administrators"],
    [
      summary.clientServiceHeadCount,
      "Client Service Head",
      "Client Service Heads",
    ],
    [summary.receptionistCount, "Receptionist", "Receptionists"],
  ]
    .filter(([count]) => count > 0)
    .map(
      ([count, one, many]) =>
        `${count.toLocaleString()} ${count === 1 ? one : many}`,
    );

  return parts.length
    ? parts.join(" · ")
    : "No staff yet";
}

export default function AdminStaffPage() {
  const { session, signOut } = useAuth();

  const [staffList, setStaffList] =
    useState(null);

  const [requestStatus, setRequestStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [searchError, setSearchError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [filters, setFilters] =
    useState(INITIAL_FILTERS);

  const [searchDraft, setSearchDraft] =
    useState("");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [dialog, setDialog] =
    useState(null);

  const [dialogError, setDialogError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const accessToken =
    session?.access_token || "";

  const currentUserId =
    session?.user?.id || "";

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/api/admin/staff/list", {
      body: JSON.stringify({
        page,
        pageSize: PAGE_SIZE,
        role: filters.role,
        search: filters.search,
        status: filters.status,
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
          normalizeStaffList(result);

        setStaffList(normalized);
        setRequestError("");
        setRequestStatus("ready");
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
            : "Staff records could not be loaded. Please try again.",
        );

        setRequestStatus("error");
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

  function updateFilters(changes) {
    setFilters((current) => ({
      ...current,
      ...changes,
    }));
    setPage(1);
    setRequestStatus("loading");
  }

  const applySearch = useEffectEvent(
    (value) => {
      if (filters.search !== value) {
        updateFilters({ search: value });
      }
    },
  );

  // Search runs shortly after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed =
        adminStaffListSchema.shape.search.safeParse(
          searchDraft,
        );

      if (!parsed.success) {
        setSearchError(
          parsed.error.issues[0]?.message ||
            "Check the search and try again.",
        );
        return;
      }

      setSearchError("");
      applySearch(parsed.data);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchDraft]);

  function showInPanel(changes) {
    updateFilters(changes);

    scrollToRecords({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function refreshStaff() {
    setRequestError("");
    setRequestStatus("loading");
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  function goToPage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage === page ||
      nextPage >
        (staffList?.pagination.totalPages ||
          1)
    ) {
      return;
    }

    setRequestStatus("loading");
    setPage(nextPage);

    scrollToRecords({
      block: "start",
    });
  }

  function openInvitation() {
    setDialogError("");
    setSuccessMessage("");
    setDialog({
      mode: "invite",
      staffMember: null,
    });
  }

  function openEditor(staffMember) {
    setDialogError("");
    setSuccessMessage("");
    setDialog({
      mode: "edit",
      staffMember,
    });
  }

  function openPasswordReissue(
    staffMember,
  ) {
    setDialogError("");
    setSuccessMessage("");
    setDialog({
      mode: "reissue",
      staffMember,
    });
  }

  function openDeletion(staffMember) {
    setDialogError("");
    setSuccessMessage("");
    setDialog({
      mode: "delete",
      staffMember,
    });
  }

  function closeDialog() {
    if (submitting) {
      return;
    }

    setDialogError("");
    setDialog(null);
  }

  function refreshAfterMutation(message) {
    setDialog(null);
    setSuccessMessage(message);
    setRequestError("");
    setRequestStatus("loading");
    setPage(1);
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  async function inviteStaff(values) {
    setDialogError("");
    setSubmitting(true);

    try {
      const result = await apiRequest(
        "/api/admin/staff/invite",
        {
          body: JSON.stringify(values),
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          method: "POST",
        },
      );

      if (
        !result?.invitationSent ||
        !result?.staff?.userId ||
        !result?.staff?.email
      ) {
        throw new Error(
          "The invitation returned an invalid response.",
        );
      }

      refreshAfterMutation(
        `An invitation was sent to ${result.staff.email}.`,
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

      setDialogError(
        error instanceof Error && error.message
          ? error.message
          : "The staff invitation could not be completed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStaff(values) {
    setDialogError("");
    setSubmitting(true);

    try {
      const result = await apiRequest(
        "/api/admin/staff/update",
        {
          body: JSON.stringify(values),
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          method: "POST",
        },
      );

      if (
        !result?.staff?.userId ||
        !result?.staff?.fullName
      ) {
        throw new Error(
          "The staff update returned an invalid response.",
        );
      }

      refreshAfterMutation(
        `${result.staff.fullName} was updated successfully.`,
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

      setDialogError(
        error instanceof Error && error.message
          ? error.message
          : "The staff profile could not be updated. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function reissuePassword(
    values,
  ) {
    setDialogError("");

    const parsed =
      adminStaffPasswordReissueSchema
        .safeParse(values);

    if (!parsed.success) {
      setDialogError(
        parsed.error.issues[0]?.message ||
          "The password-reissue request is invalid.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiRequest(
        "/api/admin/staff/reissue-password",
        {
          body: JSON.stringify(
            parsed.data,
          ),
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
          method: "POST",
        },
      );

      if (
        result
          ?.temporaryPasswordReissued !==
          true ||
        !result?.staff?.userId ||
        !result?.staff?.email
      ) {
        throw new Error(
          "The password reissue returned an invalid response.",
        );
      }

      refreshAfterMutation(
        "A new temporary password was sent to " +
          result.staff.email +
          ". The previous temporary password is no longer valid.",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (
          error.status === 401 ||
          error.status === 403
        )
      ) {
        void signOut().catch(
          () => undefined,
        );
        return;
      }

      setDialogError(
        error instanceof Error &&
          error.message
          ? error.message
          : "The temporary password could not be reissued. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteStaffAccount(
    values,
  ) {
    setDialogError("");

    const parsed =
      adminStaffDeleteSchema.safeParse(
        values,
      );

    if (!parsed.success) {
      setDialogError(
        parsed.error.issues[0]?.message ||
          "The account-deletion request is invalid.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiRequest(
        "/api/admin/staff/delete",
        {
          body: JSON.stringify(
            parsed.data,
          ),
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
          method: "POST",
        },
      );

      if (
        result?.accountDeleted !== true ||
        !result?.staff?.userId ||
        !result?.staff?.email
      ) {
        throw new Error(
          "The account deletion returned an invalid response.",
        );
      }

      refreshAfterMutation(
        result.staff.email +
          " was permanently deleted. The person must be invited again to regain access.",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (
          error.status === 401 ||
          error.status === 403
        )
      ) {
        void signOut().catch(
          () => undefined,
        );
        return;
      }

      setDialogError(
        error instanceof Error &&
          error.message
          ? error.message
          : "The staff account could not be deleted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const loading =
    requestStatus === "loading";

  const summary = staffList?.summary || null;

  const statCards = summary
    ? [
        {
          count: summary.totalCount.toLocaleString(),
          icon: Users,
          id: "total",
          note: formatRoleCounts(summary),
          onOpen: () =>
            showInPanel({
              role: "all",
              status: "all",
            }),
          shortTitle: "Total",
          title: "Total staff",
        },
        {
          count: summary.activeCount.toLocaleString(),
          icon: UserCheck,
          id: "active",
          note: `${summary.deactivatedCount.toLocaleString()} deactivated`,
          noteTone: "brand",
          onOpen: () =>
            showInPanel({ status: "active" }),
          shortTitle: "Active",
          title: "Active accounts",
        },
        {
          count: (
            summary.setupPendingCount +
            summary.setupExpiredCount
          ).toLocaleString(),
          icon: Clock,
          iconTone: "amber",
          id: "setup",
          note: `${summary.setupPendingCount.toLocaleString()} pending · ${summary.setupExpiredCount.toLocaleString()} expired`,
          noteTone:
            summary.setupExpiredCount > 0
              ? "red"
              : "amber",
          onOpen: () =>
            showInPanel({
              status: "setup_pending",
            }),
          shortTitle: "Setup",
          title: "Awaiting setup",
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col gap-4 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Staff accounts
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Invite authorised staff and manage
            their role, access and password
            onboarding.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            className={OUTLINE_BUTTON}
            disabled={loading}
            onClick={refreshStaff}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${
                loading ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>

          <button
            className={FILLED_BUTTON}
            onClick={openInvitation}
            type="button"
          >
            <CirclePlus
              aria-hidden="true"
              className="size-4"
            />
            Invite staff
          </button>
        </div>
      </header>

      <SuccessBanner
        message={successMessage}
        onDismiss={() => setSuccessMessage("")}
      />

      {statCards.length ? (
        <section
          aria-label="Staff statistics"
          className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {statCards.map((card, index) => (
            <StatCard
              // Two columns leave the third card alone on its row, so it
              // spans the full width there.
              className={
                index === 2
                  ? "md:col-span-2 lg:col-span-1"
                  : ""
              }
              count={card.count}
              featured={index === 0}
              icon={card.icon}
              iconTone={card.iconTone}
              key={card.id}
              note={card.note}
              noteTone={card.noteTone}
              onOpen={card.onOpen}
              shortTitle={card.shortTitle}
              title={card.title}
            />
          ))}
        </section>
      ) : null}

      {loading && !staffList ? (
        <div className="mt-6">
          <LoadingState message="Loading staff records…" />
        </div>
      ) : null}

      {requestStatus === "error" ? (
        <div className="mt-6">
          <ErrorMessage
            message={requestError}
            onRetry={refreshStaff}
            title="Staff administration unavailable"
          />
        </div>
      ) : null}

      {staffList &&
      requestStatus !== "error" ? (
        <section
          aria-busy={loading}
          aria-labelledby="staff-records-heading"
          className="mt-4 scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          id={RECORDS_ID}
        >
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className="text-xl font-black text-slate-950"
                id="staff-records-heading"
              >
                Staff records
              </h2>

              <p
                aria-live="polite"
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800"
              >
                {staffList.pagination.totalCount.toLocaleString()}{" "}
                {staffList.pagination.totalCount ===
                1
                  ? "matching staff account"
                  : "matching staff accounts"}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex flex-col gap-3 sm:flex-row xl:flex-1">
                <SearchPill
                  describedBy={
                    searchError
                      ? "staff-search-error"
                      : undefined
                  }
                  id="staff-search"
                  label="Staff name or email"
                  maxLength="120"
                  onChange={setSearchDraft}
                  placeholder="Staff name or email"
                  value={searchDraft}
                />

                <AppSelect
                  appearance="filter"
                  className="w-full sm:w-52 sm:shrink-0"
                  id="staff-role-filter"
                  label="Role"
                  labelHidden
                  onChange={(role) =>
                    updateFilters({ role })
                  }
                  options={ROLE_FILTER_OPTIONS}
                  value={filters.role}
                />
              </div>

              <div
                aria-label="Account status"
                className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1 sm:gap-1 xl:self-auto"
                role="group"
              >
                {STATUS_FILTERS.map((option) => {
                  const active =
                    filters.status ===
                    option.value;

                  return (
                    <SegmentedButton
                      active={active}
                      aria-pressed={active}
                      className="max-sm:px-3"
                      key={option.value}
                      onClick={() =>
                        updateFilters({
                          status: option.value,
                        })
                      }
                    >
                      {option.label}
                    </SegmentedButton>
                  );
                })}
              </div>
            </div>

            {searchError ? (
              <p
                className="text-sm font-semibold text-red-700"
                id="staff-search-error"
                role="alert"
              >
                {searchError}
              </p>
            ) : null}
          </div>

          {staffList.staff.length === 0 ? (
            <div className="px-4 pb-6 sm:px-6">
              <div className="rounded-2xl bg-slate-50 p-6 text-center">
                <Users
                  aria-hidden="true"
                  className="mx-auto size-10 text-slate-500"
                />

                <h3 className="mt-4 font-black text-slate-950">
                  No staff accounts found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No staff account matches this
                  search, role and status. Try another
                  filter or invite staff.
                </p>
              </div>
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2 xl:hidden">
                {staffList.staff.map(
                  (staffMember) => (
                    <StaffCard
                      currentUserId={
                        currentUserId
                      }
                      key={staffMember.userId}
                      onDelete={openDeletion}
                      onEdit={openEditor}
                      onReissue={
                        openPasswordReissue
                      }
                      staffMember={
                        staffMember
                      }
                    />
                  ),
                )}
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full border-collapse text-left">
                  <thead className="border-y border-slate-200 bg-slate-50">
                    <tr>
                      <th
                        className={`${TABLE_HEAD_CELL} pl-5`}
                        scope="col"
                      >
                        Staff member
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Role
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Access
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Onboarding
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Account activity
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} pr-5 text-center`}
                        scope="col"
                      >
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {staffList.staff.map(
                      (staffMember) => (
                        <StaffRow
                          currentUserId={
                            currentUserId
                          }
                          key={
                            staffMember.userId
                          }
                          onDelete={
                            openDeletion
                          }
                          onEdit={openEditor}
                          onReissue={
                            openPasswordReissue
                          }
                          staffMember={
                            staffMember
                          }
                        />
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <ListPagination
            goToPage={goToPage}
            label="Staff administration pages"
            noun="staff accounts"
            nounSingular="staff account"
            pagination={staffList.pagination}
          />
        </section>
      ) : null}

      <aside className="mt-4 flex items-start gap-4 rounded-3xl border border-brand-200 bg-brand-50 p-5 text-sm leading-6 text-slate-700 sm:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-800">
          <KeyRound
            aria-hidden="true"
            className="size-5"
          />
        </span>

        <div>
          <h2 className="font-black text-slate-950">
            Account recovery
          </h2>
          <p className="mt-1">
            Temporary passwords expire after 24
            hours. When setup expires, reissue a
            temporary password first. If recovery is
            still impossible, permanently delete the
            expired account and invite the person
            again.
          </p>
        </div>
      </aside>

      {dialog?.mode === "invite" ? (
        <InvitationDialog
          error={dialogError}
          onCancel={closeDialog}
          onSubmit={inviteStaff}
          submitting={submitting}
        />
      ) : null}

      {dialog?.mode === "edit" ? (
        <StaffEditorDialog
          error={dialogError}
          key={dialog.staffMember.userId}
          onCancel={closeDialog}
          onSubmit={updateStaff}
          staffMember={dialog.staffMember}
          submitting={submitting}
        />
      ) : null}

      {dialog?.mode === "reissue" ? (
        <AccountRecoveryDialog
          error={dialogError}
          key={
            "reissue-" +
            dialog.staffMember.userId
          }
          mode="reissue"
          onCancel={closeDialog}
          onSubmit={reissuePassword}
          staffMember={dialog.staffMember}
          submitting={submitting}
        />
      ) : null}

      {dialog?.mode === "delete" ? (
        <AccountRecoveryDialog
          error={dialogError}
          key={
            "delete-" +
            dialog.staffMember.userId
          }
          mode="delete"
          onCancel={closeDialog}
          onSubmit={deleteStaffAccount}
          staffMember={dialog.staffMember}
          submitting={submitting}
        />
      ) : null}
    </div>
  );
}

function RoleBadge({ role }) {
  const administrator = role === "admin";
  const clientServiceHead =
    role === "client_service_head";

  const label = administrator
    ? "Administrator"
    : clientServiceHead
      ? "Client Service Head"
      : "Receptionist";

  const colour = administrator
    ? "bg-brand-900 text-white"
    : clientServiceHead
      ? "bg-amber-100 text-amber-900"
      : "bg-sky-100 text-sky-800";

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${colour}`}>
      {administrator ? (
        <ShieldCheck aria-hidden="true" className="size-3.5" />
      ) : (
        <UserCog aria-hidden="true" className="size-3.5" />
      )}

      {label}
    </span>
  );
}

function AccessBadge({ active }) {
  return (
    <StateChip on={active}>
      {active ? "Active" : "Deactivated"}
    </StateChip>
  );
}

function ConfirmationBadge({
  emailConfirmed,
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${
        emailConfirmed
          ? "border-brand-200 bg-brand-50 text-brand-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      {emailConfirmed ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Mail aria-hidden="true" className="size-3.5" />
      )}

      {emailConfirmed
        ? "Email confirmed"
        : "Invitation pending"}
    </span>
  );
}

function OnboardingBadge({
  staffMember,
}) {
  const pending =
    staffMember.passwordChangeRequired;

  const expired =
    pending &&
    temporaryPasswordExpired(
      staffMember
        .temporaryPasswordExpiresAt,
    );

  let label = "Configured account";
  let colour =
    "border-brand-200 bg-brand-50 text-brand-800";

  if (pending && expired) {
    label = "Setup expired";
    colour =
      "border-red-200 bg-red-50 text-red-800";
  } else if (pending) {
    label = "Setup pending";
    colour =
      "border-amber-200 bg-amber-50 text-amber-900";
  } else if (
    staffMember.passwordSetupCompletedAt
  ) {
    label = "Password secured";
  }

  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold " +
        colour
      }
    >
      {pending ? (
        <Clock aria-hidden="true" className="size-3.5" />
      ) : (
        <Check aria-hidden="true" className="size-3.5" />
      )}

      {label}
    </span>
  );
}

const ROW_ICON_BUTTON =
  "grid size-10 shrink-0 place-items-center rounded-full border bg-white transition focus-visible:ring-4 focus-visible:ring-brand-200";

function StaffActions({
  currentUserId,
  onDelete,
  onEdit,
  onReissue,
  staffMember,
}) {
  const ownAccount =
    currentUserId === staffMember.userId;

  const canReissue =
    !ownAccount &&
    staffMember.active &&
    staffMember.passwordChangeRequired;

  return (
    <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap xl:justify-center">
      <button
        aria-label={`Edit ${staffMember.fullName}`}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-brand-600 bg-white px-4 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200"
        onClick={() => onEdit(staffMember)}
        type="button"
      >
        <Pencil
          aria-hidden="true"
          className="size-4"
        />
        Edit
      </button>

      {canReissue ? (
        <button
          aria-label={`Reissue password for ${staffMember.fullName}`}
          className={`${ROW_ICON_BUTTON} border-amber-300 text-amber-800 hover:bg-amber-50`}
          onClick={() =>
            onReissue(staffMember)
          }
          title="Reissue password"
          type="button"
        >
          <KeyRound
            aria-hidden="true"
            className="size-4"
          />
        </button>
      ) : null}

      {!ownAccount ? (
        <button
          aria-label={`Delete account for ${staffMember.fullName}`}
          className={`${ROW_ICON_BUTTON} border-red-200 text-red-700 hover:bg-red-50`}
          onClick={() =>
            onDelete(staffMember)
          }
          title="Delete account"
          type="button"
        >
          <Trash2
            aria-hidden="true"
            className="size-4"
          />
        </button>
      ) : null}
    </div>
  );
}

function StaffIdentity({ staffMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <InitialsAvatar name={staffMember.fullName} />

      <div className="min-w-0">
        <p className="font-bold text-slate-950 xl:whitespace-nowrap">
          {staffMember.fullName}
        </p>

        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
          <Mail
            aria-hidden="true"
            className="size-3.5 shrink-0"
          />
          {/* Long addresses wrap before the @, not mid-word. */}
          <span className="wrap-break-word">
            {staffMember.email.split("@")[0]}
            <wbr />
            {staffMember.email.includes("@")
              ? "@" +
                staffMember.email
                  .split("@")
                  .slice(1)
                  .join("@")
              : null}
          </span>
        </p>
      </div>
    </div>
  );
}

function AccountActivity({
  showExpiry = true,
  staffMember,
}) {
  return (
    <>
      <p className="whitespace-nowrap">
        {staffMember.lastSignInAt ? (
          <>
            Signed in{" "}
            <span className="font-bold text-slate-950">
              {formatDateTime(
                staffMember.lastSignInAt,
              )}
            </span>
          </>
        ) : (
          <span className="font-bold text-slate-950">
            Never signed in
          </span>
        )}
      </p>

      <p className="mt-1 whitespace-nowrap text-xs text-slate-600">
        Created{" "}
        {formatDate(
          staffMember.createdAt,
        )}
      </p>

      {showExpiry &&
      staffMember
        .passwordChangeRequired ? (
        <p className="mt-1 font-semibold text-amber-900">
          Temporary password expires:{" "}
          {formatDateTime(
            staffMember
              .temporaryPasswordExpiresAt,
          )}
        </p>
      ) : null}
    </>
  );
}

function StaffCard({
  currentUserId,
  onDelete,
  onEdit,
  onReissue,
  staffMember,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <StaffIdentity staffMember={staffMember} />

      <div className="mt-3 flex flex-wrap gap-2">
        <RoleBadge role={staffMember.role} />
        <AccessBadge
          active={staffMember.active}
        />
        <ConfirmationBadge
          emailConfirmed={
            staffMember.emailConfirmed
          }
        />
        <OnboardingBadge
          staffMember={staffMember}
        />
      </div>

      <div className="mt-3 text-sm text-slate-700">
        <AccountActivity staffMember={staffMember} />
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <StaffActions
          currentUserId={currentUserId}
          onDelete={onDelete}
          onEdit={onEdit}
          onReissue={onReissue}
          staffMember={staffMember}
        />
      </div>
    </article>
  );
}

function StaffRow({
  currentUserId,
  onDelete,
  onEdit,
  onReissue,
  staffMember,
}) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="py-4 pl-5 pr-3">
        <StaffIdentity staffMember={staffMember} />
      </td>

      <td className="px-3 py-4 text-center">
        <RoleBadge role={staffMember.role} />
      </td>

      <td className="px-3 py-4 text-center">
        <AccessBadge
          active={staffMember.active}
        />
      </td>

      <td className="px-3 py-4">
        <div className="flex flex-col items-center gap-1.5">
          <ConfirmationBadge
            emailConfirmed={
              staffMember.emailConfirmed
            }
          />

          <OnboardingBadge
            staffMember={staffMember}
          />

          {staffMember.passwordChangeRequired ? (
            <p className="whitespace-nowrap text-xs font-semibold text-amber-900">
              Expires{" "}
              {formatDateTime(
                staffMember.temporaryPasswordExpiresAt,
              )}
            </p>
          ) : null}
        </div>
      </td>

      <td className="px-3 py-4 text-center text-sm text-slate-700">
        <AccountActivity
          showExpiry={false}
          staffMember={staffMember}
        />
      </td>

      <td className="py-4 pl-3 pr-5">
        <StaffActions
          currentUserId={currentUserId}
          onDelete={onDelete}
          onEdit={onEdit}
          onReissue={onReissue}
          staffMember={staffMember}
        />
      </td>
    </tr>
  );
}

function AccountRecoveryDialog({
  error,
  mode,
  onCancel,
  onSubmit,
  staffMember,
  submitting,
}) {
  const deleting = mode === "delete";

  const [
    confirmationEmail,
    setConfirmationEmail,
  ] = useState("");

  const normalizedConfirmation =
    confirmationEmail
      .trim()
      .toLowerCase();

  const confirmationMatches =
    !deleting ||
    normalizedConfirmation ===
      staffMember.email.toLowerCase();

  function submitRecovery(event) {
    event.preventDefault();

    if (deleting) {
      if (!confirmationMatches) {
        return;
      }

      onSubmit({
        confirmationEmail:
          normalizedConfirmation,
        userId: staffMember.userId,
      });

      return;
    }

    onSubmit({
      userId: staffMember.userId,
    });
  }

  return (
    <AdminDialog
      busy={submitting}
      closeLabel={
        deleting
          ? "Close account deletion"
          : "Close password reissue"
      }
      eyebrow="Staff administration"
      onClose={onCancel}
      title={
        deleting
          ? "Delete staff account"
          : "Reissue temporary password"
      }
    >
      <form
        noValidate
        onSubmit={submitRecovery}
      >
        <DialogBody>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <StaffIdentity staffMember={staffMember} />
          </div>

          {deleting ? (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-red-700"
                />

                <div>
                  <p className="font-black">
                    This deletion is permanent
                  </p>

                  <p className="mt-2 text-sm leading-6">
                    The authentication account and staff profile will be removed. Security audit history will be retained. To restore access later, an administrator must invite the person again.
                  </p>
                </div>
              </div>

              <p className="text-sm leading-6 text-slate-700">
                Reissue the temporary password first when onboarding expires. Delete and invite the account again only when recovery remains impossible.
              </p>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="font-black">
                Issue new sign-in details
              </p>

              <p className="mt-2 text-sm leading-6">
                A new temporary password will be generated and emailed to this staff member. The previous temporary password will immediately stop working, and the replacement will expire after 24 hours.
              </p>
            </div>
          )}

          {error ? (
            <ErrorMessage
              message={error}
              title={
                deleting
                  ? "Account deletion unsuccessful"
                  : "Password reissue unsuccessful"
              }
            />
          ) : null}

          {deleting ? (
            <Field
              id="delete-confirmation-email"
              label="Type the staff email address to confirm"
              required
            >
              <input
                aria-describedby="delete-confirmation-help"
                autoCapitalize="none"
                autoComplete="off"
                autoFocus
                className={DIALOG_INPUT}
                disabled={submitting}
                id="delete-confirmation-email"
                inputMode="email"
                maxLength="254"
                onChange={(event) =>
                  setConfirmationEmail(
                    event.target.value,
                  )
                }
                spellCheck="false"
                type="email"
                value={confirmationEmail}
              />

              <p
                className="text-sm leading-6 text-slate-600"
                id="delete-confirmation-help"
              >
                Enter {staffMember.email} exactly. Capitalisation is ignored.
              </p>
            </Field>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <button
            className={DIALOG_CANCEL_BUTTON}
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>

          <button
            className={`${DIALOG_BUTTON} ${
              deleting
                ? "bg-red-700 text-white hover:bg-red-800"
                : "bg-amber-600 text-white hover:bg-amber-700"
            } disabled:bg-slate-200 disabled:text-slate-500`}
            disabled={
              submitting ||
              !confirmationMatches
            }
            type="submit"
          >
            {submitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : deleting ? (
              <Trash2
                aria-hidden="true"
                className="size-4"
              />
            ) : (
              <KeyRound
                aria-hidden="true"
                className="size-4"
              />
            )}

            {submitting
              ? deleting
                ? "Deleting account…"
                : "Reissuing password…"
              : deleting
                ? "Permanently delete account"
                : "Reissue temporary password"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}

function InvitationDialog({
  error,
  onCancel,
  onSubmit,
  submitting,
}) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      email: "",
      fullName: "",
      role: "receptionist",
    },
    resolver: zodResolver(
      adminStaffInviteSchema,
    ),
    shouldFocusError: true,
  });

  const [fullName, email] = useWatch({
    control,
    name: ["fullName", "email"],
  });

  // Sending needs a name and an email address.
  const ready = Boolean(
    fullName.trim() && email.trim(),
  );

  return (
    <AdminDialog
      busy={submitting}
      closeLabel="Close invitation form"
      description="The system emails a temporary password that expires after 24 hours. The person must replace it before using staff services."
      eyebrow="Staff administration"
      onClose={onCancel}
      title="Invite staff member"
    >
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <DialogBody>
          {error ? (
            <ErrorMessage
              message={error}
              title="Invitation unsuccessful"
            />
          ) : null}

          <Field
            error={errors.fullName?.message}
            id="invite-full-name"
            label="Full name"
            required
          >
            <input
              aria-describedby={
                errors.fullName
                  ? "invite-full-name-error"
                  : undefined
              }
              aria-invalid={Boolean(
                errors.fullName,
              )}
              autoComplete="name"
              autoFocus
              className={DIALOG_INPUT}
              disabled={submitting}
              id="invite-full-name"
              maxLength="120"
              {...register("fullName")}
            />
          </Field>

          <Field
            error={errors.email?.message}
            id="invite-email"
            label="Email address"
            required
          >
            <input
              aria-describedby={
                errors.email
                  ? "invite-email-error"
                  : undefined
              }
              aria-invalid={Boolean(
                errors.email,
              )}
              autoCapitalize="none"
              autoComplete="email"
              className={DIALOG_INPUT}
              disabled={submitting}
              id="invite-email"
              inputMode="email"
              maxLength="254"
              spellCheck="false"
              type="email"
              {...register("email")}
            />
          </Field>

          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <SegmentedChoice
                disabled={submitting}
                legend="Authorised role"
                name="invite-role"
                onChange={field.onChange}
                options={ROLE_OPTIONS}
                required
                value={field.value}
              />
            )}
          />
        </DialogBody>

        <DialogFooter>
          <button
            className={DIALOG_CANCEL_BUTTON}
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>

          <button
            className={DIALOG_PRIMARY_BUTTON}
            disabled={submitting || !ready}
            type="submit"
          >
            {submitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}

            {submitting
              ? "Sending invitation…"
              : "Send invitation"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}

function StaffEditorDialog({
  error,
  onCancel,
  onSubmit,
  staffMember,
  submitting,
}) {
  const {
    control,
    formState: { errors, isDirty },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      active: staffMember.active,
      fullName: staffMember.fullName,
      role: staffMember.role,
      userId: staffMember.userId,
    },
    resolver: zodResolver(
      adminStaffUpdateSchema,
    ),
    shouldFocusError: true,
  });

  return (
    <AdminDialog
      busy={submitting}
      closeLabel="Close staff editor"
      description={staffMember.email}
      eyebrow="Staff administration"
      onClose={onCancel}
      title="Edit staff account"
    >
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <DialogBody>
          {error ? (
            <ErrorMessage
              message={error}
              title="Staff update unsuccessful"
            />
          ) : null}

          <Field
            error={errors.fullName?.message}
            id="edit-staff-full-name"
            label="Full name"
            required
          >
            <input
              aria-describedby={
                errors.fullName
                  ? "edit-staff-full-name-error"
                  : undefined
              }
              aria-invalid={Boolean(
                errors.fullName,
              )}
              autoComplete="name"
              autoFocus
              className={DIALOG_INPUT}
              disabled={submitting}
              id="edit-staff-full-name"
              maxLength="120"
              {...register("fullName")}
            />
          </Field>

          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <SegmentedChoice
                disabled={submitting}
                legend="Authorised role"
                name="edit-staff-role"
                onChange={field.onChange}
                options={ROLE_OPTIONS}
                required
                value={field.value}
              />
            )}
          />

          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <SegmentedChoice
                description={
                  field.value
                    ? "This person can sign in and use staff services."
                    : "This account stays on record but cannot use protected staff functions."
                }
                disabled={submitting}
                legend="Access"
                name="edit-staff-access"
                onChange={field.onChange}
                options={ACCESS_CHOICES}
                value={field.value}
              />
            )}
          />
        </DialogBody>

        <DialogFooter>
          <button
            className={DIALOG_CANCEL_BUTTON}
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>

          <button
            className={DIALOG_PRIMARY_BUTTON}
            disabled={submitting || !isDirty}
            type="submit"
          >
            {submitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}

            {submitting
              ? "Saving…"
              : "Save changes"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}
