import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AdminDialog, {
  DialogBody,
  DialogFooter,
  DIALOG_PRIMARY_BUTTON,
} from "./AdminDialog.jsx";
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_OFFICER_EMAIL,
  PRIVACY_OFFICER_NAME,
} from "../constants/privacy.js";

// The line above a visitor form's submit button: submitting is the
// privacy acknowledgement, and the link opens the full notice.
export default function PrivacyAgreement({ children }) {
  const [open, setOpen] = useState(false);
  const linkRef = useRef(null);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => linkRef.current?.focus());
  }

  return (
    <>
      <p className="flex items-start gap-2 px-1 text-sm leading-6 text-slate-700">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-[#0f766e] dark:text-[#5eead4]"
        />
        <span>
          {children}{" "}
          <button
            className="font-bold text-[#0f766e] underline decoration-2 underline-offset-2 hover:text-[#115e59] dark:text-[#5eead4]"
            onClick={() => setOpen(true)}
            ref={linkRef}
            type="button"
          >
            Read the privacy notice
          </button>
        </span>
      </p>

      {open ? <PrivacyNoticeDialog onClose={close} /> : null}
    </>
  );
}

function PrivacyNoticeDialog({ onClose }) {
  const noticeRef = useRef(null);

  // Focus starts on the notice so keyboard users are inside the dialog
  // and can scroll it straight away.
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);

  return (
    <AdminDialog
      closeLabel="Close privacy notice"
      description={`Version ${PRIVACY_NOTICE_VERSION} · Effective ${PRIVACY_NOTICE_EFFECTIVE_DATE}`}
      icon={ShieldCheck}
      onClose={onClose}
      title="Privacy notice"
    >
      <DialogBody
        aria-label="Full privacy notice"
        className="outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200"
        ref={noticeRef}
        role="region"
        tabIndex={0}
      >
        <p className="text-base leading-7 text-slate-700">
          {PRIVACY_NOTICE_SUMMARY}
        </p>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <PrivacyNoticeSections />
        </div>
      </DialogBody>

      <DialogFooter>
        <button
          className={DIALOG_PRIMARY_BUTTON}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </DialogFooter>
    </AdminDialog>
  );
}

// The full notice, shown in the privacy dialog.
export function PrivacyNoticeSections({ className = "" }) {
  return (
    <div className={`space-y-5 text-sm leading-6 text-slate-700 ${className}`}>
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
          Access is limited to authorised Ministry reception, security and administrative personnel and approved service providers that support the application’s hosting and database services under organisational controls. If you ask for Wi-Fi access, your name, organisation, mobile number and email address are shared with the Ministry’s IT network team so they can send you the Wi-Fi details.
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
          Your visitor profile may be reused for a future visit when you enter the mobile number from your first visit. Where the Ministry confirms the number with a one-time code sent by SMS, your mobile number is shared with its approved SMS provider to deliver the code; codes are stored only in protected form and deleted within 24 hours. Each returning check-in requires acknowledgement of the current privacy notice and records the current notice version and acknowledgement time.
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
  );
}
