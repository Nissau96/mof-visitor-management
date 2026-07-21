import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-800">404</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-md leading-7 text-slate-600">
          The visitor page you requested does not exist or may have moved.
        </p>
        <Link
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-bold text-white"
          to="/visit"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to visitor check-in
        </Link>
      </section>
    </div>
  );
}
