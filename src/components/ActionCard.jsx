import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function ActionCard({ description, icon: Icon, title, to }) {
  return (
    <Link
      className="group flex min-h-44 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-lg focus-visible:ring-offset-4 sm:p-6"
      to={to}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-800">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <span className="mt-5 text-lg font-bold text-slate-950">{title}</span>
      <span className="mt-2 flex-1 text-sm leading-6 text-slate-600">
        {description}
      </span>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-800">
        Continue
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-1"
        />
      </span>
    </Link>
  );
}
