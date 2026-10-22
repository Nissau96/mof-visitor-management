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
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2"
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
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
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
        <ol className="mt-6 grid h-56 grid-cols-7 items-end gap-2 sm:gap-4">
          {days.map((day) => {
            const date = fromIsoDate(day.date);
            const isToday = day.date === today;
            const future = day.count === null;
            const height = future
              ? 100
              : Math.max(
                  6,
                  Math.round(
                    ((day.count || 0) / max) * 100,
                  ),
                );

            return (
              <li
                className="flex h-full flex-col items-center justify-end gap-2"
                key={day.date}
              >
                <span className="sr-only">
                  {longDateFormatter.format(date)}:{" "}
                  {future
                    ? "upcoming"
                    : `${day.count} ${day.count === 1 ? "arrival" : "arrivals"}`}
                </span>

                {isToday ? (
                  <span
                    aria-hidden="true"
                    className="whitespace-nowrap rounded-md bg-brand-800 px-1.5 py-0.5 text-[11px] font-bold text-white"
                  >
                    Today {day.count}
                  </span>
                ) : !future ? (
                  <span
                    aria-hidden="true"
                    className="text-xs font-bold text-slate-700"
                  >
                    {day.count}
                  </span>
                ) : null}

                <span
                  aria-hidden="true"
                  className={`w-full max-w-16 rounded-full ${
                    future
                      ? "border border-dashed border-slate-300 bg-[repeating-linear-gradient(135deg,var(--color-slate-200)_0_5px,transparent_5px_11px)] opacity-80"
                      : isToday
                        ? "bg-brand-600 ring-4 ring-brand-100"
                        : "bg-brand-700"
                  }`}
                  style={{
                    height: `${future ? 70 : height}%`,
                  }}
                />

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

export function CardAssignmentCard({
  assignment,
}) {
  const assigned = assignment?.assigned ?? 0;
  const notAssigned =
    assignment?.notAssigned ?? 0;
  const total = assigned + notAssigned;
  const percent = total
    ? Math.round((assigned / total) * 100)
    : 0;

  return (
    <article
      aria-labelledby="card-assignment-heading"
      className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2
        className="text-lg font-black text-slate-950"
        id="card-assignment-heading"
      >
        Card Assignment
      </h2>

      <div className="relative mx-auto mt-4 w-full max-w-56">
        <svg
          aria-hidden="true"
          className="w-full"
          viewBox="0 0 200 110"
        >
          <path
            className="stroke-slate-200"
            d="M 18 100 A 82 82 0 0 1 182 100"
            fill="none"
            strokeLinecap="round"
            strokeWidth="18"
          />
          {percent > 0 ? (
            <path
              className="stroke-brand-600"
              d="M 18 100 A 82 82 0 0 1 182 100"
              fill="none"
              pathLength="100"
              strokeDasharray={`${percent} 100`}
              strokeLinecap="round"
              strokeWidth="18"
            />
          ) : null}
        </svg>

        <p className="absolute inset-x-0 bottom-0 text-center">
          <span className="block text-3xl font-black text-slate-950">
            {assignment ? `${percent}%` : "—"}
          </span>
          <span className="block text-xs font-semibold text-slate-600">
            Cards assigned
          </span>
        </p>
      </div>

      <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-700">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-brand-600"
          />
          Assigned {assigned}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-slate-300"
          />
          Not assigned {notAssigned}
        </li>
      </ul>
    </article>
  );
}

export function ReceptionClockCard({
  towerLabel,
}) {
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

  return (
    <article
      aria-labelledby="reception-clock-heading"
      className="relative overflow-hidden rounded-3xl bg-brand-800 p-5 text-white shadow-sm sm:p-6"
    >
      <DecorativeRings />

      <h2
        className="text-lg font-black"
        id="reception-clock-heading"
      >
        Reception Clock
      </h2>

      <time
        className="mt-3 block text-4xl font-black tabular-nums tracking-tight sm:text-5xl"
        dateTime={now.toISOString()}
      >
        {clockFormatter.format(now)}
      </time>

      <p className="mt-2 text-sm font-medium text-white/90">
        {longDateFormatter.format(now)}
      </p>

      <p className="mt-6 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
        {towerLabel} · Accra time (GMT)
      </p>
    </article>
  );
}
