import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
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
  adminHostListSchema,
  adminHostSaveSchema,
} from "../validation/adminManagement.js";

const EMPTY_FILTERS = {
  search: "",
  status: "all",
};

const dateFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeZone: "Africa/Accra",
  },
);

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return dateFormatter.format(date);
}

function normalizeHostList(result) {
  if (
    !result ||
    typeof result !== "object" ||
    !Array.isArray(result.hosts) ||
    !result.pagination ||
    typeof result.pagination !== "object"
  ) {
    throw new Error(
      "Host administration returned an invalid response.",
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

  const validHosts = result.hosts.every(
    (host) =>
      host &&
      typeof host === "object" &&
      typeof host.hostId === "string" &&
      typeof host.fullName === "string" &&
      typeof host.department === "string" &&
      typeof host.active === "boolean" &&
      typeof host.createdAt === "string",
  );

  if (!validPagination || !validHosts) {
    throw new Error(
      "Host administration returned an invalid response.",
    );
  }

  return {
    hosts: result.hosts,
    pagination,
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

function sameFilters(first, second) {
  return (
    first.search === second.search &&
    first.status === second.status
  );
}

export default function AdminHostsPage() {
  const { session, signOut } = useAuth();

  const [hostList, setHostList] =
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

  const [statusDraft, setStatusDraft] =
    useState("all");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [editor, setEditor] =
    useState(null);

  const [editorError, setEditorError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const accessToken =
    session?.access_token || "";

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/api/admin/hosts/list", {
      body: JSON.stringify({
        page,
        pageSize: 10,
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
          normalizeHostList(result);

        setHostList(normalized);
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
            : "Host records could not be loaded. Please try again.",
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
      adminHostListSchema.safeParse({
        page: 1,
        pageSize: 10,
        search: searchDraft,
        status: statusDraft,
      });

    if (!parsed.success) {
      setFilterError(
        parsed.error.issues[0]?.message ||
          "Check the host filters and try again.",
      );
      return;
    }

    const nextFilters = {
      search: parsed.data.search,
      status: parsed.data.status,
    };

    const unchanged =
      page === 1 &&
      sameFilters(filters, nextFilters);

    setHostList(null);
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
    setStatusDraft("all");
    setFilterError("");
    setFilters(EMPTY_FILTERS);
    setHostList(null);
    setRequestError("");
    setRequestStatus("loading");
    setPage(1);
    setRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  function refreshHosts() {
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
        (hostList?.pagination.totalPages ||
          1)
    ) {
      return;
    }

    setHostList(null);
    setRequestError("");
    setRequestStatus("loading");
    setPage(nextPage);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  function openCreateHost() {
    setEditorError("");
    setSuccessMessage("");
    setEditor({
      host: null,
      mode: "create",
    });
  }

  function openEditHost(host) {
    setEditorError("");
    setSuccessMessage("");
    setEditor({
      host,
      mode: "edit",
    });
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setEditorError("");
    setEditor(null);
  }

  async function saveHost(values) {
    setEditorError("");
    setSaving(true);

    try {
      const result = await apiRequest(
        "/api/admin/hosts/save",
        {
          body: JSON.stringify(values),
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          method: "POST",
        },
      );

      if (
        !result?.host?.hostId ||
        !result?.host?.fullName
      ) {
        throw new Error(
          "The host record returned an invalid response.",
        );
      }

      const created =
        values.hostId === null;

      setEditor(null);
      setSuccessMessage(
        created
          ? `${result.host.fullName} was added successfully.`
          : `${result.host.fullName} was updated successfully.`,
      );

      setHostList(null);
      setRequestError("");
      setRequestStatus("loading");
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

      setEditorError(
        error instanceof Error && error.message
          ? error.message
          : "The host record could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const loading =
    requestStatus === "loading";

  const filtersApplied = Boolean(
    filters.search ||
      filters.status !== "all",
  );

  const visiblePages = getVisiblePages(
    page,
    hostList?.pagination.totalPages || 0,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Hosts
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            Add and maintain people or offices that can
            receive visitors. Deactivate records that should
            no longer appear in visitor workflows.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={refreshHosts}
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
            onClick={openCreateHost}
            type="button"
          >
            <CirclePlus
              aria-hidden="true"
              className="size-5"
            />
            Add host
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
        aria-labelledby="host-filters-heading"
        className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
      >
        <h2
          className="text-xl font-black text-slate-950"
          id="host-filters-heading"
        >
          Search and filter
        </h2>

        <form
          className="mt-6 grid gap-5 md:grid-cols-[1fr_0.7fr_auto]"
          noValidate
          onSubmit={submitFilters}
        >
          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="host-search"
            >
              Host name or department
            </label>

            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              />

              <input
                autoComplete="off"
                className={`${inputClassName} pl-12`}
                id="host-search"
                maxLength="80"
                onChange={(event) =>
                  setSearchDraft(
                    event.target.value,
                  )
                }
                placeholder="Search hosts"
                type="search"
                value={searchDraft}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label
              className="font-bold text-slate-800"
              htmlFor="host-status"
            >
              Status
            </label>

            <select
              className={inputClassName}
              id="host-status"
              onChange={(event) =>
                setStatusDraft(
                  event.target.value,
                )
              }
              value={statusDraft}
            >
              <option value="all">
                All hosts
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

      {loading && !hostList ? (
        <div className="mt-6">
          <LoadingState message="Loading host records…" />
        </div>
      ) : null}

      {requestStatus === "error" ? (
        <div className="mt-6">
          <ErrorMessage
            message={requestError}
            onRetry={refreshHosts}
            title="Host administration unavailable"
          />
        </div>
      ) : null}

      {hostList &&
      requestStatus !== "error" ? (
        <section
          aria-busy={loading}
          aria-labelledby="host-records-heading"
          className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 p-5 sm:p-7">
            <h2
              className="text-xl font-black text-slate-950"
              id="host-records-heading"
            >
              Host records
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              {hostList.pagination.totalCount}{" "}
              {hostList.pagination.totalCount ===
              1
                ? "matching host"
                : "matching hosts"}
            </p>
          </div>

          {hostList.hosts.length === 0 ? (
            <div className="p-5 sm:p-8">
              <div className="rounded-2xl bg-slate-50 p-6 text-center">
                <Users
                  aria-hidden="true"
                  className="mx-auto size-10 text-slate-400"
                />

                <h3 className="mt-4 font-black text-slate-950">
                  No hosts found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No host matches the current search and
                  status filter.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 p-4 md:hidden">
                {hostList.hosts.map((host) => (
                  <HostCard
                    host={host}
                    key={host.hostId}
                    onEdit={openEditHost}
                  />
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-50 text-sm text-slate-700">
                    <tr>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Host
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Department
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Status
                      </th>
                      <th
                        className="px-6 py-4 font-bold"
                        scope="col"
                      >
                        Added
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
                    {hostList.hosts.map((host) => (
                      <HostRow
                        host={host}
                        key={host.hostId}
                        onEdit={openEditHost}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {hostList.pagination.totalPages >
          1 ? (
            <Pagination
              currentPage={page}
              goToPage={goToPage}
              totalPages={
                hostList.pagination.totalPages
              }
              visiblePages={visiblePages}
            />
          ) : null}
        </section>
      ) : null}

      {editor ? (
        <HostEditor
          editor={editor}
          error={editorError}
          key={
            editor.host?.hostId || "new-host"
          }
          onCancel={closeEditor}
          onSave={saveHost}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function HostStatus({ active }) {
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

function EditButton({ host, onEdit }) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
      onClick={() => onEdit(host)}
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

function HostCard({ host, onEdit }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="wrap-break-word text-lg font-black text-slate-950">
            {host.fullName}
          </h3>

          <p className="mt-2 wrap-break-word text-sm text-slate-600">
            {host.department}
          </p>
        </div>

        <HostStatus active={host.active} />
      </div>

      <p className="mt-5 text-sm text-slate-500">
        Added {formatDate(host.createdAt)}
      </p>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <EditButton
          host={host}
          onEdit={onEdit}
        />
      </div>
    </article>
  );
}

function HostRow({ host, onEdit }) {
  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="px-6 py-5 font-black text-slate-950">
        {host.fullName}
      </td>

      <td className="px-6 py-5 text-slate-700">
        {host.department}
      </td>

      <td className="px-6 py-5">
        <HostStatus active={host.active} />
      </td>

      <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-600">
        {formatDate(host.createdAt)}
      </td>

      <td className="px-6 py-5 text-right">
        <EditButton
          host={host}
          onEdit={onEdit}
        />
      </td>
    </tr>
  );
}

function HostEditor({
  editor,
  error,
  onCancel,
  onSave,
  saving,
}) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      active: editor.host?.active ?? true,
      department:
        editor.host?.department || "",
      fullName:
        editor.host?.fullName || "",
      hostId: editor.host?.hostId || null,
    },
    resolver: zodResolver(
      adminHostSaveSchema,
    ),
    shouldFocusError: true,
  });

  const creating = editor.mode === "create";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
      role="presentation"
    >
      <section
        aria-labelledby="host-editor-heading"
        aria-modal="true"
        className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-brand-800">
              Host administration
            </p>

            <h2
              className="mt-2 text-2xl font-black text-slate-950"
              id="host-editor-heading"
            >
              {creating
                ? "Add host"
                : "Edit host"}
            </h2>
          </div>

          <button
            aria-label="Close host editor"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-5"
            />
          </button>
        </div>

        {error ? (
          <div className="mt-5">
            <ErrorMessage
              message={error}
              title="Host could not be saved"
            />
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-5"
          noValidate
          onSubmit={handleSubmit(onSave)}
        >
          <Field
            error={errors.fullName?.message}
            id="host-full-name"
            label="Host full name"
            required
          >
            <div className="relative">
              <Building2
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              />

              <input
                aria-describedby={
                  errors.fullName
                    ? "host-full-name-error"
                    : undefined
                }
                aria-invalid={Boolean(
                  errors.fullName,
                )}
                autoComplete="off"
                autoFocus
                className={`${inputClassName} pl-12`}
                disabled={saving}
                id="host-full-name"
                maxLength="120"
                {...register("fullName")}
              />
            </div>
          </Field>

          <Field
            error={errors.department?.message}
            id="host-department"
            label="Department or office"
            required
          >
            <input
              aria-describedby={
                errors.department
                  ? "host-department-error"
                  : undefined
              }
              aria-invalid={Boolean(
                errors.department,
              )}
              autoComplete="off"
              className={inputClassName}
              disabled={saving}
              id="host-department"
              maxLength="120"
              {...register("department")}
            />
          </Field>

          <label className="flex min-h-12 items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input
              className="mt-1 size-5 rounded border-slate-300 text-brand-800 focus:ring-brand-600"
              disabled={saving}
              type="checkbox"
              {...register("active")}
            />

            <span>
              <span className="block font-black text-slate-950">
                Active host
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                Active hosts can appear in visitor
                workflows. Clear this option to retain the
                record without making it available.
              </span>
            </span>
          </label>

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              disabled={saving}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>

            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              ) : creating ? (
                <CirclePlus
                  aria-hidden="true"
                  className="size-5"
                />
              ) : (
                <Pencil
                  aria-hidden="true"
                  className="size-5"
                />
              )}

              {saving
                ? "Saving…"
                : creating
                  ? "Add host"
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
      aria-label="Host administration pages"
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