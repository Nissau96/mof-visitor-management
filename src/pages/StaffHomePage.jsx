import {
  BadgeCheck,
  Construction,
  ShieldCheck,
} from "lucide-react";
import useAuth from "../hooks/useAuth.js";

export default function StaffHomePage() {
  const { profile } = useAuth();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
          Staff dashboard
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Welcome, {profile.fullName}
        </h1>

        <p className="mt-4 max-w-2xl leading-7 text-slate-600">
          Your staff identity has been authenticated and
          authorised.
        </p>
      </header>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
          <BadgeCheck
            aria-hidden="true"
            className="size-9 text-emerald-700"
          />

          <h2 className="mt-5 text-xl font-black text-slate-950">
            Staff access verified
          </h2>

          <dl className="mt-5 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm font-semibold text-slate-600">
                Staff name
              </dt>
              <dd className="mt-1 font-bold text-slate-950">
                {profile.fullName}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm font-semibold text-slate-600">
                Authorised role
              </dt>
              <dd className="mt-1 font-bold capitalize text-slate-950">
                {profile.role}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <Construction
            aria-hidden="true"
            className="size-9 text-brand-800"
          />

          <h2 className="mt-5 text-xl font-black text-slate-950">
            Reception dashboard is next
          </h2>

          <p className="mt-3 leading-7 text-slate-600">
            Stage 9 will add the paginated active-visitor
            dashboard. No visitor records are displayed by
            this authentication-only stage.
          </p>

          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm leading-6 text-brand-950">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-brand-800"
            />
            <p>
              Access remains controlled by the active staff
              profile and its assigned role.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}