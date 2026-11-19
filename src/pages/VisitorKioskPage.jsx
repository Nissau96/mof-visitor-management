import {
  ArrowUpRight,
  Camera,
  CircleHelp,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  LogVisitIllustration,
  QrScanIllustration,
} from "../components/KioskIllustrations.jsx";
import ReceptionPoster from "../components/ReceptionPoster.jsx";
import VisitorHero from "../components/VisitorHero.jsx";
import { ApiError, apiRequest } from "../lib/api.js";
import { markKioskDevice } from "../lib/kiosk.js";
import { createQrDataUrl } from "../lib/weeklyQr.js";
import useCountdown, { formatCountdown } from "../hooks/useCountdown.js";

// The QR poster closes itself so the kiosk is ready for the next visitor.
const QR_DISPLAY_SECONDS = 60;

const CARD =
  "card-float relative isolate flex flex-col items-center overflow-hidden rounded-3xl px-6 pb-8 pt-10 text-center sm:px-8 sm:pb-10";

// The pill is the card's only control; its ::after covers the card so
// the whole card is one large touch target.
const CARD_ACTION =
  "relative mt-6 inline-flex min-h-12 items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-base font-bold transition after:absolute after:-inset-[100vmax] after:content-[''] focus-visible:outline-3 focus-visible:outline-offset-4";

export default function VisitorKioskPage() {
  const [qrOpen, setQrOpen] = useState(false);
  const showQrRef = useRef(null);
  const qrWasOpen = useRef(false);

  useEffect(() => {
    markKioskDevice();
  }, []);

  // Focus returns once the page is no longer inert.
  useEffect(() => {
    if (qrWasOpen.current && !qrOpen) {
      showQrRef.current?.focus();
    }

    qrWasOpen.current = qrOpen;
  }, [qrOpen]);

  const closeQr = useCallback(() => setQrOpen(false), []);

  return (
    <>
      <div
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
        inert={qrOpen}
      >
        <VisitorHero>
          <p className="mt-4 max-w-md text-base font-semibold leading-7 text-slate-950 sm:text-lg md:mt-3 md:text-base lg:mt-4 lg:text-lg">
            Welcome to the{" "}
            <span className="text-[#0f766e] dark:text-[#5eead4]">
              Ministry of Finance
            </span>
            , Ghana.
          </p>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            Please check in to continue.
          </p>
        </VisitorHero>

        <section
          aria-labelledby="kiosk-options-heading"
          className="mt-10 sm:mt-12"
        >
          <h2
            className="text-center text-3xl font-black tracking-tight text-[#134e4a] sm:text-4xl dark:text-[#ffffff]"
            id="kiosk-options-heading"
          >
            How would you like to check in?
          </h2>

          <div className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-6">
            <div
              className={`${CARD} bg-linear-to-b from-[#0e8077] to-[#115e59] text-[#ffffff] shadow-xl shadow-[#0f766e]/25`}
            >
              {/* Concentric rings in the bottom-right corner. */}
              <span aria-hidden="true">
                {["size-64", "size-44", "size-28"].map((size) => (
                  <span
                    className={`pointer-events-none absolute -bottom-6 -right-6 -z-10 translate-x-1/4 translate-y-1/4 rounded-full border border-[#ffffff]/20 ${size}`}
                    key={size}
                  />
                ))}
              </span>

              <span className="absolute right-4 top-4 rounded-full bg-[#ffffff] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0f766e]">
                Fastest
              </span>

              <QrScanIllustration className="w-56 sm:w-64" />

              <h3 className="mt-4 text-2xl font-black tracking-tight">
                Scan QR code
              </h3>
              <p className="mt-2 max-w-xs text-base leading-7 text-[#f0fdfa]">
                Point your phone camera at the code and fill in your
                details on your own phone.
              </p>

              <button
                className={`${CARD_ACTION} bg-[#ffffff] text-[#0f766e] hover:bg-[#f0fdfa] focus-visible:outline-[#ffffff]`}
                onClick={() => setQrOpen(true)}
                ref={showQrRef}
                type="button"
              >
                Show QR code
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full bg-[#0f766e] text-[#ffffff]"
                >
                  <ArrowUpRight className="size-4" />
                </span>
              </button>
            </div>

            <div
              className={`${CARD} border border-slate-200 bg-white text-slate-950 shadow-sm hover:border-[#99d8cf]`}
            >
              <LogVisitIllustration className="w-56 sm:w-64" />

              <h3 className="mt-4 text-2xl font-black tracking-tight">
                Log visit
              </h3>
              <p className="mt-2 max-w-xs text-base leading-7 text-slate-600">
                No phone? Fill in your details here on this Ministry
                device.
              </p>

              <Link
                className={`${CARD_ACTION} border border-[#0f766e] bg-white text-[#0f766e] hover:bg-[#f0fdfa] focus-visible:outline-[#0f766e] dark:border-[#5eead4] dark:text-[#5eead4] dark:hover:bg-[#0b2b29]`}
                to="/visit"
              >
                Check in
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]"
                >
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-6 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-slate-600">or</p>
          <p className="inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-6 font-bold text-[#134e4a] shadow-sm dark:text-[#ccfbf1]">
            <CircleHelp aria-hidden="true" className="size-5" />
            Need help? Ask reception
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-700 backdrop-blur">
            <Shield aria-hidden="true" className="size-4 shrink-0" />
            Visitor information is handled for access and security purposes.
          </p>
        </div>
      </div>

      {qrOpen ? <KioskQrDialog onClose={closeQr} /> : null}
    </>
  );
}

function KioskQrDialog({ onClose }) {
  const titleId = useId();
  const doneRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [qr, setQr] = useState({ status: "loading" });
  const secondsLeft = useCountdown(QR_DISPLAY_SECONDS, onClose);

  // Done is a new button once the poster replaces the loading card.
  useEffect(() => {
    doneRef.current?.focus();
  }, [qr.status]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadQr() {
      try {
        const result = await apiRequest("/api/register?kiosk=1", {
          method: "GET",
          signal: controller.signal,
        });
        const access = result?.access;

        if (typeof access?.accessUrl !== "string") {
          throw new Error("The QR code could not be loaded.");
        }

        // The poster's white tile adds the rest of the quiet zone.
        const qrDataUrl = await createQrDataUrl(access.accessUrl, {
          margin: 2,
        });

        if (!controller.signal.aborted) {
          setQr({
            qrDataUrl,
            status: "ready",
            weeklyQr: {
              weekEndsOn: access.weekEndsOn,
              weekStartsOn: access.weekStartsOn,
            },
          });
        }
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") {
          return;
        }

        setQr({
          expired: error instanceof ApiError && error.status === 401,
          status: "error",
        });
      }
    }

    void loadQr();

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setQr({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-labelledby={titleId}
          aria-modal="true"
          className="w-full max-w-[32rem]"
          role="dialog"
        >
          {qr.status === "ready" ? (
            <ReceptionPoster
              compact
              headingLevel="h2"
              qrDataUrl={qr.qrDataUrl}
              titleId={titleId}
              weeklyQr={qr.weeklyQr}
            >
              <KioskQrFooter
                doneRef={doneRef}
                onClose={onClose}
                secondsLeft={secondsLeft}
              />
            </ReceptionPoster>
          ) : (
            <div className="overflow-hidden rounded-3xl bg-[#ffffff] shadow-2xl">
              <div className="px-6 py-10 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto grid size-16 place-items-center rounded-full bg-[#e6f7f4] text-[#0f766e]"
                >
                  {qr.status === "loading" ? (
                    <LoaderCircle className="size-8 animate-spin" />
                  ) : (
                    <QrCode className="size-8" />
                  )}
                </span>

                <h2
                  className="mt-5 text-2xl font-black text-[#0f172a]"
                  id={titleId}
                >
                  {qr.status === "loading"
                    ? "Loading the QR code…"
                    : "QR code unavailable"}
                </h2>

                {qr.status === "error" ? (
                  <>
                    <p className="mt-3 leading-7 text-[#475569]" role="alert">
                      {qr.expired
                        ? "This kiosk is no longer set up. Ask reception to set it up again from Set up kiosk in the staff menu."
                        : "The QR code could not be loaded. Check the connection and try again, or ask reception."}
                    </p>

                    {qr.expired ? null : (
                      <button
                        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#cbd5e1] bg-[#ffffff] px-5 font-bold text-[#1e293b] hover:bg-[#f8fafc] focus-visible:ring-4 focus-visible:ring-brand-200"
                        onClick={retry}
                        type="button"
                      >
                        <RefreshCw aria-hidden="true" className="size-4" />
                        Try again
                      </button>
                    )}
                  </>
                ) : null}
              </div>

              <KioskQrFooter
                doneRef={doneRef}
                onClose={onClose}
                secondsLeft={secondsLeft}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// The white bar along the bottom of the QR card. Explicit colours keep it
// the same in light and dark mode, like the poster above it.
function KioskQrFooter({ doneRef, onClose, secondsLeft }) {
  return (
    <div className="relative flex items-center gap-3 bg-[#ffffff] px-4 py-3 text-left">
      {/* Time left before the screen closes, shrinking each second. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-[#e2e8f0]"
      >
        <div
          className="h-full bg-[#0f766e] transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{
            width: `${(secondsLeft / QR_DISPLAY_SECONDS) * 100}%`,
          }}
        />
      </div>

      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f7f4] text-[#0f766e]"
      >
        <Camera className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#0f172a]">
          Open your phone camera
        </p>
        <p className="text-xs text-[#475569]" role="timer">
          This screen closes in{" "}
          <span className="font-bold tabular-nums text-[#0f766e]">
            {formatCountdown(secondsLeft)}
          </span>
        </p>
      </div>

      <button
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#0f766e] px-6 text-sm font-bold text-[#ffffff] transition hover:bg-[#115e59] focus-visible:ring-4 focus-visible:ring-brand-200"
        onClick={onClose}
        ref={doneRef}
        type="button"
      >
        Done
      </button>
    </div>
  );
}
