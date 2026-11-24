import { ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { PrivacyNoticeSections } from "../components/PrivacyNotice.jsx";
import SiteCredit from "../components/SiteCredit.jsx";
import {
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
} from "../constants/privacy.js";

// The privacy notice as a public page, open without signing in. Its link
// is what WhatsApp (Meta) and other providers are given as the privacy
// policy. The text is the same one visitors acknowledge in the forms.
export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy notice · Ministry of Finance visitor service";
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-800 text-white"
          >
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-800">
              Ministry of Finance, Ghana
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Visitor service privacy notice
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Version {PRIVACY_NOTICE_VERSION} · Effective {PRIVACY_NOTICE_EFFECTIVE_DATE}
            </p>
          </div>
        </header>

        <p className="mt-8 max-w-[68ch] text-base leading-7 text-slate-800">
          {PRIVACY_NOTICE_SUMMARY}
        </p>

        <article className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <PrivacyNoticeSections className="max-w-[68ch] [&_h3]:text-base" />
        </article>
      </main>

      <footer className="px-4 pb-8 pt-4">
        <SiteCredit />
      </footer>
    </div>
  );
}
