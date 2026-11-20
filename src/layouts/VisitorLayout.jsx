import { useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import buildingBackground from "../assets/images/building-bg-soft.webp";
import ministryLogo from "../assets/images/mof-logo.webp";
import SiteCredit from "../components/SiteCredit.jsx";
import {
  isKioskDevice,
  KIOSK_PATH,
  useKioskIdleReset,
  visitorHomePath,
} from "../lib/kiosk.js";

export default function VisitorLayout() {
  // The landing, kiosk, first-visit and returning pages carry the logo in
  // their own card; all but the landing page also hold the footer note.
  // A finished check-in also carries the logo in its card (see
  // CheckInSuccess), so it hides both.
  const { pathname } = useLocation();
  const [chromeHidden, setChromeHidden] = useState(false);
  const outletContext = useMemo(() => ({ setChromeHidden }), []);
  const showHeader =
    !chromeHidden &&
    !["/visit", KIOSK_PATH, "/visit/new", "/visit/returning"].includes(pathname);
  const showFooter =
    !chromeHidden &&
    ![KIOSK_PATH, "/visit/new", "/visit/returning"].includes(pathname);

  useKioskIdleReset(isKioskDevice() && pathname !== KIOSK_PATH);

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-[#eef3f2] text-slate-950 dark:bg-[#07110f]">
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
        <img
          alt=""
          className="h-full w-full scale-110 object-cover blur-md"
          decoding="async"
          src={buildingBackground}
        />
        <div className="absolute inset-0 bg-[#f4f7f6]/80 dark:bg-[#06100e]/85" />
      </div>

      <a
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#main-content"
      >
        Skip to main content
      </a>

      {showHeader ? (
        <header className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-6 lg:px-8">
          <Link
            aria-label="Visitor Management home"
            className="inline-flex rounded-xl bg-white/80 px-3 py-2 shadow-sm backdrop-blur dark:bg-[#ffffff]"
            to={visitorHomePath()}
          >
            <img
              alt="Ministry of Finance, Republic of Ghana"
              className="h-10 w-auto sm:h-11"
              decoding="async"
              height="58"
              src={ministryLogo}
              width="144"
            />
          </Link>
        </header>
      ) : null}

      <main className="flex-1" id="main-content" tabIndex="-1">
        <Outlet context={outletContext} />
      </main>

      {/* The credit line shows on every visitor page; the privacy notes
          only where the page does not carry them in its own card. */}
      {chromeHidden ? null : (
        <footer className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6 lg:px-8">
          {showFooter ? (
            <div className="grid gap-2 py-6 text-sm text-slate-700 md:grid-cols-2 md:items-center">
              <p>Visitor information is handled for access and security purposes.</p>
              <p className="md:text-right">Use only on an authorised Ministry device or visitor link.</p>
            </div>
          ) : null}
          <SiteCredit className={showFooter ? "border-t border-slate-300/60 pt-4" : "pt-2"} />
        </footer>
      )}
    </div>
  );
}
