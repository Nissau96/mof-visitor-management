import {
  Bell,
  CheckCheck,
  Clock,
  CreditCard,
  Star,
  TriangleAlert,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { getTowerLabel } from "../constants/visitorOptions.js";


const timeFormatter = new Intl.DateTimeFormat(
  "en-GH",
  {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  },
);

function formatTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : timeFormatter.format(date);
}

function readSeenAt(storageKey) {
  try {
    return (
      window.localStorage.getItem(storageKey) ||
      ""
    );
  } catch {
    return "";
  }
}

function writeSeenAt(storageKey, value) {
  try {
    window.localStorage.setItem(
      storageKey,
      value,
    );
  } catch {
    // Read state is a per-browser convenience only.
  }
}

function describe(notification) {
  const where = [
    notification.reference,
    notification.tower
      ? getTowerLabel(notification.tower)
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  switch (notification.kind) {
    case "pending_admission":
      return {
        detail: `${where} · Registered ${formatTime(notification.occurredAt)}`,
        href: "/staff?view=pending",
        icon: Clock,
        title: `${notification.visitorName} is waiting for admission`,
        tone: "bg-blue-50 text-blue-700",
      };
    case "vip_arrival":
      return {
        detail: `${where} · Checked in ${formatTime(notification.occurredAt)}`,
        href: "/staff?view=checked-in",
        icon: Star,
        title: `VIP arrival: ${notification.visitorName}`,
        tone: "bg-violet-50 text-violet-700",
      };
    case "overstay":
      return {
        detail: `${where} · Checked in ${formatTime(notification.occurredAt)}`,
        href: "/staff/history",
        icon: TriangleAlert,
        title: `${notification.visitorName} has not been checked out`,
        tone: "bg-amber-50 text-amber-800",
      };
    case "card_problem": {
      const plural =
        notification.count === 1
          ? "card"
          : "cards";

      return {
        detail: `Last updated ${formatTime(notification.occurredAt)}`,
        href: "/staff/admin/cards",
        icon: CreditCard,
        title:
          notification.status ===
          "investigating"
            ? `${notification.count} ${plural} under investigation`
            : `${notification.count} ${plural} not returned`,
        tone: "bg-red-50 text-red-700",
      };
    }
    default:
      return null;
  }
}

// The list comes from useStaffNotifications in the staff layout, which
// also feeds the side-menu badges; onReload fetches it again.
export default function NotificationBell({
  loadError,
  notifications,
  onReload,
  userId,
}) {
  const storageKey =
    `mof-notifications-seen:${userId}`;

  const [
    seenAt,
    setSeenAt,
  ] = useState(() =>
    readSeenAt(storageKey),
  );

  // Items newer than this stay highlighted while the panel is open.
  const [
    highlightAfter,
    setHighlightAfter,
  ] = useState("");

  const [
    open,
    setOpen,
  ] = useState(false);

  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointer(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target,
        )
      ) {
        setOpen(false);
      }
    }

    function handleKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointer,
    );
    document.addEventListener(
      "keydown",
      handleKey,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointer,
      );
      document.removeEventListener(
        "keydown",
        handleKey,
      );
    };
  }, [open]);

  const unread = notifications.filter(
    (notification) =>
      notification.sortAt > seenAt,
  );

  function markAllRead(items) {
    const newest = items
      .map((item) => item.sortAt)
      .sort()
      .at(-1);

    if (newest && newest > seenAt) {
      setSeenAt(newest);
      writeSeenAt(storageKey, newest);
    }
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setHighlightAfter(seenAt);
    setOpen(true);
    markAllRead(notifications);

    void onReload().then((items) => {
      if (items) {
        markAllRead(items);
      }
    });
  }

  const badge =
    unread.length > 9
      ? "9+"
      : String(unread.length);

  return (
    <div
      className="relative"
      ref={containerRef}
    >
      <button
        aria-controls="staff-notifications"
        aria-expanded={open}
        aria-label={
          unread.length
            ? `Notifications, ${unread.length} unread`
            : "Notifications"
        }
        className="relative grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={toggle}
        type="button"
      >
        <Bell
          aria-hidden="true"
          className="size-5"
        />

        {unread.length ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-700 px-1 text-[11px] font-black text-white ring-2 ring-white dark:ring-slate-50"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-labelledby="staff-notifications-heading"
          className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
          id="staff-notifications"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2
              className="font-black text-slate-950"
              id="staff-notifications-heading"
            >
              Notifications
            </h2>

            <button
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-brand-800 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                !notifications.some(
                  (item) =>
                    item.sortAt >
                    highlightAfter,
                )
              }
              onClick={() => {
                markAllRead(notifications);
                setHighlightAfter(
                  notifications
                    .map((item) => item.sortAt)
                    .sort()
                    .at(-1) || "",
                );
              }}
              type="button"
            >
              <CheckCheck
                aria-hidden="true"
                className="size-4"
              />
              Mark all as read
            </button>
          </div>

          {loadError &&
          notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-600">
              Notifications could not be loaded.
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-600">
              You&rsquo;re all caught up.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] divide-y divide-slate-100 overflow-y-auto">
              {notifications.map(
                (notification) => {
                  const view =
                    describe(
                      notification,
                    );

                  if (!view) {
                    return null;
                  }

                  const Icon =
                    view.icon;

                  const fresh =
                    notification.sortAt >
                    highlightAfter;

                  return (
                    <li
                      key={
                        notification.id
                      }
                    >
                      <Link
                        className={`flex gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                          fresh
                            ? "bg-brand-50"
                            : ""
                        }`}
                        onClick={() =>
                          setOpen(false)
                        }
                        to={view.href}
                      >
                        <span
                          aria-hidden="true"
                          className={`grid size-9 shrink-0 place-items-center rounded-xl ${view.tone}`}
                        >
                          <Icon className="size-4" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-950">
                            {view.title}
                            {fresh ? (
                              <span className="sr-only">
                                {" "}
                                (new)
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-600">
                            {view.detail}
                          </span>
                        </span>

                        {fresh ? (
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-red-700"
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                },
              )}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
