import { useEffect, useEffectEvent, useState } from "react";

// Seconds left until a deadline set when the component mounts, ticking
// once a second. It counts against the clock, not ticks, so a phone that
// sleeps still shows the right time when it wakes. onExpire runs once
// when the time is up.
export default function useCountdown(totalSeconds, onExpire) {
  const [deadline] = useState(() => Date.now() + totalSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const expire = useEffectEvent(() => onExpire?.());

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = Date.now();

      setNow(current);

      if (current >= deadline) {
        window.clearInterval(interval);
        expire();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [deadline]);

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

// 125 -> "2:05"
export function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);

  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
