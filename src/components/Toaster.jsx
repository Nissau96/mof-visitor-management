import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  dismissToast,
  getToasts,
  subscribe,
  TOAST_MS,
} from "../lib/toast.js";

// Renders toasts raised with toast.success() and friends. Explicit hex
// colours keep the cards identical in light and dark mode.

const TONES = {
  error: {
    card: "border-[#fda4af] bg-[#fff1f2]",
    halo: "bg-[#fecdd3]",
    icon: CircleAlert,
    solid: "bg-[#e11d48]",
  },
  info: {
    card: "border-[#93c5fd] bg-[#eaf2fe]",
    halo: "bg-[#bfdbfe]",
    icon: Info,
    solid: "bg-[#2563eb]",
  },
  success: {
    card: "border-[#86efac] bg-[#effdf4]",
    halo: "bg-[#bbf7d0]",
    icon: CircleCheck,
    solid: "bg-[#16a34a]",
  },
  warning: {
    card: "border-[#fcd34d] bg-[#fffbeb]",
    halo: "bg-[#fde68a]",
    icon: TriangleAlert,
    solid: "bg-[#f59e0b]",
  },
};

export default function Toaster() {
  const items = useSyncExternalStore(subscribe, getToasts, getToasts);

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col items-stretch gap-3 sm:left-auto sm:right-6 sm:top-6 sm:w-[26rem]"
      role="region"
    >
      {items.map((item) => (
        <ToastCard item={item} key={item.id} />
      ))}
    </div>
  );
}

function ToastCard({ item }) {
  const tone = TONES[item.tone] ?? TONES.info;
  const Icon = tone.icon;
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  // Hovering or focusing a toast holds it open.
  useEffect(() => {
    if (paused) {
      return undefined;
    }

    const startedAt = Date.now();
    const timer = window.setTimeout(
      () => dismissToast(item.id),
      remaining.current,
    );

    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [item.id, paused]);

  return (
    <div
      className={`pointer-events-auto flex animate-[toast-in_200ms_ease-out] items-center gap-4 rounded-2xl border px-4 py-4 shadow-xl shadow-[#0f172a1f] motion-reduce:animate-none ${tone.card}`}
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role={item.tone === "error" ? "alert" : "status"}
    >
      <span
        aria-hidden="true"
        className={`grid size-12 shrink-0 place-items-center rounded-full ${tone.halo}`}
      >
        <span
          className={`grid size-8 place-items-center rounded-full text-[#ffffff] ${tone.solid}`}
        >
          <Icon className="size-5" strokeWidth={2.5} />
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-bold text-[#0f172a]">{item.title}</p>
        {item.message ? (
          <p className="mt-0.5 text-sm leading-6 text-[#334155]">
            {item.message}
          </p>
        ) : null}
      </div>

      <button
        aria-label={`Dismiss ${item.title}`}
        className="grid size-9 shrink-0 place-items-center rounded-full text-[#0f172a] transition hover:bg-[#0f172a14] focus-visible:outline-2 focus-visible:outline-[#0f172a]"
        onClick={() => dismissToast(item.id)}
        type="button"
      >
        <X aria-hidden="true" className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
