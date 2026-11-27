import { ArrowLeft, Check, UsersRound } from "lucide-react";
import { useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import ministryLogo from "../assets/images/mof-logo.webp";
import { visitorHomePath } from "../lib/kiosk.js";
import KioskAutoReturn from "./KioskAutoReturn.jsx";
import VisitorPassIllustration from "./VisitorPassIllustration.jsx";

// The finished check-in for first and returning visits: one centred card
// over the layout's building background. The card carries the logo, so
// the layout's header and footer are hidden while it shows.
export default function CheckInSuccess({
  description,
  guestCount = 0,
  reference,
  title,
}) {
  const setChromeHidden = useOutletContext()?.setChromeHidden;
  const guestLabel = guestCount === 1 ? "1 guest" : `${guestCount} guests`;

  useEffect(() => {
    setChromeHidden?.(true);

    return () => setChromeHidden?.(false);
  }, [setChromeHidden]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <section
        className="flex w-full max-w-[37.5rem] flex-col items-center rounded-[2rem] border border-[#ffffff]/80 bg-white/95 px-5 py-8 text-center shadow-2xl shadow-slate-900/10 backdrop-blur sm:px-12 sm:py-10 dark:border-[#1f2d40]"
        role="status"
      >
        <img
          alt="Ministry of Finance, Republic of Ghana"
          className="h-14 w-auto sm:h-16 dark:rounded-xl dark:bg-[#ffffff] dark:p-1.5"
          decoding="async"
          height="66"
          src={ministryLogo}
          width="166"
        />
        <span
          aria-hidden="true"
          className="mt-4 h-1 w-12 rounded-full bg-[#ccf3ec] dark:bg-[#14756d]"
        />

        <VisitorPassIllustration className="mt-5 w-36 sm:w-40" />

        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#99e2d6] bg-[#f0fdfa] px-4 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#0f766e] dark:border-[#14756d] dark:bg-[#0b2b29] dark:text-[#5eead4]">
          <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
          Check-in complete
        </p>

        <h1 className="mt-4 text-3xl font-black tracking-tight text-[#134e4a] sm:text-4xl dark:text-[#ffffff]">
          {title}
        </h1>

        <p className="mt-3 max-w-md text-base leading-7 text-slate-600">
          {description}
        </p>

        <div className="mt-6 w-full max-w-md rounded-3xl border-2 border-dashed border-[#5eead4] bg-[#f0fdfa] px-4 py-5 dark:border-[#14756d] dark:bg-[#0b2b29]">
          <p
            aria-hidden="true"
            className="text-xs font-black uppercase tracking-[0.18em] text-slate-600"
          >
            Reference number
          </p>
          <p
            aria-label={`Visit reference ${reference}`}
            className="mt-1 break-all font-mono text-3xl font-black tracking-[0.14em] text-[#134e4a] sm:text-4xl dark:text-[#ccfbf1]"
          >
            {reference}
          </p>

          {guestCount > 0 ? (
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#0f766e] dark:text-[#5eead4]">
              <UsersRound aria-hidden="true" className="size-4" />
              For you and {guestLabel}
            </p>
          ) : null}
        </div>

        <Link
          className="mt-7 inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-8 text-base font-bold text-[#ffffff] shadow-xl shadow-[#0f766e]/30 transition hover:from-[#0f766e] hover:to-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200"
          to={visitorHomePath()}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to visitor home
        </Link>

        <KioskAutoReturn className="mt-6 w-full max-w-md" />
      </section>
    </div>
  );
}
