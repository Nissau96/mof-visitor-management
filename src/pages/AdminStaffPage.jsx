import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock,
  KeyRound,
  LoaderCircle,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Field from "../components/Field.jsx";
import LoadingState from "../components/LoadingState.jsx";
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

const EMPTY_FILTERS = {
  role: "all",
  search: "",
  status: "all",
};

const dateTimeFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  },
);

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

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

function sameFilters(first, second) {
  return (
    first.role === second.role &&
    first.search === second.search &&
    first.status === second.status
  );
}

export default function AdminStaffPage() {
  const { session, signOut } = useAuth();

  const [staffList, setStaffList] =
    useState(null);

  const [requestStatus, setRequestStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [filterError, setFilterError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [filters, setFilters] =
    useState(EMPTY_FILTERS);

  const [searchDraft, setSearchDraft] =
    useState("");

  const [roleDraft, setRoleDraft] =
    useState("all");

  const [statusDraft, setStatusDraft] =
    useState("all");

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
        pageSize: 10,
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

  function submitFilters(event) {
    event.preventDefault();
    setFilterError("");

    const parsed =
      adminStaffListSchema.safeParse({
        page: 1,
        pageSize: 10,
        role: roleDraft,
        search: searchDraft,
        status: statusDraft,
      });

    if (!parsed.success) {
      setFilterError(
        parsed.error.issues[0]?.message ||
          "Check the staff filters and try again.",
      );
      return;
    }

    const nextFilters = {
      role: parsed.data.role,
      search: parsed.data.search,
      status: parsed.data.status,
    };

    const unchanged =
      page === 1 &&
      sameFilters(filters, nextFilters);

    setStaffList(null);
    setRequestError("");
    setRequestStatus("loading");
    setPage(1);
    setFilters(nextFilters);

    if (unchanged) {
      setRefreshKey(
        (currentKey) => currentKey + 1,
      );
    }
  }

  function clearFilters() {
    setSearchDraft("");
    setRoleDraft("all");
    setStatusDraft("all");
    setFilterError("");
    setFilters(EMPTY_FILTERS);
    setStaffList(null);
    setRequestError("");
    setRequestStatus("loading");
    setPage(1);
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
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

    setStaffList(null);
    setRequestError("");
    setRequestStatus("loading");
    setPage(nextPage);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
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
    setStaffList(null);
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

  const filtersApplied = Boolean(
    filters.search ||
      filters.role !== "all" ||
      filters.status !== "all",
  );

  const visiblePages = getVisiblePages(
    page,
    staffList?.pagination.totalPages || 0,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Staff accounts
          </h1>

          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            Invite authorised staff and manage their assigned role, access and password onboarding. Reissue a temporary password first when setup expires. If recovery remains impossible, permanently delete the expired account and invite the person again.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={refreshStaff}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-5 ${
                loading ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>

          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900"
            onClick={openInvitation}
            type="button"
          >
            <CirclePlus
              aria-hidden="true"
              className="size-5"
            />
            Invite staff
          </button>
        </div>
      </header>

      {successMessage ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"
          role="status"
        >
          <p className="flex-1">
            {successMessage}
          </p>

          <button
            aria-label="Dismiss confirmation"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-100"
            onClick={() =>
              setSuccessMessage("")
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
        aria-labelledby="staff-filters-heading"
        className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
      >
        <h2
          className="text-xl font-black text-slate-950"
          id="staff-filters-heading"
        >
          Search and filter
        </h2>

        <form
          className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto]"
          noValidate
          onSubmit={submitFilters}
        >
          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="staff-search"
            >
              Staff name or email
            </label>

            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              />

              <input
                autoComplete="off"
                className={`${inputClassName} pl-12`}
                id="staff-search"
                maxLength="120"
                onChange={(event) =>
                  setSearchDraft(
                    event.target.value,
                  )
                }
                placeholder="Search staff"
                type="search"
                value={searchDraft}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="staff-role-filter"
            >
              Role
            </label>

            <select
              className={inputClassName}
              id="staff-role-filter"
              onChange={(event) =>
                setRoleDraft(
                  event.target.value,
                )
              }
              value={roleDraft}
            >
              <option value="all">
                All roles
              </option>
              <option value="receptionist">
                Receptionist
              </option>
              <option value="client_service_head">
                Client Service Head
              </option>
              <option value="admin">
                Administrator
              </option>
            </select>
          </div>

          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="staff-status-filter"
            >
              Status
            </label>

            <select
              className={inputClassName}
              id="staff-status-filter"
              onChange={(event) =>
                setStatusDraft(
                  event.target.value,
                )
              }
              value={statusDraft}
            >
              <option value="all">
                All staff
              </option>
              <option value="active">
                Active
              </option>
              <option value="inactive">
                Inactive
              </option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 p-5 sm:p-7">
            <h2
              className="text-xl font-black text-slate-950"
              id="staff-records-heading"
            >
              Staff records
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              {staffList.pagination.totalCount}{" "}
              {staffList.pagination.totalCount ===
              1
                ? "matching staff account"
                : "matching staff accounts"}
            </p>
          </div>

          {staffList.staff.length === 0 ? (
            <div className="p-5 sm:p-8">
              <div className="rounded-2xl bg-slate-50 p-6 text-center">
                <Users
                  aria-hidden="true"
                  className="mx-auto size-10 text-slate-400"
                />

                <h3 className="mt-4 font-black text-slate-950">
                  No staff accounts found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No staff account matches the current
                  search and filters.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 p-4 lg:hidden">
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

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-50 text-sm text-slate-700">
                    <tr>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Staff member
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Role
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Access
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Account activity
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
            </>
          )}

          {staffList.pagination.totalPages >
          1 ? (
            <Pagination
              currentPage={page}
              goToPage={goToPage}
              totalPages={
                staffList.pagination
                  .totalPages
              }
              visiblePages={visiblePages}
            />
          ) : null}
        </section>
      ) : null}

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
    ? "bg-brand-100 text-brand-900"
    : clientServiceHead
      ? "bg-amber-100 text-amber-900"
      : "bg-sky-100 text-sky-800";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${colour}`}>
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
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
        active
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-200 text-slate-700"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ConfirmationBadge({
  emailConfirmed,
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
        emailConfirmed
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {emailConfirmed ? (
        <BadgeCheck
          aria-hidden="true"
          className="size-3.5"
        />
      ) : (
        <Clock
          aria-hidden="true"
          className="size-3.5"
        />
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
    "bg-slate-100 text-slate-700";

  if (pending && expired) {
    label = "Setup expired";
    colour =
      "bg-red-100 text-red-800";
  } else if (pending) {
    label = "Password setup pending";
    colour =
      "bg-amber-100 text-amber-900";
  } else if (
    staffMember.passwordSetupCompletedAt
  ) {
    label = "Password secured";
    colour =
      "bg-emerald-100 text-emerald-800";
  }

  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black " +
        colour
      }
    >
      {pending ? (
        <Clock
          aria-hidden="true"
          className="size-3.5"
        />
      ) : (
        <ShieldCheck
          aria-hidden="true"
          className="size-3.5"
        />
      )}

      {label}
    </span>
  );
}

function EditButton({
  onEdit,
  staffMember,
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
      onClick={() => onEdit(staffMember)}
      type="button"
    >
      <Pencil
        aria-hidden="true"
        className="size-4"
      />
      Edit
    </button>
  );
}

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
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
      <EditButton
        onEdit={onEdit}
        staffMember={staffMember}
      />

      {canReissue ? (
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-950 hover:bg-amber-100"
          onClick={() =>
            onReissue(staffMember)
          }
          type="button"
        >
          <KeyRound
            aria-hidden="true"
            className="size-4"
          />
          Reissue password
        </button>
      ) : null}

      {!ownAccount ? (
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-50"
          onClick={() =>
            onDelete(staffMember)
          }
          type="button"
        >
          <Trash2
            aria-hidden="true"
            className="size-4"
          />
          Delete account
        </button>
      ) : null}
    </div>
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
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="wrap-break-word text-lg font-black text-slate-950">
          {staffMember.fullName}
        </h3>

        <p className="mt-2 flex items-start gap-2 wrap-break-word text-sm text-slate-600">
          <Mail
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {staffMember.email}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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

      <dl className="mt-5 grid gap-3 text-sm">
        <div>
          <dt className="font-semibold text-slate-600">
            Last sign-in
          </dt>
          <dd className="mt-1 font-bold text-slate-950">
            {formatDateTime(
              staffMember.lastSignInAt,
            )}
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-slate-600">
            Account created
          </dt>
          <dd className="mt-1 font-bold text-slate-950">
            {formatDateTime(
              staffMember.createdAt,
            )}
          </dd>
        </div>

        {staffMember
          .passwordChangeRequired ? (
          <div>
            <dt className="font-semibold text-slate-600">
              Temporary password expires
            </dt>
            <dd className="mt-1 font-bold text-slate-950">
              {formatDateTime(
                staffMember
                  .temporaryPasswordExpiresAt,
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 border-t border-slate-200 pt-5">
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
    <tr className="align-top hover:bg-slate-50">
      <td className="px-6 py-5">
        <p className="font-black text-slate-950">
          {staffMember.fullName}
        </p>

        <p className="mt-2 wrap-break-word text-sm text-slate-600">
          {staffMember.email}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <ConfirmationBadge
            emailConfirmed={
              staffMember.emailConfirmed
            }
          />

          <OnboardingBadge
            staffMember={staffMember}
          />
        </div>
      </td>

      <td className="px-6 py-5">
        <RoleBadge role={staffMember.role} />
      </td>

      <td className="px-6 py-5">
        <AccessBadge
          active={staffMember.active}
        />
      </td>

      <td className="px-6 py-5 text-sm text-slate-700">
        <p>
          Last sign-in:{" "}
          {formatDateTime(
            staffMember.lastSignInAt,
          )}
        </p>

        <p className="mt-2">
          Created:{" "}
          {formatDateTime(
            staffMember.createdAt,
          )}
        </p>

        {staffMember
          .passwordChangeRequired ? (
          <p className="mt-2 font-semibold text-amber-900">
            Temporary password expires:{" "}
            {formatDateTime(
              staffMember
                .temporaryPasswordExpiresAt,
            )}
          </p>
        ) : null}
      </td>

      <td className="px-6 py-5 text-right">
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

  const heading = deleting
    ? "Delete staff account"
    : "Reissue temporary password";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      role="presentation"
    >
      <section
        aria-labelledby="staff-recovery-heading"
        aria-modal="true"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-brand-800">
              Staff administration
            </p>

            <h2
              className="mt-2 text-2xl font-black text-slate-950"
              id="staff-recovery-heading"
            >
              {heading}
            </h2>
          </div>

          <button
            aria-label={
              deleting
                ? "Close account deletion"
                : "Close password reissue"
            }
            className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-5"
            />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-black text-slate-950">
            {staffMember.fullName}
          </p>

          <p className="mt-1 wrap-break-word text-sm text-slate-600">
            {staffMember.email}
          </p>
        </div>

        {deleting ? (
          <>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950">
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

            <p className="mt-5 text-sm leading-6 text-slate-700">
              Reissue the temporary password first when onboarding expires. Delete and invite the account again only when recovery remains impossible.
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-black">
              Issue new sign-in details
            </p>

            <p className="mt-2 text-sm leading-6">
              A new temporary password will be generated and emailed to this staff member. The previous temporary password will immediately stop working, and the replacement will expire after 24 hours.
            </p>
          </div>
        )}

        {error ? (
          <div className="mt-5">
            <ErrorMessage
              message={error}
              title={
                deleting
                  ? "Account deletion unsuccessful"
                  : "Password reissue unsuccessful"
              }
            />
          </div>
        ) : null}

        <form
          className="mt-6"
          noValidate
          onSubmit={submitRecovery}
        >
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
                className={inputClassName}
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
                className="mt-2 text-sm leading-6 text-slate-600"
                id="delete-confirmation-help"
              >
                Enter {staffMember.email} exactly. Capitalisation is ignored.
              </p>
            </Field>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              disabled={submitting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>

            <button
              className={
                deleting
                  ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-700 px-5 font-black text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                  : "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              }
              disabled={
                submitting ||
                !confirmationMatches
              }
              type="submit"
            >
              {submitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              ) : deleting ? (
                <Trash2
                  aria-hidden="true"
                  className="size-5"
                />
              ) : (
                <KeyRound
                  aria-hidden="true"
                  className="size-5"
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
          </div>
        </form>
      </section>
    </div>
  );
}

function InvitationDialog({
  error,
  onCancel,
  onSubmit,
  submitting,
}) {
  const {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      role="presentation"
    >
      <section
        aria-labelledby="staff-invite-heading"
        aria-modal="true"
        className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-brand-800">
              Staff administration
            </p>

            <h2
              className="mt-2 text-2xl font-black text-slate-950"
              id="staff-invite-heading"
            >
              Invite staff member
            </h2>
          </div>

          <button
            aria-label="Close invitation form"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-5"
            />
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">
          The system will email a temporary password that expires after 24 hours. The invited person must replace it before accessing staff services.
        </p>

        {error ? (
          <div className="mt-5">
            <ErrorMessage
              message={error}
              title="Invitation unsuccessful"
            />
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-5"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
        >
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
              className={inputClassName}
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
            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              />

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
                className={`${inputClassName} pl-12`}
                disabled={submitting}
                id="invite-email"
                inputMode="email"
                maxLength="254"
                spellCheck="false"
                type="email"
                {...register("email")}
              />
            </div>
          </Field>

          <Field
            error={errors.role?.message}
            id="invite-role"
            label="Authorised role"
            required
          >
            <select
              aria-describedby={
                errors.role
                  ? "invite-role-error"
                  : undefined
              }
              aria-invalid={Boolean(errors.role)}
              className={inputClassName}
              disabled={submitting}
              id="invite-role"
              {...register("role")}
            >
              <option value="receptionist">
                Receptionist
              </option>
              <option value="client_service_head">
                Client Service Head
              </option>
              <option value="admin">
                Administrator
              </option>
            </select>
          </Field>

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              disabled={submitting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>

            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              ) : (
                <CirclePlus
                  aria-hidden="true"
                  className="size-5"
                />
              )}

              {submitting
                ? "Sending invitation…"
                : "Send invitation"}
            </button>
          </div>
        </form>
      </section>
    </div>
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
    formState: { errors },
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      role="presentation"
    >
      <section
        aria-labelledby="staff-editor-heading"
        aria-modal="true"
        className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-brand-800">
              Staff administration
            </p>

            <h2
              className="mt-2 text-2xl font-black text-slate-950"
              id="staff-editor-heading"
            >
              Edit staff account
            </h2>
          </div>

          <button
            aria-label="Close staff editor"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-5"
            />
          </button>
        </div>

        <p className="mt-4 wrap-break-word text-sm text-slate-600">
          {staffMember.email}
        </p>

        {error ? (
          <div className="mt-5">
            <ErrorMessage
              message={error}
              title="Staff update unsuccessful"
            />
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-5"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
        >
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
              className={inputClassName}
              disabled={submitting}
              id="edit-staff-full-name"
              maxLength="120"
              {...register("fullName")}
            />
          </Field>

          <Field
            error={errors.role?.message}
            id="edit-staff-role"
            label="Authorised role"
            required
          >
            <select
              aria-describedby={
                errors.role
                  ? "edit-staff-role-error"
                  : undefined
              }
              aria-invalid={Boolean(errors.role)}
              className={inputClassName}
              disabled={submitting}
              id="edit-staff-role"
              {...register("role")}
            >
              <option value="receptionist">
                Receptionist
              </option>
              <option value="client_service_head">
                Client Service Head
              </option>
              <option value="admin">
                Administrator
              </option>
            </select>
          </Field>

          <label className="flex min-h-12 items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input
              className="mt-1 size-5 rounded border-slate-300 text-brand-800 focus:ring-brand-600"
              disabled={submitting}
              type="checkbox"
              {...register("active")}
            />

            <span>
              <span className="block font-black text-slate-950">
                Active staff access
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                Inactive staff accounts cannot access
                protected staff functions.
              </span>
            </span>
          </label>

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              disabled={submitting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>

            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              ) : (
                <Pencil
                  aria-hidden="true"
                  className="size-5"
                />
              )}

              {submitting
                ? "Saving…"
                : "Save changes"}
            </button>
          </div>
        </form>
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
      aria-label="Staff administration pages"
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