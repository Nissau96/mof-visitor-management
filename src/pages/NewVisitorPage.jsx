import { ClipboardList, ShieldCheck } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";

export default function NewVisitorPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        backTo="/visit"
        description="You will provide your contact details and information about today’s visit."
        eyebrow="First visit"
        title="Register as a visitor"
      />

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-800">
            <ClipboardList aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Before you begin</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Have your mobile number and the name of the person or office you are visiting ready.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-800" />
          <p>
            The registration form will include a privacy notice and will request only the information required for visitor management.
          </p>
        </div>
      </section>
    </div>
  );
}
