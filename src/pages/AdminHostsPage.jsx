import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ban,
  Check,
  CirclePlus,
  Landmark,
  LoaderCircle,
  Pencil,
  RefreshCw,
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
  adminHostListSchema,
  adminHostSaveSchema,
} from "../validation/adminManagement.js";

const PAGE_SIZE = 10;

const INITIAL_FILTERS = Object.freeze({
  search: "",
  status: "all",
});

const dateFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeZone: "Africa/Accra",
  },
);

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
    summary: normalizeHostSummary(
      result.summary,
    ),
  };
}

// Whole-table counts and the department list. Null until the summary
// migration is applied, in which case the stat cards are hidden.
function normalizeHostSummary(summary) {
  if (
    !summary ||
    typeof summary !== "object" ||
    !Array.isArray(summary.departments)
  ) {
    return null;
  }

  const counts = {
    activeCount: Number(summary.activeCount),
    departmentCount: Number(
      summary.departmentCount,
    ),
    inactiveCount: Number(summary.inactiveCount),
    totalCount: Number(summary.totalCount),
  };

  if (
    !Object.values(counts).every(
      (value) =>
        Number.isInteger(value) && value >= 0,
    )
  ) {
    return null;
  }

  return {
    ...counts,
    departments: summary.departments.filter(
      (department) =>
        typeof department === "string",
    ),
  };
}

const RECORDS_ID = "host-records";

function scrollToRecords(options) {
  document
    .getElementById(RECORDS_ID)
    ?.scrollIntoView(options);
}

const STATUS_FILTERS = Object.freeze([
  Object.freeze({ label: "All", value: "all" }),
  Object.freeze({ label: "Active", value: "active" }),
  Object.freeze({ label: "Inactive", value: "inactive" }),
]);

const STATUS_CHOICES = Object.freeze([
  Object.freeze({ label: "Active", value: true }),
  Object.freeze({ label: "Inactive", value: false }),
]);

export default function AdminHostsPage() {
  const { session, signOut } = useAuth();

  const [hostList, setHostList] =
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
        pageSize: PAGE_SIZE,
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
        adminHostListSchema.shape.search.safeParse(
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

    setRequestStatus("loading");
    setPage(nextPage);

    scrollToRecords({
      block: "start",
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

  const summary = hostList?.summary || null;

  const statCards = summary
    ? [
        {
          count: summary.totalCount.toLocaleString(),
          icon: Landmark,
          id: "total",
          note: `${summary.departmentCount.toLocaleString()} ${
            summary.departmentCount === 1
              ? "department"
              : "departments"
          }`,
          onOpen: () =>
            showInPanel({ status: "all" }),
          shortTitle: "Total",
          title: "Total hosts",
        },
        {
          count: summary.activeCount.toLocaleString(),
          icon: Check,
          id: "active",
          note: "Shown to visitors",
          noteTone: "brand",
          onOpen: () =>
            showInPanel({ status: "active" }),
          shortTitle: "Active",
          title: "Active hosts",
        },
        {
          count: summary.inactiveCount.toLocaleString(),
          icon: Ban,
          id: "inactive",
          note: "Hidden from visitor workflows",
          onOpen: () =>
            showInPanel({ status: "inactive" }),
          shortTitle: "Inactive",
          title: "Inactive hosts",
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
            Hosts
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Add and maintain the people and offices
            that receive visitors. Inactive hosts no
            longer appear in visitor workflows.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            className={OUTLINE_BUTTON}
            disabled={loading}
            onClick={refreshHosts}
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
            onClick={openCreateHost}
            type="button"
          >
            <CirclePlus
              aria-hidden="true"
              className="size-4"
            />
            Add host
          </button>
        </div>
      </header>

      <SuccessBanner
        message={successMessage}
        onDismiss={() => setSuccessMessage("")}
      />

      {statCards.length ? (
        <section
          aria-label="Host statistics"
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
          className="mt-4 scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          id={RECORDS_ID}
        >
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className="text-xl font-black text-slate-950"
                id="host-records-heading"
              >
                Host records
              </h2>

              <p
                aria-live="polite"
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800"
              >
                {hostList.pagination.totalCount.toLocaleString()}{" "}
                {hostList.pagination.totalCount ===
                1
                  ? "matching host"
                  : "matching hosts"}
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchPill
                describedBy={
                  searchError
                    ? "host-search-error"
                    : undefined
                }
                id="host-search"
                label="Host name or department"
                maxLength="80"
                onChange={setSearchDraft}
                placeholder="Host name or department"
                value={searchDraft}
              />

              <div
                aria-label="Host status"
                className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1 lg:self-auto"
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
                id="host-search-error"
                role="alert"
              >
                {searchError}
              </p>
            ) : null}
          </div>

          {hostList.hosts.length === 0 ? (
            <div className="px-4 pb-6 sm:px-6">
              <div className="rounded-2xl bg-slate-50 p-6 text-center">
                <Users
                  aria-hidden="true"
                  className="mx-auto size-10 text-slate-500"
                />

                <h3 className="mt-4 font-black text-slate-950">
                  No hosts found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No host matches this search and
                  status. Try another filter or add a
                  host.
                </p>
              </div>
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <div className="grid gap-3 px-4 pb-4 md:hidden">
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
                  <thead className="border-y border-slate-200 bg-slate-50">
                    <tr>
                      <th
                        className={`${TABLE_HEAD_CELL} pl-6`}
                        scope="col"
                      >
                        Host
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Department
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Status
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} text-center`}
                        scope="col"
                      >
                        Added
                      </th>
                      <th
                        className={`${TABLE_HEAD_CELL} pr-6 text-center`}
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
            </div>
          )}

          <ListPagination
            goToPage={goToPage}
            label="Host administration pages"
            noun="hosts"
            nounSingular="host"
            pagination={hostList.pagination}
          />
        </section>
      ) : null}

      {editor ? (
        <HostEditor
          departments={
            summary?.departments || []
          }
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
    <StateChip on={active}>
      {active ? "Active" : "Inactive"}
    </StateChip>
  );
}

function DepartmentChip({ department }) {
  return (
    <span className="inline-flex max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-800">
      <span className="truncate">
        {department}
      </span>
    </span>
  );
}

function EditButton({ host, onEdit }) {
  return (
    <button
      aria-label={`Edit ${host.fullName}`}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-600 bg-white px-5 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200"
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <InitialsAvatar name={host.fullName} />

        <div className="min-w-0 flex-1">
          <h3 className="wrap-break-word font-black text-slate-950">
            {host.fullName}
          </h3>

          <p className="mt-0.5 text-xs text-slate-600">
            Added {formatDate(host.createdAt)}
          </p>
        </div>

        <HostStatus active={host.active} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <DepartmentChip department={host.department} />
        </div>

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
    <tr className="hover:bg-slate-50">
      <td className="py-4 pl-6 pr-5">
        <div className="flex items-center gap-3">
          <InitialsAvatar name={host.fullName} />

          <span className="font-bold text-slate-950">
            {host.fullName}
          </span>
        </div>
      </td>

      <td className="max-w-xs px-5 py-4 text-center">
        <DepartmentChip department={host.department} />
      </td>

      <td className="px-5 py-4 text-center">
        <HostStatus active={host.active} />
      </td>

      <td className="whitespace-nowrap px-5 py-4 text-center text-sm text-slate-700">
        {formatDate(host.createdAt)}
      </td>

      <td className="py-4 pl-5 pr-6 text-center">
        <EditButton
          host={host}
          onEdit={onEdit}
        />
      </td>
    </tr>
  );
}

function HostEditor({
  departments,
  editor,
  error,
  onCancel,
  onSave,
  saving,
}) {
  const {
    control,
    formState: { errors, isDirty },
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

  // Adding needs both fields; saving needs a change.
  const [fullName, department] = useWatch({
    control,
    name: ["fullName", "department"],
  });

  const ready = creating
    ? Boolean(
        fullName.trim() &&
          department.trim(),
      )
    : isDirty;

  return (
    <AdminDialog
      busy={saving}
      closeLabel="Close host editor"
      eyebrow="Host administration"
      onClose={onCancel}
      title={creating ? "Add host" : "Edit host"}
    >
      <form
        noValidate
        onSubmit={handleSubmit(onSave)}
      >
        <DialogBody>
          {error ? (
            <ErrorMessage
              message={error}
              title="Host could not be saved"
            />
          ) : null}

          <Field
            error={errors.fullName?.message}
            id="host-full-name"
            label="Host name"
            required
          >
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
              className={DIALOG_INPUT}
              disabled={saving}
              id="host-full-name"
              maxLength="120"
              placeholder="Person or office name"
              {...register("fullName")}
            />
          </Field>

          <Field
            error={errors.department?.message}
            id="host-department"
            label="Department"
            required
          >
            {/* Suggests existing departments; a new one can still be typed. */}
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
              className={DIALOG_INPUT}
              disabled={saving}
              id="host-department"
              list="host-department-options"
              maxLength="120"
              placeholder="Start typing a department"
              {...register("department")}
            />

            <datalist id="host-department-options">
              {departments.map((department) => (
                <option
                  key={department}
                  value={department}
                />
              ))}
            </datalist>
          </Field>

          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <SegmentedChoice
                description={
                  field.value
                    ? "Visitors and reception can select this host."
                    : "This host stays on record but no longer appears in visitor workflows."
                }
                disabled={saving}
                legend="Status"
                name="host-status"
                onChange={field.onChange}
                options={STATUS_CHOICES}
                value={field.value}
              />
            )}
          />
        </DialogBody>

        <DialogFooter>
          <button
            className={DIALOG_CANCEL_BUTTON}
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>

          <button
            className={DIALOG_PRIMARY_BUTTON}
            disabled={saving || !ready}
            type="submit"
          >
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}

            {saving
              ? "Saving…"
              : creating
                ? "Add host"
                : "Save changes"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}
