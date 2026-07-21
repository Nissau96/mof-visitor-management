import { Clock3, Search, ShieldCheck, UserRoundPlus } from "lucide-react";
import ActionCard from "../components/ActionCard.jsx";
import PageHeader from "../components/PageHeader.jsx";

export default function VisitorLandingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
      <section className="overflow-hidden rounded-[2rem] bg-brand-900 px-5 py-8 text-white shadow-xl sm:px-10 sm:py-12 lg:px-14">
        <PageHeader
          description="Register your visit or securely find your existing visitor record. The process is designed for recent mobile phones, tablets and desktop browsers."
          eyebrow="Welcome"
          title="Visitor check-in"
          tone="inverse"
        />

        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-brand-50">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5" />
            Privacy-aware
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 aria-hidden="true" className="size-5" />
            Quick mobile check-in
          </span>
        </div>
      </section>

      <section aria-labelledby="visit-options-heading" className="mt-8 sm:mt-10">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-950" id="visit-options-heading">
            Choose an option
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Select the option that matches your visitor history.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          <ActionCard
            description="Create your visitor profile and provide the details for today’s visit."
            icon={UserRoundPlus}
            title="This is my first visit"
            to="/visit/new"
          />
          <ActionCard
            description="Search for your masked visitor record, verify your mobile number and check in again."
            icon={Search}
            title="I have visited before"
            to="/visit/returning"
          />
        </div>
      </section>

      <aside className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:p-5">
        <p className="font-bold">Need assistance?</p>
        <p className="mt-1">
          Please speak with reception. Do not enter another person’s details.
        </p>
      </aside>
    </div>
  );
}
