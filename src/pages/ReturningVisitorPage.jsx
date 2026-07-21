import { Search, ShieldCheck } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";

export default function ReturningVisitorPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        backTo="/visit"
        description="Find your masked visitor record, verify your registered mobile number and provide today’s visit details."
        eyebrow="Returning visitor"
        title="Find your visitor record"
      />

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-800">
            <Search aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Secure lookup</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Search will require at least three characters from your name. Results will be masked and will not display full contact information.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-800" />
          <p>
            Selecting a result will not reveal the visitor profile until the registered mobile number has been verified.
          </p>
        </div>
      </section>
    </div>
  );
}
