import { CalendarDays, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { getAccraIsoDate } from "../lib/accraDate.js";

const ACCRA = "Africa/Accra";

const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ACCRA,
  weekday: "short",
});

const dayDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: ACCRA,
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: ACCRA,
});

const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: ACCRA,
  weekday: "long",
  year: "numeric",
});

function fromIsoDate(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`);
}

function DecorativeRings() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-16 -right-16 size-48 rounded-full border-[14px] border-white/10"
    >
      <span className="absolute inset-6 rounded-full border-[10px] border-white/10" />
    </span>
  );
}

export function WeeklyArrivalsCard({
  days,
  towerLabel,
}) {
  const today = getAccraIsoDate();

  const max = Math.max(
    1,
    ...days.map((day) => day.count || 0),
  );

  const range =
    days.length === 7
      ? `${dayDateFormatter.format(fromIsoDate(days[0].date))} to ${dayDateFormatter.format(fromIsoDate(days[6].date))}`
      : "";

  return (
    <article
      aria-labelledby="weekly-arrivals-heading"
      className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="text-lg font-black text-slate-950"
          id="weekly-arrivals-heading"
        >
          Weekly Arrivals
        </h2>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-brand-800">
            {towerLabel}
          </span>
          {range ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {range}
            </span>
          ) : null}
        </div>
      </div>

      {days.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          Weekly arrivals are unavailable.
        </p>
      ) : (
        // Only today carries a visible count; every bar has its count for
        // screen readers and as a hover title. Bars sit in a fixed-height
        // track so percentage heights also work in Safari.
        <ol className="mt-auto pt-9 grid grid-cols-7 items-end gap-2 sm:gap-3">
          {days.map((day) => {
            const date = fromIsoDate(day.date);
            const isToday = day.date === today;
            const future = day.count === null;
            const empty = day.count === 0;
            const ratio = future ? 0 : (day.count || 0) / max;

            // Darker teal for busier days.
            const fill = ratio >= 0.75
              ? "bg-brand-800"
              : ratio >= 0.4
                ? "bg-brand-600"
                : "bg-[#5eead4] dark:bg-[#2dd4bf]";

            const height = future
              ? 70
              : empty
                ? 22
                : Math.max(18, Math.round(ratio * 100));

            const title = future
              ? `${dayLabelFormatter.format(date)}: upcoming`
              : `${dayLabelFormatter.format(date)}: ${day.count} ${day.count === 1 ? "arrival" : "arrivals"}`;

            return (
              <li
                className="flex flex-col items-center gap-2"
                key={day.date}
              >
                <span className="sr-only">
                  {longDateFormatter.format(date)}:{" "}
                  {future
                    ? "upcoming"
                    : `${day.count} ${day.count === 1 ? "arrival" : "arrivals"}`}
                </span>

                <div
                  aria-hidden="true"
                  className="flex h-32 w-full items-end justify-center"
                >
                  <div
                    className="relative w-full max-w-14"
                    style={{ height: `${height}%` }}
                    title={title}
                  >
                    {isToday ? (
                      <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-800 px-1.5 py-0.5 text-[11px] font-bold text-white">
                        Today {day.count}
                      </span>
                    ) : null}

                    <span
                      className={`block size-full rounded-full ${
                        future
                          ? "border border-dashed border-slate-300 bg-[repeating-linear-gradient(135deg,var(--color-slate-200)_0_5px,transparent_5px_11px)] opacity-80"
                          : empty
                            ? "border-2 border-dashed border-brand-600"
                            : `${fill} ${isToday ? "ring-4 ring-brand-100" : ""}`
                      }`}
                    />
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  className={`text-xs font-semibold ${
                    isToday
                      ? "text-brand-800"
                      : "text-slate-600"
                  }`}
                >
                  {dayLabelFormatter.format(date)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

const accraPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: ACCRA,
  weekday: "short",
});

// Front desk hours: Monday to Friday, 08:00 to 17:00 Accra time.
function isFrontDeskOpen(date) {
  const parts = Object.fromEntries(
    accraPartsFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  const minutes =
    Number(parts.hour) * 60 + Number(parts.minute);

  return (
    !["Sat", "Sun"].includes(parts.weekday) &&
    minutes >= 8 * 60 &&
    minutes < 17 * 60
  );
}

export function ReceptionClockCard() {
  const [now, setNow] = useState(
    () => new Date(),
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(new Date()),
      1000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const open = isFrontDeskOpen(now);

  // Phones and small tablets: one horizontal band. From md up the card
  // stacks vertically beside Weekly Arrivals.
  return (
    <article
      aria-labelledby="reception-clock-heading"
      className="relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-brand-800 p-5 text-white shadow-sm min-[480px]:flex-row min-[480px]:items-center sm:p-6 md:min-h-56 md:flex-col md:items-stretch md:gap-0"
    >
      <DecorativeRings />

      <div className="relative flex items-center gap-4 md:block">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/15 md:hidden">
          <Clock aria-hidden="true" className="size-7" />
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="hidden size-10 place-items-center rounded-xl bg-white/15 md:grid">
              <Clock aria-hidden="true" className="size-5" />
            </span>

            <h2
              className="font-bold md:text-lg md:font-black"
              id="reception-clock-heading"
            >
              Reception Clock
            </h2>
          </div>

          <time
            className="mt-1 block text-3xl font-black tabular-nums tracking-tight sm:text-4xl md:mt-5 md:text-5xl"
            dateTime={now.toISOString()}
          >
            {clockFormatter.format(now)}
          </time>

          <p className="mt-1 text-sm font-medium text-white/90 md:mt-2">
            {longDateFormatter.format(now)}
          </p>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="hidden h-20 w-px shrink-0 bg-white/20 min-[480px]:ml-auto min-[480px]:block md:hidden"
      />

      <p className="relative inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold min-[480px]:self-center md:mt-auto md:self-start">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${
            open ? "bg-[#5eead4]" : "bg-[#cbd5e1]"
          }`}
        />
        {open
          ? "Front desk open"
          : "Front desk closed"}{" "}
        · Accra (GMT)
      </p>
    </article>
  );
}
