import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  List,
  LoaderCircle,
  MapPin,
  Pencil,
  RefreshCw,
  Repeat,
  RotateCcw,
  Trash2,
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
import { getTowerLabel } from "../constants/visitorOptions.js";
import useAuth from "../hooks/useAuth.js";
import { ApiError } from "../lib/api.js";
import { getAccraIsoDate } from "../lib/accraDate.js";
import {
  deleteStaffMeeting,
  getStaffMeetings,
  saveStaffMeeting,
  setStaffMeetingActive,
} from "../lib/meetingApi.js";
import {
  WEEKDAYS,
  formatDate,
  formatSchedule,
  formatTimeRange,
  getMonthGrid,
  meetingOccursOn,
  shiftMonth,
  toDate,
} from "../lib/meetingSchedule.js";
import {
  meetingFormSchema,
  meetingListSchema,
} from "../validation/meetings.js";

const PAGE_SIZE = 10;

const RECORDS_ID = "meeting-schedule";

const TABS = Object.freeze([
  Object.freeze({ label: "Today", value: "today" }),
  Object.freeze({ label: "Upcoming", value: "upcoming" }),
  Object.freeze({ label: "Past", value: "past" }),
  Object.freeze({ label: "Cancelled", value: "cancelled" }),
]);

const TOWER_FILTERS = Object.freeze([
  Object.freeze({ label: "All towers", value: "" }),
  Object.freeze({ label: "Tower 1", value: "tower_1" }),
  Object.freeze({ label: "Tower 2", value: "tower_2" }),
]);

const SCHEDULE_CHOICES = Object.freeze([
  Object.freeze({ label: "One day", value: "single" }),
  Object.freeze({ label: "Date range", value: "continuous" }),
  Object.freeze({ label: "Weekly", value: "weekly" }),
]);

const TOWER_CHOICES = Object.freeze([
  Object.freeze({ label: "Tower 1", value: "tower_1" }),
  Object.freeze({ label: "Tower 2", value: "tower_2" }),
]);

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

const agendaFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
});

function scrollToSchedule(options) {
  document
    .getElementById(RECORDS_ID)
    ?.scrollIntoView(options);
}

function towerName(tower) {
  return tower ? getTowerLabel(tower) : "No tower";
}

export default function StaffMeetingsPage() {
  const {
    profile,
    session,
    signOut,
    tower: sessionTower,
  } = useAuth();

  const receptionist =
    profile?.role === "receptionist";

  const accessToken =
    session?.access_token || "";

  const [viewMode, setViewMode] =
    useState("table");

  const [tab, setTab] = useState("today");

  const [searchDraft, setSearchDraft] =
    useState("");

  const [search, setSearch] = useState("");

  const [searchError, setSearchError] =
    useState("");

  const [towerFilter, setTowerFilter] =
    useState("");

  const [page, setPage] = useState(1);

  const [month, setMonth] = useState(() =>
    getAccraIsoDate().slice(0, 7),
  );

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [result, setResult] = useState(null);

  const [requestStatus, setRequestStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [dialog, setDialog] = useState(null);

  const [dialogError, setDialogError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  // Receptionists always work in their session tower.
  const requestTower = receptionist
    ? sessionTower
    : towerFilter;

  const grid = getMonthGrid(`${month}-01`);

  useEffect(() => {
    const controller = new AbortController();

    getStaffMeetings({
      accessToken,
      ...(viewMode === "calendar"
        ? {
            from: grid.start,
            to: grid.end,
            view: "range",
          }
        : {
            page,
            pageSize: PAGE_SIZE,
            view: tab,
          }),
      search,
      signal: controller.signal,
      tower: requestTower,
    })
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          !data ||
          !Array.isArray(data.meetings) ||
          !data.pagination ||
          !data.summary
        ) {
          throw new Error(
            "Meetings returned an invalid response.",
          );
        }

        setResult(data);
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
          error.status === 401
        ) {
          void signOut().catch(() => undefined);
          return;
        }

        setRequestError(
          error instanceof Error && error.message
            ? error.message
            : "Meetings could not be loaded. Please try again.",
        );
        setRequestStatus("error");
      });

    return () => {
      controller.abort();
    };
    // grid.start/end follow month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    month,
    page,
    refreshKey,
    requestTower,
    search,
    signOut,
    tab,
    viewMode,
  ]);

  const applySearch = useEffectEvent(
    (value) => {
      if (search !== value) {
        setSearch(value);
        setPage(1);
        setRequestStatus("loading");
      }
    },
  );

  // Search runs shortly after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed =
        meetingListSchema.safeParse({
          search: searchDraft,
        });

      if (!parsed.success) {
        setSearchError(
          parsed.error.issues[0]?.message ||
            "Check the search and try again.",
        );
        return;
      }

      setSearchError("");
      applySearch(parsed.data.search);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchDraft]);

  function reload() {
    setRequestStatus("loading");
    setRefreshKey((key) => key + 1);
  }

  function changeTab(nextTab) {
    setViewMode("table");
    setTab(nextTab);
    setPage(1);
    setRequestStatus("loading");
  }

  function changeViewMode(nextMode) {
    if (nextMode !== viewMode) {
      setViewMode(nextMode);
      setRequestStatus("loading");
    }
  }

  function showInSchedule(change) {
    change();

    scrollToSchedule({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function changeMonth(offset) {
    setMonth((current) =>
      offset === 0
        ? getAccraIsoDate().slice(0, 7)
        : shiftMonth(`${current}-01`, offset).slice(0, 7),
    );
    setRequestStatus("loading");
  }

  function goToPage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage === page ||
      nextPage > (result?.pagination.totalPages || 1)
    ) {
      return;
    }

    setPage(nextPage);
    setRequestStatus("loading");
    scrollToSchedule({ block: "start" });
  }

  function openDialog(type, meeting = null) {
    setDialogError("");
    setSuccessMessage("");
    setDialog({ meeting, type });
  }

  function closeDialog() {
    if (!submitting) {
      setDialog(null);
      setDialogError("");
    }
  }

  async function runChange(action, message) {
    setDialogError("");
    setSubmitting(true);

    try {
      const data = await action();

      setDialog(null);
      setSuccessMessage(message(data));
      reload();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        void signOut().catch(() => undefined);
        return;
      }

      setDialogError(
        error instanceof Error && error.message
          ? error.message
          : "The meeting could not be changed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function saveMeeting(values) {
    return runChange(
      () =>
        saveStaffMeeting({
          accessToken,
          meeting: values,
          tower: requestTower,
        }),
      (data) =>
        data?.created
          ? `${data.title} was added to the meeting schedule.`
          : `${data?.title || "The meeting"} was updated.`,
    );
  }

  function changeStatus(meeting, active) {
    return runChange(
      () =>
        setStaffMeetingActive({
          accessToken,
          active,
          meetingId: meeting.meetingId,
          tower: requestTower,
        }),
      () =>
        active
          ? `${meeting.title} was restored and visitors can select it again.`
          : `${meeting.title} was cancelled. Visitors can no longer select it.`,
    );
  }

  function removeMeeting(meeting) {
    return runChange(
      () =>
        deleteStaffMeeting({
          accessToken,
          meetingId: meeting.meetingId,
          tower: requestTower,
        }),
      () => `${meeting.title} was deleted.`,
    );
  }

  const loading = requestStatus === "loading";
  const summary = result?.summary || null;
  const canManage = Boolean(
    result?.scope?.canManage,
  );

  const statCards = summary
    ? [
        {
          count: Number(summary.todayCount).toLocaleString(),
          icon: CalendarClock,
          id: "today",
          note: formatDate(getAccraIsoDate(), {
            weekday: true,
          }),
          onOpen: () =>
            showInSchedule(() => changeTab("today")),
          shortTitle: "Today",
          title: "Today's meetings",
        },
        {
          count: Number(summary.thisWeekCount).toLocaleString(),
          icon: CalendarDays,
          id: "week",
          note: "Shown on the calendar",
          noteTone: "brand",
          onOpen: () =>
            showInSchedule(() => {
              setMonth(getAccraIsoDate().slice(0, 7));
              changeViewMode("calendar");
            }),
          shortTitle: "This week",
          title: "This week",
        },
        {
          count: Number(summary.recurringCount).toLocaleString(),
          icon: Repeat,
          id: "recurring",
          note: `${Number(summary.cancelledCount).toLocaleString()} cancelled`,
          onOpen: () =>
            showInSchedule(() => changeTab("upcoming")),
          shortTitle: "Recurring",
          title: "Recurring meetings",
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col gap-4 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Reception
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Meetings
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Plan the meetings visitors can choose
            when they register at reception.
            Cancelled meetings stay on record but are
            hidden from visitors.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            className={OUTLINE_BUTTON}
            disabled={loading}
            onClick={reload}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          {canManage ? (
            <button
              className={FILLED_BUTTON}
              onClick={() => openDialog("edit")}
              type="button"
            >
              <CirclePlus aria-hidden="true" className="size-4" />
              New meeting
            </button>
          ) : null}
        </div>
      </header>

      <SuccessBanner
        message={successMessage}
        onDismiss={() => setSuccessMessage("")}
      />

      {statCards.length ? (
        <section
          aria-label="Meeting statistics"
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

      {!result && loading ? (
        <div className="mt-6">
          <LoadingState message="Loading meetings…" />
        </div>
      ) : null}

      {requestStatus === "error" ? (
        <div className="mt-6">
          <ErrorMessage
            message={requestError}
            onRetry={reload}
            title="Meetings unavailable"
          />
        </div>
      ) : null}

      {result && requestStatus !== "error" ? (
        <section
          aria-busy={loading}
          aria-labelledby="meeting-schedule-heading"
          className="mt-4 scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          id={RECORDS_ID}
        >
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2
                  className="text-xl font-black text-slate-950"
                  id="meeting-schedule-heading"
                >
                  Meeting schedule
                </h2>

                <p
                  aria-live="polite"
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800"
                >
                  {viewMode === "calendar"
                    ? `${result.pagination.totalCount} in ${monthFormatter.format(toDate(`${month}-01`))}`
                    : `${result.pagination.totalCount} ${
                        result.pagination.totalCount === 1
                          ? "meeting"
                          : "meetings"
                      }`}
                </p>
              </div>

              <div
                aria-label="Schedule view"
                className="flex gap-1 rounded-full border border-slate-200 bg-slate-100 p-1"
                role="group"
              >
                <SegmentedButton
                  active={viewMode === "table"}
                  aria-pressed={viewMode === "table"}
                  onClick={() => changeViewMode("table")}
                >
                  <List aria-hidden="true" className="size-4" />
                  Table
                </SegmentedButton>
                <SegmentedButton
                  active={viewMode === "calendar"}
                  aria-pressed={viewMode === "calendar"}
                  onClick={() => changeViewMode("calendar")}
                >
                  <CalendarDays aria-hidden="true" className="size-4" />
                  Calendar
                </SegmentedButton>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SearchPill
                describedBy={
                  searchError
                    ? "meeting-search-error"
                    : undefined
                }
                id="meeting-search"
                label="Search meetings"
                maxLength="80"
                onChange={setSearchDraft}
                placeholder="Meeting, venue or division"
                value={searchDraft}
              />

              <div className="flex flex-wrap gap-2">
                {viewMode === "table" ? (
                  <div
                    aria-label="Meeting list"
                    className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1 sm:gap-1"
                    role="group"
                  >
                    {TABS.map((option) => (
                      <SegmentedButton
                        active={tab === option.value}
                        aria-pressed={tab === option.value}
                        className="max-sm:px-3"
                        key={option.value}
                        onClick={() =>
                          changeTab(option.value)
                        }
                      >
                        {option.label}
                      </SegmentedButton>
                    ))}
                  </div>
                ) : null}

                {receptionist ? (
                  <span className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700">
                    {towerName(sessionTower)}
                  </span>
                ) : (
                  <div
                    aria-label="Tower"
                    className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1 sm:gap-1"
                    role="group"
                  >
                    {TOWER_FILTERS.map((option) => (
                      <SegmentedButton
                        active={towerFilter === option.value}
                        aria-pressed={towerFilter === option.value}
                        className="max-sm:px-3"
                        key={option.value || "all"}
                        onClick={() => {
                          setTowerFilter(option.value);
                          setPage(1);
                          setRequestStatus("loading");
                        }}
                      >
                        {option.label}
                      </SegmentedButton>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {searchError ? (
              <p
                className="text-sm font-semibold text-red-700"
                id="meeting-search-error"
                role="alert"
              >
                {searchError}
              </p>
            ) : null}
          </div>

          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {viewMode === "calendar" ? (
              <MeetingCalendar
                grid={grid}
                meetings={result.meetings}
                month={month}
                onChangeMonth={changeMonth}
                onOpen={(meeting) =>
                  openDialog("details", meeting)
                }
              />
            ) : (
              <MeetingTable
                meetings={result.meetings}
                onAction={openDialog}
                tab={tab}
              />
            )}
          </div>

          {viewMode === "table" ? (
            <ListPagination
              goToPage={goToPage}
              label="Meeting pages"
              noun="meetings"
              nounSingular="meeting"
              pagination={result.pagination}
            />
          ) : null}
        </section>
      ) : null}

      {dialog?.type === "edit" ? (
        <MeetingDialog
          error={dialogError}
          fixedTower={receptionist ? sessionTower : ""}
          key={dialog.meeting?.meetingId || "new"}
          meeting={dialog.meeting}
          onCancel={closeDialog}
          onSave={saveMeeting}
          submitting={submitting}
        />
      ) : null}

      {dialog?.type === "details" ? (
        <MeetingDetailsDialog
          meeting={dialog.meeting}
          onClose={closeDialog}
          onEdit={() => openDialog("edit", dialog.meeting)}
        />
      ) : null}

      {dialog?.type === "cancel" ||
      dialog?.type === "delete" ? (
        <ConfirmMeetingDialog
          error={dialogError}
          meeting={dialog.meeting}
          mode={dialog.type}
          onCancel={closeDialog}
          onConfirm={() =>
            dialog.type === "delete"
              ? removeMeeting(dialog.meeting)
              : changeStatus(dialog.meeting, false)
          }
          submitting={submitting}
        />
      ) : null}

      {dialog?.type === "restore" ? (
        <ConfirmMeetingDialog
          error={dialogError}
          meeting={dialog.meeting}
          mode="restore"
          onCancel={closeDialog}
          onConfirm={() =>
            changeStatus(dialog.meeting, true)
          }
          submitting={submitting}
        />
      ) : null}
    </div>
  );
}

const ROW_ICON_BUTTON =
  "grid size-10 shrink-0 place-items-center rounded-full border bg-white transition focus-visible:ring-4 focus-visible:ring-brand-200";

function MeetingActions({ meeting, onAction }) {
  if (!meeting.canManage) {
    return (
      <span className="text-xs text-slate-500">
        View only
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 lg:justify-center">
      {meeting.active ? (
        <>
          <button
            aria-label={`Edit ${meeting.title}`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-brand-600 bg-white px-4 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200"
            onClick={() => onAction("edit", meeting)}
            type="button"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Edit
          </button>

          <button
            aria-label={`Cancel ${meeting.title}`}
            className={`${ROW_ICON_BUTTON} border-amber-300 text-amber-800 hover:bg-amber-50`}
            onClick={() => onAction("cancel", meeting)}
            title="Cancel meeting"
            type="button"
          >
            <Ban aria-hidden="true" className="size-4" />
          </button>
        </>
      ) : (
        <button
          aria-label={`Restore ${meeting.title}`}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-brand-600 bg-white px-4 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200"
          onClick={() => onAction("restore", meeting)}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Restore
        </button>
      )}

      {meeting.canDelete ? (
        <button
          aria-label={`Delete ${meeting.title}`}
          className={`${ROW_ICON_BUTTON} border-red-200 text-red-700 hover:bg-red-50`}
          onClick={() => onAction("delete", meeting)}
          title="Delete meeting"
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function MeetingStatus({ meeting }) {
  return meeting.active ? (
    <StateChip on>Scheduled</StateChip>
  ) : (
    <StateChip on={false}>Cancelled</StateChip>
  );
}

function MeetingTable({ meetings, onAction, tab }) {
  if (meetings.length === 0) {
    return (
      <div className="px-4 pb-6 sm:px-6">
        <div className="rounded-2xl bg-slate-50 p-6 text-center">
          <CalendarDays
            aria-hidden="true"
            className="mx-auto size-10 text-slate-500"
          />

          <h3 className="mt-4 font-black text-slate-950">
            {
              {
                cancelled: "No cancelled meetings",
                past: "No past meetings",
                today: "No meetings today",
                upcoming: "No upcoming meetings",
              }[tab]
            }
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Visitors attending a meeting that is not
            listed can still type its name when they
            register.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:hidden">
        {meetings.map((meeting) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-4"
            key={meeting.meetingId}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="wrap-break-word font-black text-slate-950">
                  {meeting.title}
                </h3>
                {meeting.hostDivision ? (
                  <p className="mt-0.5 text-sm text-slate-600">
                    {meeting.hostDivision}
                  </p>
                ) : null}
              </div>

              <MeetingStatus meeting={meeting} />
            </div>

            <dl className="mt-3 grid gap-1 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="sr-only">Schedule</dt>
                <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500" />
                <dd>
                  {formatSchedule(meeting)}
                  {formatTimeRange(meeting)
                    ? ` · ${formatTimeRange(meeting)}`
                    : ""}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="sr-only">Place</dt>
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500" />
                <dd>
                  {towerName(meeting.tower)}
                  {meeting.venue ? ` · ${meeting.venue}` : ""}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="sr-only">Visitors</dt>
                <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500" />
                <dd>
                  {meeting.visitorCount}{" "}
                  {meeting.visitorCount === 1
                    ? "visitor registered"
                    : "visitors registered"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <MeetingActions
                meeting={meeting}
                onAction={onAction}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-left">
          <thead className="border-y border-slate-200 bg-slate-50">
            <tr>
              <th className={`${TABLE_HEAD_CELL} pl-6`} scope="col">
                Meeting
              </th>
              <th className={TABLE_HEAD_CELL} scope="col">
                Schedule
              </th>
              <th className={TABLE_HEAD_CELL} scope="col">
                Time
              </th>
              <th className={TABLE_HEAD_CELL} scope="col">
                Place
              </th>
              <th className={`${TABLE_HEAD_CELL} text-center`} scope="col">
                Visitors
              </th>
              <th className={`${TABLE_HEAD_CELL} text-center`} scope="col">
                Status
              </th>
              <th className={`${TABLE_HEAD_CELL} pr-6 text-center`} scope="col">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {meetings.map((meeting) => (
              <tr className="hover:bg-slate-50" key={meeting.meetingId}>
                <td className="py-4 pl-6 pr-3">
                  <p className="font-bold text-slate-950">
                    {meeting.title}
                  </p>
                  {meeting.hostDivision ? (
                    <p className="mt-0.5 text-sm text-slate-600">
                      {meeting.hostDivision}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-4 text-sm text-slate-800">
                  {formatSchedule(meeting)}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-800">
                  {formatTimeRange(meeting) || (
                    <span className="text-slate-500">Not set</span>
                  )}
                </td>
                <td className="px-3 py-4 text-sm">
                  <p className="font-semibold text-slate-900">
                    {towerName(meeting.tower)}
                  </p>
                  {meeting.venue ? (
                    <p className="text-slate-600">{meeting.venue}</p>
                  ) : null}
                </td>
                <td className="px-3 py-4 text-center text-sm font-bold text-slate-900">
                  {meeting.visitorCount}
                </td>
                <td className="px-3 py-4 text-center">
                  <MeetingStatus meeting={meeting} />
                </td>
                <td className="py-4 pl-3 pr-6">
                  <MeetingActions
                    meeting={meeting}
                    onAction={onAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MeetingChip({ meeting, onOpen }) {
  return (
    <button
      aria-label={`${meeting.title}${meeting.startsAt ? ` at ${meeting.startsAt}` : ""}`}
      className="block w-full truncate rounded-lg bg-brand-50 px-2 py-1 text-left text-xs font-semibold text-brand-900 transition hover:bg-brand-100 focus-visible:ring-4 focus-visible:ring-brand-200"
      onClick={() => onOpen(meeting)}
      title={meeting.title}
      type="button"
    >
      {meeting.startsAt ? (
        <span className="font-black">{meeting.startsAt} </span>
      ) : null}
      {meeting.title}
    </button>
  );
}

// Month grid on wider screens; on phones a list of the days that have
// meetings.
function MeetingCalendar({
  grid,
  meetings,
  month,
  onChangeMonth,
  onOpen,
}) {
  const today = getAccraIsoDate();

  const byDay = grid.days.map((day) => ({
    day,
    meetings: meetings
      .filter((meeting) => meetingOccursOn(meeting, day))
      .sort((first, second) =>
        (first.startsAt || "99").localeCompare(
          second.startsAt || "99",
        ),
      ),
  }));

  const agenda = byDay.filter(
    (entry) =>
      entry.meetings.length > 0 &&
      entry.day.slice(0, 7) === month,
  );

  return (
    <div className="px-4 pb-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-slate-950">
          {monthFormatter.format(toDate(`${month}-01`))}
        </h3>

        <div className="flex items-center gap-2">
          <button
            aria-label="Previous month"
            className="grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200"
            onClick={() => onChangeMonth(-1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            className="min-h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200"
            onClick={() => onChangeMonth(0)}
            type="button"
          >
            Today
          </button>
          <button
            aria-label="Next month"
            className="grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200"
            onClick={() => onChangeMonth(1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((day) => (
            <p
              className="px-2 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
              key={day.value}
            >
              <abbr className="no-underline" title={day.long}>
                {day.label}
              </abbr>
            </p>
          ))}
        </div>

        <ol className="grid grid-cols-7">
          {byDay.map(({ day, meetings: dayMeetings }) => {
            const inMonth = day.slice(0, 7) === month;
            const isToday = day === today;

            return (
              <li
                aria-label={`${agendaFormatter.format(toDate(day))}: ${dayMeetings.length} ${dayMeetings.length === 1 ? "meeting" : "meetings"}`}
                className={`min-h-28 border-b border-r border-slate-200 p-1.5 [&:nth-child(7n)]:border-r-0 ${
                  inMonth ? "bg-white" : "bg-slate-50"
                }`}
                key={day}
              >
                <p
                  aria-hidden="true"
                  className={`mb-1 grid size-7 place-items-center rounded-full text-xs font-bold ${
                    isToday
                      ? "bg-brand-800 text-white"
                      : inMonth
                        ? "text-slate-800"
                        : "text-slate-500"
                  }`}
                >
                  {Number(day.slice(8))}
                </p>

                <div className="grid gap-1">
                  {dayMeetings.slice(0, 3).map((meeting) => (
                    <MeetingChip
                      key={meeting.meetingId}
                      meeting={meeting}
                      onOpen={onOpen}
                    />
                  ))}

                  {dayMeetings.length > 3 ? (
                    <p className="px-1 text-xs font-semibold text-slate-600">
                      +{dayMeetings.length - 3} more
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 md:hidden">
        {agenda.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            No meetings this month.
          </p>
        ) : (
          <ol className="grid gap-3">
            {agenda.map(({ day, meetings: dayMeetings }) => (
              <li
                className="rounded-2xl border border-slate-200 p-3"
                key={day}
              >
                <p className={`text-sm font-black ${day === today ? "text-brand-800" : "text-slate-950"}`}>
                  {agendaFormatter.format(toDate(day))}
                  {day === today ? " · Today" : ""}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {dayMeetings.map((meeting) => (
                    <MeetingChip
                      key={meeting.meetingId}
                      meeting={meeting}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function MeetingDetailsDialog({ meeting, onClose, onEdit }) {
  return (
    <AdminDialog
      closeLabel="Close meeting details"
      description={meeting.hostDivision || undefined}
      eyebrow="Meeting"
      onClose={onClose}
      title={meeting.title}
    >
      <DialogBody>
        <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          {[
            ["Schedule", formatSchedule(meeting)],
            ["Time", formatTimeRange(meeting) || "Not set"],
            ["Tower", towerName(meeting.tower)],
            ["Venue", meeting.venue || "Not set"],
            [
              "Visitors registered",
              String(meeting.visitorCount),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-bold text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </DialogBody>

      <DialogFooter>
        <button
          className={DIALOG_CANCEL_BUTTON}
          onClick={onClose}
          type="button"
        >
          Close
        </button>

        {meeting.canManage ? (
          <button
            className={DIALOG_PRIMARY_BUTTON}
            onClick={onEdit}
            type="button"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Edit meeting
          </button>
        ) : null}
      </DialogFooter>
    </AdminDialog>
  );
}

function ConfirmMeetingDialog({
  error,
  meeting,
  mode,
  onCancel,
  onConfirm,
  submitting,
}) {
  const copy = {
    cancel: {
      action: "Cancel meeting",
      body: "Visitors will no longer see this meeting when they register. It stays on record and can be restored later.",
      busy: "Cancelling…",
      title: "Cancel this meeting?",
      tone: "bg-amber-600 text-white hover:bg-amber-700",
    },
    delete: {
      action: "Delete meeting",
      body: "No visitor has registered for this meeting, so it can be removed completely. This cannot be undone.",
      busy: "Deleting…",
      title: "Delete this meeting?",
      tone: "bg-red-700 text-white hover:bg-red-800",
    },
    restore: {
      action: "Restore meeting",
      body: "Visitors will be able to select this meeting again on its scheduled days.",
      busy: "Restoring…",
      title: "Restore this meeting?",
      tone: "bg-brand-800 text-white hover:bg-brand-900",
    },
  }[mode];

  return (
    <AdminDialog
      busy={submitting}
      closeLabel="Close confirmation"
      eyebrow="Meetings"
      onClose={onCancel}
      title={copy.title}
    >
      <DialogBody>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-black text-slate-950">
            {meeting.title}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {formatSchedule(meeting)}
          </p>
        </div>

        <p className="flex items-start gap-3 text-sm leading-6 text-slate-700">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
          {copy.body}
        </p>

        {error ? (
          <ErrorMessage
            message={error}
            title="The meeting was not changed"
          />
        ) : null}
      </DialogBody>

      <DialogFooter>
        <button
          className={DIALOG_CANCEL_BUTTON}
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          Keep meeting
        </button>

        <button
          className={`${DIALOG_BUTTON} ${copy.tone} disabled:bg-slate-200 disabled:text-slate-500`}
          disabled={submitting}
          onClick={onConfirm}
          type="button"
        >
          {submitting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {submitting ? copy.busy : copy.action}
        </button>
      </DialogFooter>
    </AdminDialog>
  );
}

function MeetingDialog({
  error,
  fixedTower,
  meeting,
  onCancel,
  onSave,
  submitting,
}) {
  const creating = !meeting;

  const {
    control,
    formState: { errors, isDirty },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      endsAt: meeting?.endsAt || "",
      endsOn:
        meeting && meeting.scheduleType !== "single"
          ? meeting.endsOn || ""
          : "",
      hostDivision: meeting?.hostDivision || "",
      meetingId: meeting?.meetingId || null,
      meetingTower:
        fixedTower || meeting?.tower || "tower_1",
      recurrenceDays: meeting?.recurrenceDays || [],
      scheduleType: meeting?.scheduleType || "single",
      startsAt: meeting?.startsAt || "",
      startsOn: meeting?.startsOn || getAccraIsoDate(),
      title: meeting?.title || "",
      venue: meeting?.venue || "",
    },
    resolver: zodResolver(meetingFormSchema),
    shouldFocusError: true,
  });

  const [scheduleType, title] = useWatch({
    control,
    name: ["scheduleType", "title"],
  });

  const ready = creating
    ? Boolean(title.trim())
    : isDirty;

  return (
    <AdminDialog
      busy={submitting}
      closeLabel="Close meeting form"
      eyebrow="Meetings"
      onClose={onCancel}
      title={creating ? "New meeting" : "Edit meeting"}
    >
      <form noValidate onSubmit={handleSubmit(onSave)}>
        <DialogBody>
          {error ? (
            <ErrorMessage
              message={error}
              title="The meeting was not saved"
            />
          ) : null}

          <Field
            error={errors.title?.message}
            id="meeting-title"
            label="Meeting title"
            required
          >
            <input
              aria-describedby={errors.title ? "meeting-title-error" : undefined}
              aria-invalid={Boolean(errors.title)}
              autoComplete="off"
              autoFocus
              className={DIALOG_INPUT}
              disabled={submitting}
              id="meeting-title"
              maxLength="160"
              placeholder="e.g. Budget review with partners"
              {...register("title")}
            />
          </Field>

          <Controller
            control={control}
            name="scheduleType"
            render={({ field }) => (
              <SegmentedChoice
                disabled={submitting}
                legend="How often"
                name="meeting-schedule"
                onChange={field.onChange}
                options={SCHEDULE_CHOICES}
                required
                value={field.value}
              />
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={errors.startsOn?.message}
              id="meeting-starts-on"
              label={
                scheduleType === "single"
                  ? "Date"
                  : scheduleType === "weekly"
                    ? "First week"
                    : "First day"
              }
              required
            >
              <input
                aria-describedby={errors.startsOn ? "meeting-starts-on-error" : undefined}
                aria-invalid={Boolean(errors.startsOn)}
                className={DIALOG_INPUT}
                disabled={submitting}
                id="meeting-starts-on"
                type="date"
                {...register("startsOn")}
              />
            </Field>

            {scheduleType !== "single" ? (
              <Field
                error={errors.endsOn?.message}
                id="meeting-ends-on"
                label={
                  scheduleType === "weekly"
                    ? "Last week (optional)"
                    : "Last day"
                }
                required={scheduleType === "continuous"}
              >
                <input
                  aria-describedby={errors.endsOn ? "meeting-ends-on-error" : undefined}
                  aria-invalid={Boolean(errors.endsOn)}
                  className={DIALOG_INPUT}
                  disabled={submitting}
                  id="meeting-ends-on"
                  type="date"
                  {...register("endsOn")}
                />
              </Field>
            ) : null}
          </div>

          {scheduleType === "weekly" ? (
            <Controller
              control={control}
              name="recurrenceDays"
              render={({ field }) => (
                <fieldset className="grid gap-2" disabled={submitting}>
                  <legend className="mb-2 text-sm font-semibold text-slate-800">
                    Meets on
                    <span aria-hidden="true" className="ml-1 text-red-700">
                      *
                    </span>
                  </legend>

                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const checked = field.value.includes(day.value);

                      return (
                        <label
                          className={`relative grid min-h-11 min-w-14 cursor-pointer place-items-center rounded-full border px-3 text-sm transition has-focus-visible:ring-4 has-focus-visible:ring-brand-200 ${
                            checked
                              ? "border-brand-800 bg-brand-800 font-black text-white"
                              : "border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                          }`}
                          key={day.value}
                        >
                          <input
                            aria-label={day.long}
                            checked={checked}
                            className="sr-only min-h-0"
                            onChange={() =>
                              field.onChange(
                                checked
                                  ? field.value.filter((value) => value !== day.value)
                                  : [...field.value, day.value],
                              )
                            }
                            type="checkbox"
                          />
                          <span aria-hidden="true">{day.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {errors.recurrenceDays?.message ? (
                    <p className="text-sm font-semibold text-red-700" role="alert">
                      {errors.recurrenceDays.message}
                    </p>
                  ) : null}
                </fieldset>
              )}
            />
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={errors.startsAt?.message}
              id="meeting-starts-at"
              label="Start time (optional)"
            >
              <input
                aria-describedby={errors.startsAt ? "meeting-starts-at-error" : undefined}
                aria-invalid={Boolean(errors.startsAt)}
                className={DIALOG_INPUT}
                disabled={submitting}
                id="meeting-starts-at"
                type="time"
                {...register("startsAt")}
              />
            </Field>

            <Field
              error={errors.endsAt?.message}
              id="meeting-ends-at"
              label="End time (optional)"
            >
              <input
                aria-describedby={errors.endsAt ? "meeting-ends-at-error" : undefined}
                aria-invalid={Boolean(errors.endsAt)}
                className={DIALOG_INPUT}
                disabled={submitting}
                id="meeting-ends-at"
                type="time"
                {...register("endsAt")}
              />
            </Field>
          </div>

          {fixedTower ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Meeting tower:{" "}
              <span className="font-bold text-slate-950">
                {towerName(fixedTower)}
              </span>
              . Receptionists add meetings for the tower they
              are working in.
            </p>
          ) : (
            <Controller
              control={control}
              name="meetingTower"
              render={({ field }) => (
                <SegmentedChoice
                  disabled={submitting}
                  legend="Tower"
                  name="meeting-tower"
                  onChange={field.onChange}
                  options={TOWER_CHOICES}
                  required
                  value={field.value}
                />
              )}
            />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={errors.venue?.message}
              id="meeting-venue"
              label="Venue or room (optional)"
            >
              <input
                aria-describedby={errors.venue ? "meeting-venue-error" : undefined}
                aria-invalid={Boolean(errors.venue)}
                autoComplete="off"
                className={DIALOG_INPUT}
                disabled={submitting}
                id="meeting-venue"
                maxLength="120"
                placeholder="e.g. Conference Room B"
                {...register("venue")}
              />
            </Field>

            <Field
              error={errors.hostDivision?.message}
              id="meeting-host-division"
              label="Host division (optional)"
            >
              <input
                aria-describedby={errors.hostDivision ? "meeting-host-division-error" : undefined}
                aria-invalid={Boolean(errors.hostDivision)}
                autoComplete="off"
                className={DIALOG_INPUT}
                disabled={submitting}
                id="meeting-host-division"
                maxLength="160"
                placeholder="e.g. Budget Division"
                {...register("hostDivision")}
              />
            </Field>
          </div>
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
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {submitting
              ? "Saving…"
              : creating
                ? "Add meeting"
                : "Save changes"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}
