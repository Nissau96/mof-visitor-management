import {
  Ban,
  CalendarDays,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  NotebookPen,
  Phone,
  RotateCcw,
  Send,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  VISIT_AGENCY_LABELS,
  getFloorLabel,
  getTowerLabel,
  resolveDestinationFloor,
} from "../constants/visitorOptions.js";

// One Wi-Fi request on the IT network page: a walk-in visitor, or a
// meeting with its guests. A waiting row offers Grant and Not given; a
// granted row shows when its password expires and how it was sent.

const WIFI_STATUS = Object.freeze({
  cancelled: {
    chip: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-[#ef4444]",
    label: "Cancelled by organiser",
  },
  given: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-[#10b981]",
    label: "Access given",
  },
  not_given: {
    chip: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-[#ef4444]",
    label: "Not given",
  },
  waiting: {
    chip: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-[#f59e0b]",
    label: "Waiting",
  },
});

const CHANNEL_WORDS = Object.freeze({
  email: "email",
  print: "printed slip",
  sms: "SMS",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

const decidedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
});

const accraDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" });

const ACTION =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60";

const QUIET_ACTION =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[#0f766e] transition-colors hover:bg-[#f0fdfa] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60 dark:text-[#5eead4]! dark:hover:bg-[#0b2b29]!";

function formatDay(isoDate) {
  return isoDate ? dayFormat.format(new Date(`${isoDate}T00:00:00Z`)) : "";
}

function initialsOf(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function agencyName(agency) {
  return VISIT_AGENCY_LABELS[agency] || agency || "";
}

function hostOf(entry) {
  if (entry.type === "meeting") {
    return entry.hostDivision || agencyName(entry.hostAgency);
  }

  return entry.division || agencyName(entry.agency);
}

function floorOf(entry) {
  const floor =
    entry.type === "meeting"
      ? entry.floor
      : entry.meetingFloor ||
        resolveDestinationFloor(entry.agency, entry.division);

  return getFloorLabel(floor, entry.tower) || "Floor not recorded";
}

function whenOf(entry) {
  const day = formatDay(entry.date);

  if (entry.type === "meeting") {
    return entry.startsAt
      ? `${day}, ${entry.startsAt}${entry.endsAt ? `–${entry.endsAt}` : ""}`
      : day;
  }

  return entry.registeredAt
    ? `${day}, ${timeFormat.format(new Date(entry.registeredAt))}`
    : day;
}

function describeExpiry(expiresAt, now) {
  const date = new Date(expiresAt);
  const today = accraDate.format(date) === accraDate.format(now);

  return `${today ? "Today" : dayFormat.format(new Date(`${accraDate.format(date)}T00:00:00Z`))}, ${timeFormat.format(date)}`;
}

function describeSentBy(sentBy = []) {
  const words = sentBy.map((channel) => CHANNEL_WORDS[channel]).filter(Boolean);

  if (!words.length) {
    return "Not sent yet";
  }

  return `Sent by ${words.length < 2 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`}`;
}

export function WifiStatusChip({ status }) {
  const meta = WIFI_STATUS[status] || WIFI_STATUS.waiting;

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${meta.chip}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function Contact({ email, phone }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {phone ? (
        <a className="inline-flex items-center gap-1.5 text-slate-800 underline-offset-4 hover:text-brand-800 hover:underline" href={`tel:${phone}`}>
          <Phone aria-hidden="true" className="size-4 text-[#0f766e] dark:text-[#5eead4]" />
          <span className="tabular-nums">{phone}</span>
        </a>
      ) : null}
      {email ? (
        <a className="inline-flex min-w-0 items-center gap-1.5 text-slate-800 underline-offset-4 hover:text-brand-800 hover:underline" href={`mailto:${email}`}>
          <Mail aria-hidden="true" className="size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
          <span className="truncate">{email}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1.5 italic text-slate-600">
          <Mail aria-hidden="true" className="size-4 not-italic text-slate-500" />
          No email given
        </span>
      )}
    </div>
  );
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-slate-950">{children}</dd>
    </div>
  );
}

function GuestList({ guests }) {
  if (!guests.length) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        No guests are listed for this meeting yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
      {guests.map((guest, index) => (
        <li className="grid gap-1 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 dark:bg-[#111a2b]!" key={`${guest.phone}-${index}`}>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-bold text-slate-950">
              {guest.fullName}
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {guest.source === "booked" ? "Booked" : "Walk-in"}
              </span>
            </p>
            <p className="text-sm text-slate-600">{guest.organization || "Self"}</p>
          </div>
          <Contact email={guest.email} phone={guest.phone} />
        </li>
      ))}
    </ul>
  );
}

function NoteEditor({ busy, entry, onCancel, onSave }) {
  const id = useId();
  const [note, setNote] = useState(entry.note || "");

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(note);
      }}
    >
      <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
        Note for the IT team
      </label>
      <textarea
        className="min-h-20 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/30"
        disabled={busy}
        id={id}
        maxLength={300}
        onChange={(event) => setNote(event.target.value)}
        placeholder="For example, the voucher number."
        value={note}
      />
      <div className="flex flex-wrap gap-2">
        <button className={`${ACTION} bg-[#115e59] text-[#ffffff] hover:bg-[#134e4a]`} disabled={busy} type="submit">
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          Save note
        </button>
        <button className={`${ACTION} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`} disabled={busy} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

// Expiry panel on a granted row, with the stored password on request.
function GrantPanel({ busy, children, entry, now, onResend, onShowPassword }) {
  const [revealed, setRevealed] = useState("");
  const [loading, setLoading] = useState(false);
  const expired = entry.expiresAt && new Date(entry.expiresAt) <= now;

  // A shown password hides itself again after 30 seconds.
  useEffect(() => {
    if (!revealed) {
      return undefined;
    }

    const timer = window.setTimeout(() => setRevealed(""), 30_000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  if (!entry.expiresAt) {
    return <div className="flex flex-wrap justify-end gap-1">{children}</div>;
  }

  if (expired) {
    return (
      <div className="grid gap-1.5 justify-items-end">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
          <p className="text-sm font-bold text-slate-700">
            Expired {describeExpiry(entry.expiresAt, now).replace(/^Today, /, "at ")}
          </p>
          <p className="text-xs text-slate-600">{describeSentBy(entry.sentBy)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">{children}</div>
      </div>
    );
  }

  async function toggle() {
    if (revealed) {
      setRevealed("");
      return;
    }

    setLoading(true);
    const password = await onShowPassword(entry);
    setLoading(false);

    if (password) {
      setRevealed(password);
    }
  }

  return (
    <div className="grid gap-1.5 justify-items-end">
      <div className="rounded-2xl border border-[#99e2d6] bg-[#f0fdfa] px-4 py-2.5 dark:border-[#14756d] dark:bg-[#0b2b29]!">
        <p className="flex flex-wrap items-baseline justify-end gap-x-2.5">
          <span className="text-xs font-semibold text-[#0f766e] dark:text-[#5eead4]">Expires</span>
          <span className="font-black text-[#115e59] dark:text-[#ccfbf1]">{describeExpiry(entry.expiresAt, now)}</span>
        </p>
        <p className="text-right text-xs text-[#0f766e] dark:text-[#99f6e4]">{describeSentBy(entry.sentBy)}</p>
        {revealed ? (
          <p className="mt-2 flex items-center justify-end gap-2 border-t border-[#99e2d6] pt-2 dark:border-[#14756d]">
            <span className="sr-only">Password: </span>
            <span className="font-mono text-base font-bold tracking-wide text-slate-950">{revealed}</span>
            <button
              aria-label="Copy password"
              className="grid size-9 place-items-center rounded-full text-[#0f766e] hover:bg-[#ccfbf1] dark:text-[#5eead4] dark:hover:bg-[#123b37]"
              onClick={() => void navigator.clipboard?.writeText(revealed)}
              type="button"
            >
              <Copy aria-hidden="true" className="size-4" />
            </button>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-1">
        {entry.hasPassword ? (
          <>
          <button className={QUIET_ACTION} disabled={busy || loading} onClick={() => void toggle()} type="button">
            {loading ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : revealed ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
            {revealed ? "Hide password" : "Show password"}
          </button>
          <button className={QUIET_ACTION} disabled={busy} onClick={() => onResend(entry)} type="button">
            <Send aria-hidden="true" className="size-4" />
            Resend
          </button>
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export default function WifiRequestRow({
  busy,
  entry,
  onDecide,
  onGrant,
  onResend,
  onShowPassword,
}) {
  const panelId = useId();
  const now = useNow();
  const [showGuests, setShowGuests] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [changing, setChanging] = useState(false);

  const meeting = entry.type === "meeting";
  const guests = meeting ? entry.guests || [] : [];
  const waiting = entry.status === "waiting";
  const given = entry.status === "given";
  const notGiven = entry.status === "not_given";
  const cancelled = entry.status === "cancelled";
  const name = meeting ? entry.title : entry.fullName;

  // Note and Change, shown once a request is decided.
  const laterActions = (
    <>
      <button className={QUIET_ACTION} disabled={busy} onClick={() => setEditingNote((open) => !open)} type="button">
        <NotebookPen aria-hidden="true" className="size-4" />
        {entry.note ? "Edit note" : "Add note"}
      </button>
      <button className={QUIET_ACTION} disabled={busy} onClick={() => setChanging(true)} type="button">
        Change
      </button>
    </>
  );

  async function decide(status, note = entry.note || "") {
    const saved = await onDecide(entry, status, status === "waiting" ? "" : note);

    if (saved) {
      setChanging(false);
      setEditingNote(false);
    }
  }

  return (
    <li className={`grid gap-4 px-4 py-5 sm:px-6 ${given ? "bg-[#f6fdfb] dark:bg-[#0c1a24]!" : ""}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <span
            aria-hidden="true"
            className={`grid size-12 shrink-0 place-items-center rounded-full text-sm font-black ${
              notGiven || cancelled
                ? "bg-slate-100 text-slate-700"
                : "bg-[#ccfbf1] text-[#115e59] dark:bg-[#123b37]! dark:text-[#99f6e4]!"
            }`}
          >
            {meeting ? <Wifi className="size-5" /> : initialsOf(name)}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-pretty text-lg font-black leading-snug text-slate-950">{name}</h3>
              <WifiStatusChip status={entry.status} />
            </div>

            <p className="mt-0.5 text-sm text-slate-600">
              {meeting
                ? [
                    `${guests.length} ${guests.length === 1 ? "guest" : "guests"}`,
                    entry.organiserName ? `Booked by ${entry.organiserName}` : "Added by reception",
                    entry.referenceCode,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : entry.organization || "Self"}
            </p>

            {meeting ? null : (
              <div className="mt-1.5">
                <Contact email={entry.email} phone={entry.phone} />
              </div>
            )}
          </div>
        </div>

        {cancelled ? null : (
          <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
            {waiting || changing ? (
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  className={`${ACTION} bg-[#115e59] text-[#ffffff] shadow-md shadow-[#0f766e]/25 hover:bg-[#134e4a]`}
                  disabled={busy}
                  onClick={() => {
                    setChanging(false);
                    onGrant(entry);
                  }}
                  type="button"
                >
                  <Wifi aria-hidden="true" className="size-4" />
                  Grant WiFi access
                </button>
                <button
                  className={`${ACTION} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:bg-[#111a2b]! dark:border-[#263247]! dark:text-[#e2e8f0]!`}
                  disabled={busy || notGiven}
                  onClick={() => void decide("not_given")}
                  type="button"
                >
                  {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <X aria-hidden="true" className="size-4" />}
                  Not given
                </button>
                {changing ? (
                  <>
                    <button className={QUIET_ACTION} disabled={busy} onClick={() => void decide("waiting")} type="button">
                      <RotateCcw aria-hidden="true" className="size-4" />
                      Back to waiting
                    </button>
                    <button className={QUIET_ACTION} disabled={busy} onClick={() => setChanging(false)} type="button">
                      Keep as is
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              given ? (
                <GrantPanel
                  busy={busy}
                  entry={entry}
                  now={now}
                  onResend={onResend}
                  onShowPassword={onShowPassword}
                >
                  {laterActions}
                </GrantPanel>
              ) : (
                <div className="flex flex-wrap gap-1 lg:justify-end">{laterActions}</div>
              )
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 sm:grid-cols-4 lg:ml-16 dark:border-[#263247]! dark:bg-[#0f1726]!">
        <Fact label="When">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-4 text-[#0f766e] dark:text-[#5eead4]" />
            {whenOf(entry)}
          </span>
        </Fact>
        <Fact label="Location">
          {getTowerLabel(entry.tower)} · {floorOf(entry)}
        </Fact>
        <Fact label={meeting ? "Host" : "Visiting"}>{hostOf(entry)}</Fact>
        <Fact label={meeting ? "Venue" : entry.meetingTitle ? "Meeting" : "Person visited"}>
          {meeting
            ? entry.venue || "Not set"
            : entry.meetingTitle || entry.personVisiting || "—"}
        </Fact>
      </dl>

      {cancelled ? (
        <p className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 lg:ml-16">
          <Ban aria-hidden="true" className="mt-1 size-4 shrink-0" />
          The organiser no longer needs WiFi for this meeting. Turn off any
          access already set up for its guests.
        </p>
      ) : null}

      {!waiting && !cancelled && entry.decidedAt ? (
        <p className="text-sm text-slate-600 lg:ml-16">
          {WIFI_STATUS[entry.status]?.label} by{" "}
          <span className="font-semibold text-slate-800">{entry.decidedByName || "IT"}</span>{" "}
          on {decidedFormat.format(new Date(entry.decidedAt))}
          {entry.note ? (
            <>
              {" · "}
              <span className="text-slate-800">“{entry.note}”</span>
            </>
          ) : null}
        </p>
      ) : null}

      {editingNote ? (
        <div className="lg:ml-16">
          <NoteEditor
            busy={busy}
            entry={entry}
            onCancel={() => setEditingNote(false)}
            onSave={(note) => void decide(entry.status, note)}
          />
        </div>
      ) : null}

      {meeting ? (
        <div className="grid gap-3 lg:ml-16">
          <button
            aria-controls={panelId}
            aria-expanded={showGuests}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-1 text-sm font-bold text-[#0f766e] hover:text-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200 dark:text-[#5eead4]!"
            onClick={() => setShowGuests((open) => !open)}
            type="button"
          >
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${showGuests ? "rotate-180" : ""}`} />
            {showGuests ? "Hide guests" : `Show guests (${guests.length})`}
          </button>
          <div hidden={!showGuests} id={panelId}>
            {showGuests ? <GuestList guests={guests} /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
