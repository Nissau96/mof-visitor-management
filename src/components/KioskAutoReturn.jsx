import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  isKioskDevice,
  KIOSK_PATH,
  KIOSK_SUCCESS_SECONDS,
} from "../lib/kiosk.js";

// On a reception kiosk, a finished check-in clears itself for the next
// visitor. Elsewhere it renders nothing.
export default function KioskAutoReturn({ className = "" }) {
  const navigate = useNavigate();
  const [kiosk] = useState(isKioskDevice);
  const [secondsLeft, setSecondsLeft] = useState(
    KIOSK_SUCCESS_SECONDS,
  );

  useEffect(() => {
    if (!kiosk) {
      return undefined;
    }

    const interval = window.setInterval(
      () => setSecondsLeft((seconds) => Math.max(seconds - 1, 0)),
      1000,
    );
    const timer = window.setTimeout(
      () => navigate(KIOSK_PATH, { replace: true }),
      KIOSK_SUCCESS_SECONDS * 1000,
    );

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [kiosk, navigate]);

  if (!kiosk) {
    return null;
  }

  return (
    <div className={className}>
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Timer aria-hidden="true" className="size-4" />
        This screen clears for the next visitor in{" "}
        {secondsLeft} seconds.
      </p>

      {/* Time left, shrinking each second. */}
      <div
        aria-hidden="true"
        className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-[#0f766e] transition-[width] duration-1000 ease-linear motion-reduce:transition-none dark:bg-[#5eead4]"
          style={{
            width: `${(secondsLeft / KIOSK_SUCCESS_SECONDS) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
