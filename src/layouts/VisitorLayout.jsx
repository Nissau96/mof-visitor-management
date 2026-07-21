import { Building2 } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

export default function VisitorLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-950">
      <a
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#main-content"
      >
        Skip to main content
      </a>

      <div aria-hidden="true" className="h-1.5 bg-accent" />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4 sm:px-6 lg:px-8">
          <Link
            aria-label="Visitor Management home"
            className="inline-flex min-h-12 items-center gap-3 rounded-xl text-left"
            to="/visit"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-800 text-white shadow-sm">
              <Building2 aria-hidden="true" className="size-6" />
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-800">
                Ministry of Finance
              </span>
              <span className="block text-base font-bold text-slate-950 sm:text-lg">
                Visitor Management
              </span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1" id="main-content" tabIndex="-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-5xl gap-2 px-4 py-6 text-sm text-slate-600 sm:px-6 md:grid-cols-2 md:items-center lg:px-8">
          <p>Visitor information is handled for access and security purposes.</p>
          <p className="md:text-right">Use only on an authorised Ministry device or visitor link.</p>
        </div>
      </footer>
    </div>
  );
}
