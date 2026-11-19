import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ban,
  CalendarPlus,
  CircleCheck,
  Clock,
  LoaderCircle,
  RefreshCw,
  Search,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useOutletContext } from "react-router-dom";
import { z } from "zod";
import AdminDialog, {
  DIALOG_CANCEL_BUTTON,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "../components/AdminDialog.jsx";
import ministryLogo from "../assets/images/Asset-8.svg";
import BookingGuestFields from "../components/BookingGuestFields.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import MyBookingCard, { PillPager } from "../components/MyBookingCard.jsx";
import MyBookingsArt from "../components/MyBookingsArt.jsx";
import { getAccraIsoDate } from "../lib/accraDate.js";
import { ApiError } from "../lib/api.js";
import { toDate } from "../lib/meetingSchedule.js";
import {
  BOOKING_TABS,
  countBookingTabs,
  filterBookings,
  groupBookingsByDay,
  summariseBookings,
} from "../lib/myBookings.js";
import {
  cancelMeetingBooking,
  listMyBookings,
  saveBookingGuests,
  setBookingWifi,
} from "../lib/bookingApi.js";
import { toast } from "../lib/toast.js";
import VisitorLinksPanel from "../components/VisitorLinksPanel.jsx";
import { bookerInviteApi } from "../lib/visitorInviteApi.js";
import { WorkEmailSignInRequiredError } from "../lib/workEmailSignIn.js";
import { guestListSchema } from "../validation/meetingBookings.js";

const guestFormSchema = z.object({
  guests: guestListSchema,
});

function isSignInError(error) {
  return (
    error instanceof WorkEmailSignInRequiredError ||
    (error instanceof ApiError && error.status === 401)
  );
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function EditGuestsDialog({ booking, onClose, onSaved, onSignInRequired }) {
  const [saveError, setSaveError] = useState("");

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      guests: booking.guests.map((guest) => ({
        email: guest.email || "",
        fullName: guest.fullName,
        organization: guest.organization || "",
        phone: guest.phone,
      })),
    },
    resolver: zodResolver(guestFormSchema),
  });

  async function save(values) {
    setSaveError("");

    try {
      const updated = await saveBookingGuests({
        bookingId: booking.bookingId,
        guests: values.guests,
      });
      onSaved(updated);
    } catch (error) {
      if (isSignInError(error)) {
        onSignInRequired(error.message);
        return;
      }

      setSaveError(errorMessage(error, "The guest list could not be saved."));
    }
  }

  return (
    <AdminDialog
      busy={isSubmitting}
      description="Guests removed here are taken off reception's list. Anyone who has already arrived stays on it."
      eyebrow={booking.referenceCode}
      icon={UsersRound}
      onClose={onClose}
      title="Edit guests"
    >
      <form noValidate onSubmit={handleSubmit(save)}>
        <DialogBody>
          {saveError ? (
            <ErrorMessage message={saveError} title="Guests not saved" />
          ) : null}
          <BookingGuestFields
            control={control}
            disabled={isSubmitting}
            errors={errors}
            idPrefix="edit-guest"
            register={register}
          />
        </DialogBody>
        <DialogFooter>
          <button className={DIALOG_CANCEL_BUTTON} disabled={isSubmitting} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={DIALOG_PRIMARY_BUTTON} disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {isSubmitting ? "Saving…" : "Save guests"}
          </button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}

function CancelBookingDialog({ booking, onClose, onCancelled, onSignInRequired }) {
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");

  async function confirm() {
    setBusy(true);
    setCancelError("");

    try {
      onCancelled(await cancelMeetingBooking(booking.bookingId));
    } catch (error) {
      if (isSignInError(error)) {
        onSignInRequired(error.message);
        return;
      }

      setCancelError(errorMessage(error, "The booking could not be cancelled."));
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      busy={busy}
      description={
        booking.status === "approved"
          ? "The meeting is removed from reception's schedule and your guests are no longer expected."
          : "Your request is withdrawn before reception answers it."
      }
      eyebrow={booking.referenceCode}
      icon={Ban}
      onClose={onClose}
      tone="danger"
      title={`Cancel “${booking.title}”?`}
    >
      <DialogBody>
        {cancelError ? (
          <ErrorMessage message={cancelError} title="Booking not cancelled" />
        ) : (
          <p className="text-sm leading-6 text-slate-700">
            This cannot be undone. To meet later, make a new booking.
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <button className={DIALOG_CANCEL_BUTTON} disabled={busy} onClick={onClose} type="button">
          Keep booking
        </button>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-red-700 px-6 text-sm font-black text-white transition hover:bg-red-800 focus-visible:ring-4 focus-visible:ring-red-200 disabled:opacity-60"
          disabled={busy}
          onClick={confirm}
          type="button"
        >
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {busy ? "Cancelling…" : "Cancel booking"}
        </button>
      </DialogFooter>
    </AdminDialog>
  );
}

const BOOKINGS_PER_PAGE = 5;

const nextDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
});

function formatNext(isoDate) {
  return isoDate ? `Next: ${nextDate.format(toDate(isoDate)).replace(",", "")}` : "None coming up";
}

function StatCard({ hint, icon: Icon, label, value }) {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-brand-100 bg-white px-4 py-4 sm:px-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-3xl font-black leading-tight text-brand-800">{value}</p>
        <p className="text-sm text-slate-600">{hint}</p>
      </div>
    </div>
  );
}

function TabButton({ active, count, label, onClick }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-full px-4 sm:justify-start text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200 ${active ? "bg-white text-brand-800 shadow-sm ring-1 ring-slate-200" : "text-slate-700 hover:bg-white/70 hover:text-slate-950"}`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span
        className={`grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-black leading-6 ${active ? "bg-brand-800 text-white" : "bg-slate-200 text-slate-700"}`}
      >
        {count}
      </span>
    </button>
  );
}

export default function MyBookingsPage() {
  const { requireSignIn } = useOutletContext();
  const searchId = useId();
  const [bookings, setBookings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [tab, setTab] = useState("upcoming");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // Cards the booker opened or closed; the first card starts open.
  const [toggled, setToggled] = useState({});
  const [wifiSaving, setWifiSaving] = useState("");

  const today = getAccraIsoDate();

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      const data = await listMyBookings();
      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
      setStatus("ready");
    } catch (error) {
      if (isSignInError(error)) {
        requireSignIn(error.message);
        return;
      }

      setLoadError(errorMessage(error, "Your bookings could not be loaded."));
      setStatus("error");
    }
  }, [requireSignIn]);

  useEffect(() => {
    // Loading starts after mount; state is set once the request ends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const summary = useMemo(() => summariseBookings(bookings, today), [bookings, today]);
  const tabCounts = useMemo(() => countBookingTabs(bookings, today), [bookings, today]);
  const visible = useMemo(
    () => filterBookings(bookings, { query, tab, today }),
    [bookings, query, tab, today],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / BOOKINGS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageBookings = visible.slice(
    (currentPage - 1) * BOOKINGS_PER_PAGE,
    currentPage * BOOKINGS_PER_PAGE,
  );
  // Past and closed bookings are one list, newest first.
  const groups =
    tab === "past"
      ? [{ bookings: pageBookings, key: "past", label: "Past & closed" }]
      : groupBookingsByDay(pageBookings, today);
  const firstId = pageBookings[0]?.bookingId;

  function isExpanded(bookingId) {
    return bookingId in toggled ? toggled[bookingId] : bookingId === firstId;
  }

  function changeView(update) {
    update();
    setPage(1);
  }

  function replaceBooking(updated) {
    setBookings((current) =>
      current.map((booking) =>
        booking.bookingId === updated.bookingId ? updated : booking,
      ),
    );
    setDialog(null);
  }

  async function changeWifi(booking, wifiAccess) {
    setWifiSaving(booking.bookingId);

    try {
      replaceBooking(
        await setBookingWifi({ bookingId: booking.bookingId, wifiAccess }),
      );
      toast.success(
        wifiAccess === "yes" ? "Wi-Fi requested" : "Wi-Fi request withdrawn",
        wifiAccess === "yes"
          ? "The IT team will send the Wi-Fi details to your guests."
          : "The IT team has been told your guests no longer need Wi-Fi.",
      );
    } catch (error) {
      if (isSignInError(error)) {
        requireSignIn(error.message);
        return;
      }

      toast.error(
        "Wi-Fi not changed",
        errorMessage(error, "The Wi-Fi request could not be changed."),
      );
    } finally {
      setWifiSaving("");
    }
  }

  const showList = status !== "error" && bookings.length > 0;

  return (
    <div className="mx-auto mt-5 w-full max-w-6xl">
      <header className="relative overflow-hidden rounded-3xl border border-brand-100 bg-brand-50 px-5 py-6 sm:px-8 sm:py-7">
        <div className="relative z-10 max-w-xl">
          <img
            alt="Ministry of Finance, Republic of Ghana"
            className="h-12 w-auto rounded-md dark:bg-[#ffffff] dark:p-1 sm:h-14"
            decoding="async"
            height="141"
            src={ministryLogo}
            width="349"
          />
          <h1 className="mt-4 text-3xl font-black tracking-tight text-brand-950 sm:text-4xl">
            My bookings
          </h1>
          <p className="mt-2 max-w-lg text-pretty leading-7 text-slate-700">
            Track each request, see who is expected, and change guests until
            the meeting&apos;s first day.
          </p>
        </div>
        <MyBookingsArt
          className="pointer-events-none absolute right-6 top-5 hidden h-44 w-auto lg:block xl:right-12"
          day={toDate(today).getUTCDate()}
        />

        <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-3">
          <StatCard
            hint={formatNext(summary.waiting.next)}
            icon={Clock}
            label="Waiting for approval"
            value={summary.waiting.count}
          />
          <StatCard
            hint={formatNext(summary.approved.next)}
            icon={CircleCheck}
            label="Approved, upcoming"
            value={summary.approved.count}
          />
          <StatCard
            hint="Across upcoming bookings"
            icon={UsersRound}
            label="Guests expected"
            value={summary.guestsExpected}
          />
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-slate-200/70 bg-white p-2.5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)] lg:flex-row lg:items-center">
        <div
          aria-label="Show bookings"
          className="grid grid-cols-2 gap-1 rounded-3xl bg-slate-100 p-1 sm:flex sm:rounded-full"
          role="group"
        >
          {BOOKING_TABS.map((item) => (
            <TabButton
              active={tab === item.value}
              count={tabCounts[item.value] || 0}
              key={item.value}
              label={item.label}
              onClick={() => changeView(() => setTab(item.value))}
            />
          ))}
        </div>

        <div className="flex flex-1 gap-2">
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor={searchId}>
              Search bookings
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              className="min-h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-base text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 sm:text-sm"
              id={searchId}
              onChange={(event) => changeView(() => setQuery(event.target.value))}
              placeholder="Search meeting, reference or guest"
              type="search"
              value={query}
            />
          </div>
          <button
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
            disabled={status === "loading"}
            onClick={load}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={`size-4 text-brand-700 ${status === "loading" ? "animate-spin" : ""}`} />
            <span className="max-sm:sr-only">Refresh</span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {status === "loading" && bookings.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <LoadingState message="Loading your bookings…" />
          </div>
        ) : null}

        {status === "error" ? (
          <ErrorMessage message={loadError} onRetry={load} title="Bookings not loaded" />
        ) : null}

        {status === "ready" && bookings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white p-8 text-center shadow-sm">
            <p className="font-bold text-slate-950">You have no bookings yet.</p>
            <Link
              className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-800 px-6 text-sm font-bold text-white transition hover:bg-brand-900 focus-visible:ring-4 focus-visible:ring-brand-200"
              to="/book"
            >
              <CalendarPlus aria-hidden="true" className="size-4" />
              Book a meeting
            </Link>
          </div>
        ) : null}

        {showList && visible.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center">
            <p className="font-bold text-slate-950">
              {query.trim() ? `No bookings match “${query.trim()}”.` : "No bookings here."}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Try another tab{query.trim() ? " or clear the search" : ""}.
            </p>
          </div>
        ) : null}

        {showList
          ? groups.map((group) => (
              <section aria-label={group.label} className="grid gap-3" key={group.key}>
                <p className="flex items-center gap-2 px-1 pt-1 text-xs font-bold text-slate-700">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-slate-200/70">
                    {group.label}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200/70">
                    {group.bookings.length}
                  </span>
                </p>
                {group.bookings.map((booking) => (
                  <MyBookingCard
                    booking={booking}
                    expanded={isExpanded(booking.bookingId)}
                    key={booking.bookingId}
                    onCancel={(target) => setDialog({ booking: target, type: "cancel" })}
                    onChangeWifi={changeWifi}
                    wifiSaving={wifiSaving === booking.bookingId}
                    onEditGuests={(target) => setDialog({ booking: target, type: "guests" })}
                    onToggle={() =>
                      setToggled((current) => ({
                        ...current,
                        [booking.bookingId]: !isExpanded(booking.bookingId),
                      }))
                    }
                    today={today}
                  />
                ))}
              </section>
            ))
          : null}

        {showList && visible.length > 0 ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white px-4 py-3 sm:px-5">
            <PillPager
              label="Booking pages"
              noun="bookings"
              nounSingular="booking"
              onPage={setPage}
              page={currentPage}
              pageSize={BOOKINGS_PER_PAGE}
              total={visible.length}
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white p-5 sm:p-6">
        <VisitorLinksPanel api={bookerInviteApi} onSignInRequired={requireSignIn} />
      </div>

      {dialog?.type === "guests" ? (
        <EditGuestsDialog
          booking={dialog.booking}
          onClose={() => setDialog(null)}
          onSaved={(updated) => {
            replaceBooking(updated);
            toast.success("Guest list saved.");
          }}
          onSignInRequired={requireSignIn}
        />
      ) : null}

      {dialog?.type === "cancel" ? (
        <CancelBookingDialog
          booking={dialog.booking}
          onCancelled={(updated) => {
            replaceBooking(updated);
            toast.success("Booking cancelled.");
          }}
          onClose={() => setDialog(null)}
          onSignInRequired={requireSignIn}
        />
      ) : null}
    </div>
  );
}
