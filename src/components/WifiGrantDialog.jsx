import {
  CalendarDays,
  Check,
  ClipboardPaste,
  Clock3,
  KeyRound,
  LoaderCircle,
  Mail,
  Printer,
  Send,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import WifiGrantArt from "./WifiGrantArt.jsx";

// Grant (or re-send) guest Wi-Fi. IT creates the password in the Wi-Fi
// system and pastes it here, picks how long it lasts and how to send
// it. A meeting gets one password for all its guests.

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Accra",
  weekday: "short",
});

const accraDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" });

// Accra is UTC+0 all year, so a wall-clock time there is the same in UTC.
function atAccra(isoDate, time) {
  return new Date(`${isoDate}T${time}:00Z`);
}

function expiryFor(duration, entry, now) {
  switch (duration) {
    case "2h":
      return new Date(now.getTime() + 2 * 3_600_000);
    case "4h":
      return new Date(now.getTime() + 4 * 3_600_000);
    case "meeting_end":
      return atAccra(entry.date, entry.endsAt || "23:59");
    default:
      return atAccra(entry.date, "23:59");
  }
}

function describeExpiry(date, now) {
  const today = accraDate.format(now) === accraDate.format(date);

  return today
    ? `today at ${timeFormat.format(date)}`
    : `on ${dayFormat.format(date)} at ${timeFormat.format(date)}`;
}

function recipientsOf(entry) {
  return entry.type === "meeting"
    ? entry.guests || []
    : [{ email: entry.email, fullName: entry.fullName, phone: entry.phone }];
}

function joinWords(words) {
  return words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function HeaderChip({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 sm:px-3 ${className}`}>
      {children}
    </span>
  );
}

function ChannelCard({ checked, description, disabled, icon: Icon, label, onChange }) {
  return (
    <label
      className={`relative flex min-h-24 flex-col gap-2 rounded-2xl border p-3.5 transition-colors has-focus-visible:ring-4 has-focus-visible:ring-brand-200 ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
          : checked
            ? "cursor-pointer border-[#0f766e] bg-[#f0fdfa] dark:border-[#2dd4bf]! dark:bg-[#0b2b29]!"
            : "cursor-pointer border-slate-200 bg-white hover:border-[#99e2d6] dark:bg-[#111a2b]! dark:border-[#263247]!"
      }`}
    >
      <input
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="flex items-start justify-between">
        <span className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-[#263247]! dark:bg-[#0b1220]! dark:text-[#e2e8f0]!">
          <Icon aria-hidden="true" className="size-4.5" />
        </span>
        <span
          aria-hidden="true"
          className={`grid size-6 place-items-center rounded-md border-2 ${
            checked
              ? "border-[#0f766e] bg-[#0f766e] text-[#ffffff] dark:border-[#2dd4bf] dark:bg-[#0f766e]"
              : "border-slate-300 bg-white dark:bg-[#0b1220]!"
          }`}
        >
          {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
      </span>
      <span>
        <span className="block text-sm font-black text-slate-950">{label}</span>
        <span className="block truncate text-xs text-slate-600">{description}</span>
      </span>
    </label>
  );
}

export default function WifiGrantDialog({
  busy,
  entry,
  error,
  mode = "grant",
  onCancel,
  onSubmit,
  settings,
}) {
  const ids = useId();
  const resend = mode === "resend";
  const meeting = entry.type === "meeting";
  const recipients = recipientsOf(entry);
  const withPhone = recipients.filter((person) => person.phone).length;
  const withEmail = recipients.filter((person) => person.email).length;
  const [now] = useState(() => new Date());
  const todayIso = accraDate.format(now);
  const forToday = entry.date === todayIso;

  const durations = [
    ...(forToday
      ? [
          { label: "2 hours", value: "2h" },
          { label: "4 hours", value: "4h" },
        ]
      : []),
    { label: "End of day", value: "end_of_day" },
    ...(meeting && entry.endsAt ? [{ label: "Meeting ends", value: "meeting_end" }] : []),
  ];

  const smsDisabled = !settings?.smsAvailable || withPhone === 0;
  const emailDisabled = !settings?.emailAvailable || withEmail === 0;

  const [password, setPassword] = useState("");
  const [duration, setDuration] = useState(meeting && entry.endsAt ? "meeting_end" : "end_of_day");
  const [channels, setChannels] = useState(() => ({
    email: !emailDisabled,
    print: smsDisabled && emailDisabled,
    sms: !smsDisabled,
  }));
  const [fieldError, setFieldError] = useState("");

  const chosen = Object.keys(channels).filter((key) => channels[key]);
  const expiry = expiryFor(duration, entry, now);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  function submit(event) {
    event.preventDefault();

    if (!resend && password.trim().length < 4) {
      setFieldError("Paste the password from the WiFi system.");
      document.getElementById(`${ids}-password`)?.focus();
      return;
    }

    if (chosen.length === 0) {
      setFieldError("Choose at least one way to send the details.");
      return;
    }

    setFieldError("");
    onSubmit({ channels: chosen, duration, password: password.trim() });
  }

  async function pastePassword() {
    try {
      const text = await navigator.clipboard.readText();
      setPassword(text.trim().slice(0, 64));
      setFieldError("");
    } catch {
      document.getElementById(`${ids}-password`)?.focus();
    }
  }

  const sendWords = [
    channels.sms ? (meeting ? `${withPhone} by SMS` : entry.phone) : null,
    channels.email ? (meeting ? `${withEmail} by email` : entry.email) : null,
  ].filter(Boolean);

  const summary = [
    sendWords.length ? `Sends to ${joinWords(sendWords)}` : "",
    channels.print ? `${sendWords.length ? "and prints" : "Prints"} a slip` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const name = meeting ? entry.title : entry.fullName;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <form
        aria-describedby={`${ids}-description`}
        aria-labelledby={`${ids}-title`}
        aria-modal="true"
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl shadow-slate-950/30 sm:max-w-150 sm:rounded-4xl"
        noValidate
        onSubmit={submit}
        role="dialog"
      >
        <div className="relative isolate shrink-0 overflow-hidden bg-linear-to-br from-[#e6f8f4] via-[#f2fbf9] to-white px-5 pb-5 pt-5 dark:from-[#0d2a27] dark:via-[#0d1d27] dark:to-[#0b1220] sm:px-7 sm:pt-6">
          <span aria-hidden="true">
            {["size-80", "size-60", "size-40"].map((size) => (
              <span className={`pointer-events-none absolute -right-20 -top-24 -z-10 rounded-full border border-[#0f766e]/10 dark:border-[#5eead4]/10 ${size}`} key={size} />
            ))}
          </span>

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center overflow-hidden rounded-full text-[0.6875rem] font-bold ring-1 ring-[#0f766e]/25 dark:ring-[#5eead4]/25 sm:text-xs">
              <HeaderChip className="bg-white text-[#0f5f58] dark:bg-[#0b1220]! dark:text-[#99f6e4]!">
                <span aria-hidden="true" className="size-2 rounded-full bg-[#f59e0b]" />
                {resend ? "Access given" : "WiFi request"}
              </HeaderChip>
              <HeaderChip className="bg-[#115e59] text-[#ffffff]">
                <CalendarDays aria-hidden="true" className="size-3.5 text-[#fcd34d]" />
                {dayFormat.format(atAccra(entry.date, entry.startsAt || "12:00"))}
                {entry.registeredAt ? `, ${timeFormat.format(new Date(entry.registeredAt))}` : entry.startsAt ? `, ${entry.startsAt}` : ""}
              </HeaderChip>
            </div>

            <button aria-label="Close dialog" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:opacity-50 dark:bg-[#111a2b]! dark:text-[#e2e8f0]! dark:ring-[#1f2a3d]!" disabled={busy} onClick={onCancel} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-balance text-[1.375rem] font-black leading-tight tracking-tight text-slate-950 sm:text-2xl" id={`${ids}-title`}>
                {resend ? "Send WiFi details again" : "Grant WiFi access"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600" id={`${ids}-description`}>
                {meeting ? "One password for every guest of " : "Credentials for "}
                <span className="font-bold text-slate-950">{name}</span>
                {!meeting && entry.organization ? ` · ${entry.organization}` : ""}
              </p>
            </div>
            <WifiGrantArt className="-mb-1 hidden h-24 w-34 shrink-0 sm:block" />
          </div>
        </div>

        <div className="scroll-pane min-h-0 flex-1 space-y-5 px-5 pb-5 pt-4 sm:px-7">
          {resend ? null : (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-linear-to-br from-white to-[#f6fdfb] p-4 dark:border-[#263247]! dark:from-[#111a2b] dark:to-[#0d1d27]">
              <div className="grid gap-1.5">
                <p className="text-sm font-bold text-slate-950">Network name</p>
                <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 dark:border-[#263247]! dark:bg-[#0b1220]!">
                  <Wifi aria-hidden="true" className="size-4.5 text-[#0f766e] dark:text-[#5eead4]" />
                  <span className="flex-1 font-bold text-slate-950">{settings?.networkNames?.[entry.tower] || "MoF-Guest"}</span>
                  <span className="rounded-full border border-[#99e2d6] bg-[#f0fdfa] px-2.5 py-0.5 text-xs font-bold text-[#0f766e] dark:border-[#14756d] dark:bg-[#0b2b29]! dark:text-[#5eead4]!">
                    Guest network
                  </span>
                </div>
              </div>

              <div className="grid gap-1.5">
                <label className="text-sm font-bold text-slate-950" htmlFor={`${ids}-password`}>
                  Password <span className="font-normal text-slate-600">From the WiFi system</span>
                </label>
                <div className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 focus-within:border-[#0d9488] focus-within:ring-4 focus-within:ring-[#0d9488]/30 dark:border-[#263247]! dark:bg-[#0b1220]!">
                  <KeyRound aria-hidden="true" className="size-4.5 shrink-0 text-slate-500" />
                  <input
                    aria-describedby={`${ids}-password-help${fieldError ? ` ${ids}-error` : ""}`}
                    aria-invalid={Boolean(fieldError && password.trim().length < 4)}
                    autoComplete="off"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-lg font-bold tracking-wide text-slate-950 shadow-none outline-none focus:ring-0"
                    disabled={busy}
                    id={`${ids}-password`}
                    maxLength={64}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Paste the password"
                    spellCheck="false"
                    value={password}
                  />
                  {clipboardAvailable ? (
                    <button className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#99e2d6] bg-[#f0fdfa] px-3 text-sm font-bold text-[#0f766e] transition-colors hover:bg-[#ccfbf1] dark:border-[#14756d] dark:bg-[#0b2b29]! dark:text-[#5eead4]!" aria-label="Paste password" disabled={busy} onClick={() => void pastePassword()} type="button">
                      <ClipboardPaste aria-hidden="true" className="size-4" />
                      <span aria-hidden="true" className="hidden sm:inline">Paste</span>
                    </button>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-slate-600" id={`${ids}-password-help`}>
                  Create the password in the WiFi system first, then paste it here.
                </p>
              </div>
            </div>
          )}

          {resend ? null : (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-bold text-slate-950">Access lasts</legend>
              <div className="flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 sm:w-fit">
                {durations.map((option) => (
                  <label
                    className={`relative flex min-h-10 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-4 text-sm transition-colors has-focus-visible:ring-4 has-focus-visible:ring-brand-200 sm:flex-none ${
                      duration === option.value
                        ? "bg-[#ffffff] font-bold text-[#0f766e] shadow-sm dark:bg-[#24344c] dark:text-[#5eead4]"
                        : "font-semibold text-slate-600 hover:text-slate-900"
                    }`}
                    key={option.value}
                  >
                    <input
                      checked={duration === option.value}
                      className="sr-only"
                      disabled={busy}
                      name={`${ids}-duration`}
                      onChange={() => setDuration(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
                <span>
                  Password stops working {describeExpiry(expiry, now)}. Use the
                  same duration you set in the WiFi system.
                </span>
              </p>
            </fieldset>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-bold text-slate-950">
              Send credentials by <span className="font-normal text-slate-600">Pick at least one</span>
            </legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <ChannelCard
                checked={channels.sms}
                description={
                  !settings?.smsAvailable
                    ? "SMS not set up"
                    : withPhone === 0
                      ? "No mobile number"
                      : meeting
                        ? `${withPhone} ${withPhone === 1 ? "guest" : "guests"}`
                        : entry.phone
                }
                disabled={busy || smsDisabled}
                icon={Smartphone}
                label="SMS"
                onChange={(value) => setChannels((current) => ({ ...current, sms: value }))}
              />
              <ChannelCard
                checked={channels.email}
                description={
                  !settings?.emailAvailable
                    ? "Email not set up"
                    : withEmail === 0
                      ? "No email given"
                      : meeting
                        ? `${withEmail} ${withEmail === 1 ? "guest" : "guests"}`
                        : entry.email
                }
                disabled={busy || emailDisabled}
                icon={Mail}
                label="Email"
                onChange={(value) => setChannels((current) => ({ ...current, email: value }))}
              />
              <ChannelCard
                checked={channels.print}
                description="This computer's printer"
                disabled={busy}
                icon={Printer}
                label="Print slip"
                onChange={(value) => setChannels((current) => ({ ...current, print: value }))}
              />
            </div>
          </fieldset>

          {fieldError || error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" id={`${ids}-error`} role="alert">
              {fieldError || error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs leading-5 text-slate-600 sm:max-w-[26ch]">
            {summary ? `${summary}.` : "Choose how to send the details."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:bg-[#111a2b]! dark:border-[#263247]! dark:text-[#e2e8f0]!" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-6 text-sm font-bold text-[#ffffff] shadow-lg shadow-[#0f766e]/25 transition-colors hover:from-[#0f766e] hover:to-[#134e4a] disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none" disabled={busy} type="submit">
              {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
              {busy ? "Saving…" : resend ? "Send again" : "Grant access"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

