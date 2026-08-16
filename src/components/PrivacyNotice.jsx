import { ShieldCheck } from "lucide-react";
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_OFFICER_EMAIL,
  PRIVACY_OFFICER_NAME,
} from "../constants/privacy.js";

export default function PrivacyNotice() {
  return (
    <div>
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-brand-800" />

        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Privacy notice
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {PRIVACY_NOTICE_SUMMARY}
          </p>

          <p className="mt-2 text-xs font-semibold text-slate-500">
            Version {PRIVACY_NOTICE_VERSION} · Effective {PRIVACY_NOTICE_EFFECTIVE_DATE}
          </p>
        </div>
      </div>

      <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer font-bold text-brand-900">
          Read the complete privacy notice
        </summary>

        <div className="mt-4 space-y-5 text-sm leading-6 text-slate-700">
          <section>
            <h3 className="font-bold text-slate-950">Who is responsible</h3>
            <p className="mt-1">
              The Ministry of Finance, Ghana, is responsible for the personal information collected through this visitor management service.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Information collected</h3>
            <p className="mt-1">
              We collect your name, mobile number, optional email address and organisation, visit destination and purpose, person or meeting being visited, acknowledgement details, visit timestamps and reference code. We also process limited technical security records, including irreversible request identifiers, verification-token records and audit events.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Why we use it</h3>
            <p className="mt-1">
              We use this information to register, verify and manage visits; support building access and security; prevent duplicate or abusive requests; investigate incidents; and maintain administrative accountability.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Who may access it</h3>
            <p className="mt-1">
              Access is limited to authorised Ministry reception, security and administrative personnel and approved service providers that support the application’s hosting and database services under organisational controls.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Retention</h3>
            <p className="mt-1">
              Completed visitor records and application audit events are retained for two years. Expired verification-token records and inactive rate-limit counters are retained for no more than 24 hours before cleanup. Open visits are retained until staff review and resolve them. An active legal, regulatory, security or investigation hold may suspend deletion for the affected records.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Returning visits</h3>
            <p className="mt-1">
              Your visitor profile may be reused for a future visit after a masked record search and successful mobile-number verification. Each returning check-in requires acknowledgement of the current privacy notice and records the current notice version and acknowledgement time.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Your rights</h3>
            <p className="mt-1">
              You may request access to or correction of your information, object to processing, withdraw consent where applicable, and raise a privacy complaint. Acknowledging this notice confirms that it was presented to you; it does not waive any of your rights.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-950">Privacy contacts</h3>
            <p className="mt-1">
              Contact the Ministry at <a className="font-semibold text-brand-800 underline decoration-2 underline-offset-2 hover:text-brand-900" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a> or contact the designated privacy officer, {PRIVACY_OFFICER_NAME}, at <a className="font-semibold text-brand-800 underline decoration-2 underline-offset-2 hover:text-brand-900" href={`mailto:${PRIVACY_OFFICER_EMAIL}`}>{PRIVACY_OFFICER_EMAIL}</a>. You may also submit a complaint to Ghana’s <a className="font-semibold text-brand-800 underline decoration-2 underline-offset-2 hover:text-brand-900" href="https://dataprotection.org.gh/for-individuals/">Data Protection Commission</a>.
            </p>
          </section>
        </div>
      </details>
    </div>
  );
}