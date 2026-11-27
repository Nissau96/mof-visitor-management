import { Clock3, ShieldCheck } from "lucide-react";
import ministryLogo from "../assets/images/mof-logo.webp";
import receptionIllustration from "../assets/images/reception-desk.webp";

// The welcome banner on the visitor landing page and the reception
// kiosk. Children sit under the "Visitor check-in" heading.
export default function VisitorHero({ children }) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#ffffff]/70 bg-linear-to-br from-[#f7fdfc] via-[#eefaf7] to-[#dff4ef] shadow-xl shadow-slate-900/5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] dark:border-[#134e4a] dark:from-[#052422] dark:via-[#073230] dark:to-[#0a3c38]">
      <div className="relative z-10 px-6 pb-6 pt-7 sm:px-10 sm:pt-9 md:py-8 md:pl-8 md:pr-4 lg:py-10 lg:pl-12 lg:pr-10">
        <img
          alt="Ministry of Finance, Republic of Ghana"
          className="h-14 w-auto sm:h-16 md:h-12 lg:h-16 dark:rounded-xl dark:bg-[#ffffff] dark:p-2"
          decoding="async"
          height="66"
          src={ministryLogo}
          width="166"
        />

        <p className="mt-7 text-xs font-black md:mt-5 lg:mt-7 uppercase tracking-[0.22em] text-[#0f766e] dark:text-[#5eead4]">
          Welcome
        </p>
        {/* One line from tablet up, as on desktop; the size follows the
            column width so it never breaks at the hyphen. */}
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[#134e4a] sm:text-5xl md:whitespace-nowrap md:text-[clamp(2rem,4.3vw,3rem)] lg:text-5xl dark:text-[#ffffff]">
          Visitor check-in
        </h1>
        {children}

        <ul className="mt-6 flex flex-wrap gap-2.5 md:mt-5 lg:mt-6" aria-label="About check-in">
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
  );
}
