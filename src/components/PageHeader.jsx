import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PageHeader({
  backTo,
  description,
  eyebrow,
  title,
  tone = "default",
}) {
  const inverse = tone === "inverse";

  return (
    <header>
      {backTo ? (
        <Link
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-brand-800 hover:bg-brand-50"
          to={backTo}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Link>
      ) : null}

      {eyebrow ? (
        <p
          className={`text-sm font-bold uppercase tracking-[0.16em] ${inverse ? "text-brand-100" : "text-brand-800"}`}
        >
          {eyebrow}
        </p>
      ) : null}

      <h1
        className={`mt-2 text-3xl font-black tracking-tight sm:text-4xl ${inverse ? "text-white" : "text-slate-950"}`}
      >
        {title}
      </h1>

      {description ? (
        <p
          className={`mt-4 max-w-2xl text-base leading-7 sm:text-lg ${inverse ? "text-brand-50" : "text-slate-600"}`}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
}
