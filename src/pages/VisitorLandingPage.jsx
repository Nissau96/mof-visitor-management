import {
  ArrowUpRight,
  CircleHelp,
  Clock3,
  Search,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import ministryLogo from "../assets/images/mof-logo.webp";
import receptionIllustration from "../assets/images/reception-desk.webp";

const STEPS = [
  {
    description: "Name, phone and who you’re visiting.",
    title: "Enter your details",
  },
  {
    description: "Reception uses it to confirm your visit.",
    title: "Show your reference number",
  },
  {
    description: "Return it to reception when you leave.",
    title: "Collect your visitor card",
  },
];

const CARD_LINK =
  "card-float group relative flex min-h-56 flex-col overflow-hidden rounded-3xl p-6 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#0f766e] sm:min-h-64 sm:p-7";

function OptionCard({ description, featured = false, icon: Icon, title, to }) {
  return (
    <Link
      className={
        featured
          ? `${CARD_LINK} bg-[#0f766e] text-[#ffffff] shadow-lg shadow-[#0f766e]/25 hover:bg-[#0d6b64]`
          : `${CARD_LINK} border border-slate-200 bg-white text-slate-950 shadow-sm hover:border-[#99d8cf]`
      }
      to={to}
    >
      {featured ? (
        // Concentric rings behind the arrow.
        <span aria-hidden="true">
          {["size-56", "size-40", "size-24"].map((size) => (
            <span
              className={`pointer-events-none absolute bottom-12 right-12 translate-x-1/2 translate-y-1/2 rounded-full sm:bottom-[3.25rem] sm:right-[3.25rem] border border-[#ffffff]/20 ${size}`}
              key={size}
            />
          ))}
        </span>
      ) : null}

      <span
        aria-hidden="true"
        className={`grid size-12 place-items-center rounded-xl ${
          featured
            ? "bg-[#ffffff]/15 text-[#ffffff]"
            : "bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]"
        }`}
      >
        <Icon className="size-6" />
      </span>

      <span className="mt-6 block text-xl font-black tracking-tight sm:text-2xl">
        {title}
      </span>
      <span
        className={`mt-3 block max-w-sm text-base leading-7 ${
          featured ? "text-[#f0fdfa]" : "text-slate-600"
        }`}
      >
        {description}
      </span>

      <span
        aria-hidden="true"
        className={`relative mt-auto grid size-12 place-self-end place-items-center rounded-full transition group-hover:-translate-y-0.5 ${
          featured
            ? "bg-[#ffffff] text-[#0f766e]"
            : "border border-slate-300 text-slate-950"
        }`}
      >
        <ArrowUpRight className="size-5" />
      </span>
    </Link>
  );
}

export default function VisitorLandingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="overflow-hidden rounded-[2rem] border border-[#ffffff]/70 bg-linear-to-br from-[#f7fdfc] via-[#eefaf7] to-[#dff4ef] shadow-xl shadow-slate-900/5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] dark:border-[#134e4a] dark:from-[#052422] dark:via-[#073230] dark:to-[#0a3c38]">
        <div className="relative z-10 px-6 pb-6 pt-7 sm:px-10 sm:pt-9 md:py-10 lg:pl-12">
          <img
            alt="Ministry of Finance, Republic of Ghana"
            className="h-14 w-auto sm:h-16 dark:rounded-xl dark:bg-[#ffffff] dark:p-2"
            decoding="async"
            height="66"
            src={ministryLogo}
            width="166"
          />

          <p className="mt-7 text-xs font-black uppercase tracking-[0.22em] text-[#0f766e] dark:text-[#5eead4]">
            Welcome
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[#134e4a] sm:text-5xl dark:text-[#ffffff]">
            Visitor check-in
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-700 sm:text-lg">
            Register your visit, or find your visitor record if you have been
            here before.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2.5" aria-label="About check-in">
            {[
              { icon: ShieldCheck, label: "Privacy-aware" },
              { icon: Clock3, label: "Quick mobile check-in" },
            ].map(({ icon: Icon, label }) => (
              <li
                className="inline-flex items-center gap-2 rounded-full border border-[#ccebe5] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#134e4a] dark:border-[#134e4a] dark:text-[#ccfbf1]"
                key={label}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Whole illustration on the bottom-right corner, in front of a
            curved teal wall with glass panel lines. */}
        <div className="relative isolate h-60 overflow-hidden min-[480px]:h-72 md:h-auto md:min-h-80">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[10%] right-0 -z-10 rounded-tl-[42%_100%] bg-linear-to-r from-[#bfece3] via-[#8fdccd] to-[#5cc7b5] dark:from-[#0f4a45] dark:via-[#11605a] dark:to-[#14756d]"
          >
            {["left-[48%]", "left-[70%]", "left-[88%]"].map((position) => (
              <span
                className={`absolute inset-y-0 w-3 bg-[#ffffff]/25 dark:bg-[#ffffff]/10 ${position}`}
                key={position}
              />
            ))}
          </div>
          <img
            alt=""
            className="absolute bottom-0 right-0 top-6 h-[calc(100%-1.5rem)] w-[calc(100%-1rem)] object-contain object-right-bottom md:top-8 md:h-[calc(100%-2rem)]"
            decoding="async"
            src={receptionIllustration}
          />
        </div>
      </section>

      <section aria-labelledby="visit-options-heading" className="mt-8 sm:mt-10">
        <div className="mb-4 px-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-950" id="visit-options-heading">
            Choose an option
          </h2>
          <p className="mt-1 text-base text-slate-600">
            Pick the one that matches your visit.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <OptionCard
            description="Create your visitor profile and add the details for today’s visit."
            featured
            icon={UserRoundPlus}
            title="This is my first visit"
            to="/visit/new"
          />
          <OptionCard
            description="Find your record, verify your mobile number and check in again."
            icon={Search}
            title="I have visited before"
            to="/visit/returning"
          />
        </div>
      </section>

      <section
        aria-labelledby="how-it-works-heading"
        className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"
      >
        <h2 className="text-lg font-black text-slate-950" id="how-it-works-heading">
          How it works
        </h2>

        <ol className="mt-5 grid gap-5 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, index) => (
            <li className="flex gap-4" key={step.title}>
              <span
                aria-hidden="true"
                className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-black ${
                  index === 0
                    ? "bg-[#0f766e] text-[#ffffff]"
                    : "bg-[#ccfbf1] text-[#134e4a] dark:bg-[#0f3a37] dark:text-[#5eead4]"
                }`}
              >
                {index + 1}
              </span>
              <div>
                <p className="font-bold text-slate-950">{step.title}</p>
                <p className="mt-0.5 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <aside className="mt-6 flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:p-5">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fde68a]/60 text-[#92400e] dark:bg-[#451a03] dark:text-[#fcd34d]"
        >
          <CircleHelp className="size-5" />
        </span>
        <div>
          <p className="font-bold">Need assistance?</p>
          <p className="mt-0.5">
            Please speak with reception. Do not enter another person’s details.
          </p>
        </div>
      </aside>
    </div>
  );
}
