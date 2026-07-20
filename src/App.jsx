import { ArrowRight, Building2, ShieldCheck } from "lucide-react";

export default function App() {
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-lg items-center justify-center">
        <section className="w-full overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="h-2 bg-brand-800" />

          <div className="p-6 sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-800">
              <Building2 aria-hidden="true" size={30} />
            </div>

            <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-brand-700">
              Welcome
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Visitor check-in
            </h1>

            <p className="mt-4 text-base leading-7 text-slate-600">
              Register your visit or securely retrieve your existing visitor
              profile.
            </p>

            <div className="mt-8 grid gap-4">
              <button
                className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand-800 px-5 font-bold text-white transition hover:bg-brand-900"
                type="button"
              >
                <span>This is my first visit</span>
                <ArrowRight aria-hidden="true" size={21} />
              </button>

              <button
                className="flex min-h-14 w-full items-center justify-between rounded-2xl border-2 border-brand-800 bg-white px-5 font-bold text-brand-900 transition hover:bg-brand-50"
                type="button"
              >
                <span>I have visited before</span>
                <ArrowRight aria-hidden="true" size={21} />
              </button>
            </div>

            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-brand-700"
                size={20}
              />

              <p>
                Your information will be used only for authorised visitor
                management and security operations.
              </p>
            </div>
          </div>

          <div className="h-1.5 bg-accent" />
        </section>
      </div>
    </main>
  );
}