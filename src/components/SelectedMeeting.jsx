import { CalendarCheck, Clock3, MapPin } from "lucide-react";
import { formatTimeRange } from "../lib/meetingSchedule.js";

// The chosen meeting in full under the meeting dropdown. The dropdown
// shortens a long title to one line, so the visitor can still read the
// whole title, time and venue before checking in.
export default function SelectedMeeting({ meeting }) {
  if (!meeting) {
    return null;
  }

  const time = formatTimeRange(meeting);

  return (
    <div
      aria-live="polite"
      className="flex min-w-0 items-start gap-3 rounded-xl border border-[#99e2d6] bg-white p-4 dark:border-[#14756d]"
    >
      <span
        aria-hidden="true"
        className="hidden size-10 shrink-0 place-items-center rounded-xl bg-[#ccfbf1] min-[420px]:grid text-[#0f766e] dark:bg-[#134e4a] dark:text-[#5eead4]"
      >
        <CalendarCheck className="size-5" />
      </span>

      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          Your meeting
        </p>

        <p className="mt-1 wrap-break-word text-base font-bold leading-6 text-slate-950">
          {meeting.title}
        </p>

        {time || meeting.venue ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
            {time ? (
              <li className="inline-flex items-center gap-1.5">
                <Clock3
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]"
                />
                <span className="tabular-nums">{time}</span>
              </li>
            ) : null}

            {meeting.venue ? (
              <li className="inline-flex min-w-0 items-start gap-1.5">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]"
                />
                <span className="wrap-break-word">{meeting.venue}</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
