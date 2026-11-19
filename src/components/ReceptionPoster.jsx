import { Smartphone } from "lucide-react";
import ministrySeal from "../assets/images/mof-seal.webp";
import peerValues from "../assets/images/peerwhite.png";
import { formatWeekRange } from "../lib/weeklyQr.js";

// The weekly QR poster, shown on the staff Weekly QR page and on the
// reception kiosk. Explicit colours (not brand/white utilities) keep the
// poster identical in light mode, dark mode and print. The compact
// version fits a kiosk screen; children (the kiosk's Done bar) sit
// inside the card below the PEER band.
export default function ReceptionPoster({
  children,
  compact = false,
  headingLevel: Heading = "h3",
  qrDataUrl,
  titleId,
  weeklyQr,
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-[#134e4a] text-[#ffffff] [print-color-adjust:exact] print:mx-auto print:max-w-[170mm] print:break-inside-avoid">
      <div
        className={`relative isolate overflow-hidden px-6 text-center print:pb-4 print:pt-5 ${
          compact ? "pb-4 pt-5" : "pb-6 pt-7"
        }`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full border-[16px] border-[#ffffff14]"
        >
          <span className="absolute inset-8 rounded-full border-[12px] border-[#ffffff12]" />
          <span className="absolute inset-[4.5rem] rounded-full border-[8px] border-[#ffffff0f]" />
        </span>

        <img
          alt="Ministry of Finance, Republic of Ghana seal"
          className={
            compact
              ? // Grows with the screen height so the kiosk card still fits.
                "mx-auto size-[clamp(4rem,10dvh,7rem)] drop-shadow-[0_8px_18px_rgb(0_0_0/0.3)]"
              : "mx-auto size-24 sm:size-28 print:size-20"
          }
          src={ministrySeal}
        />

        <Heading
          className={`font-black tracking-tight ${
            compact
              ? "mt-2 text-[clamp(1.75rem,4.5dvh,2.25rem)] leading-tight"
              : "mt-4 text-3xl sm:text-4xl"
          }`}
          id={titleId}
        >
          Visitor Registration
        </Heading>

        <p
          className={
            compact
              ? "mt-1.5 text-sm text-[#ccfbf1] sm:text-base"
              : "mt-2 text-[#ccfbf1] sm:text-lg"
          }
        >
          Scan to access the visitor management application.
        </p>
      </div>

      <div
        className={`bg-[#0f403c] px-6 text-center print:pb-5 print:pt-4 ${
          compact ? "pb-5 pt-4" : "pb-8 pt-6"
        }`}
      >
        <p
          className={`inline-flex items-center gap-2 font-black ${
            compact ? "text-base" : "text-xl sm:text-2xl"
          }`}
        >
          <Smartphone
            aria-hidden="true"
            className={compact ? "size-5" : "size-6"}
          />
          Scan QR Code
        </p>

        <div
          className={
            compact
              ? "mx-auto mt-4 w-full max-w-[min(20rem,33dvh)] rounded-3xl bg-[#ffffff] p-3.5 shadow-xl shadow-[#00000040] ring-4 ring-[#e6f6f4]"
              : "mx-auto mt-5 w-full max-w-xs rounded-[2rem] bg-[#e6f6f4] p-4 sm:max-w-sm sm:p-5 print:mt-3 print:max-w-[80mm]"
          }
        >
          <img
            alt={`Weekly visitor QR code, valid ${formatWeekRange(weeklyQr)}`}
            className="aspect-square w-full [image-rendering:pixelated]"
            src={qrDataUrl}
          />
        </div>
      </div>

      {/* The PEER artwork is transparent with white lettering, so it sits on teal. */}
      <div className={compact ? "bg-[#0f403c] pb-4" : "bg-[#134e4a]"}>
        <img
          alt="PEER: Professional, Ethical, Efficient, Responsive"
          className={
            compact
              ? "mx-auto aspect-[2/1] w-full max-w-[min(18rem,24dvh)] object-cover"
              : "mx-auto aspect-[2/1] w-full max-w-2xl object-cover print:max-w-[150mm]"
          }
          src={peerValues}
        />
      </div>

      {children}
    </div>
  );
}
