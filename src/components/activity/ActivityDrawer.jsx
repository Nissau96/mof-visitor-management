import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CategoryIcon, ResultPill } from "./ActivityTable.jsx";
import {
  actionLabel,
  categoryMeta,
  describeDevice,
  describeTarget,
  detailRows,
  eventDateTime,
  eventReference,
  eventWhen,
  fieldLabel,
  formatChangeValue,
  roleLabel,
  towerText,
} from "../../lib/activityLog.js";
import { getInitials } from "../../lib/visitHistory.js";

// A clipboard of entries with a clock: "a record of what happened".
function LogArt() {
  return (
    <svg aria-hidden="true" className="vh-dart" fill="none" height="132" viewBox="0 0 138 132" width="138">
      <ellipse cx="70" cy="124" fill="var(--c-line)" rx="54" ry="6" />
      <rect fill="var(--c-surface)" height="92" rx="12" stroke="var(--c)" strokeWidth="2.5" width="74" x="26" y="24" />
      <rect fill="var(--c)" height="12" rx="4" width="30" x="48" y="18" />
      <circle cx="40" cy="50" fill="var(--c)" r="3.5" />
      <rect fill="var(--c-accent)" height="5" rx="2.5" width="36" x="50" y="47.5" />
      <circle cx="40" cy="68" fill="var(--c)" r="3.5" />
      <rect fill="var(--c-accent)" height="5" rx="2.5" width="28" x="50" y="65.5" />
      <circle cx="40" cy="86" fill="var(--c)" r="3.5" />
      <rect fill="var(--c-accent)" height="5" rx="2.5" width="32" x="50" y="83.5" />
      <circle cx="100" cy="98" fill="var(--c-surface)" r="18" stroke="var(--c)" strokeWidth="2.5" />
      <path d="M100 88v10l7 5" stroke="var(--c)" strokeLinecap="round" strokeWidth="2.5" />
      <path d="M10 60l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#f59e0b" />
      <circle cx="124" cy="40" fill="var(--c-accent)" r="4" />
    </svg>
  );
}

function Rings() {
  return (
    <svg aria-hidden="true" className="vh-dgeo" fill="none" height="220" viewBox="0 0 300 220" width="300">
      <circle cx="250" cy="40" r="58" stroke="var(--c-line)" strokeWidth="1.5" />
      <circle cx="250" cy="40" r="96" stroke="var(--c-line)" strokeWidth="1.5" />
      <circle cx="250" cy="40" r="134" stroke="var(--c-line)" strokeDasharray="3 7" strokeWidth="1.5" />
    </svg>
  );
}

function Changes({ changes }) {
  return (
    <table className="al-changes">
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Before</th>
          <th scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={change.field}>
            <th scope="row" style={{ background: "transparent", color: "var(--vh-text)", fontSize: 13 }}>
              {fieldLabel(change.field)}
            </th>
            <td>
              <span className="al-before">{formatChangeValue(change.before)}</span>
            </td>
            <td>
              <span className="al-after">{formatChangeValue(change.after)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fact({ label, mono = false, value }) {
  return (
    <span className="vh-ctext">
      <span className="vh-clabel">{label}</span>
      <span className={`vh-cvalue ${value ? "" : "vh-cvalue-missing"}`} style={mono ? { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 13 } : undefined}>
        {value || "Not recorded"}
      </span>
    </span>
  );
}

const FOCUSABLE = "a[href], button:not([disabled])";

/** One event in full. Focus is trapped while open; Escape closes. */
export default function ActivityDrawer({ event, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function handleKeyDown(keyEvent) {
    if (keyEvent.key === "Escape") {
      keyEvent.preventDefault();
      onClose();
      return;
    }

    if (keyEvent.key !== "Tab") {
      return;
    }

    const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
    const first = focusable[0];
    const last = focusable.at(-1);

    if (keyEvent.shiftKey && document.activeElement === first) {
      keyEvent.preventDefault();
      last?.focus();
    } else if (!keyEvent.shiftKey && document.activeElement === last) {
      keyEvent.preventDefault();
      first?.focus();
    }
  }

  const meta = categoryMeta(event.category);
  // Sensitive changes take the amber warning theme; the rest their category's.
  const tone = event.result === "failed" ? "rose" : event.sensitive ? "amber" : meta.tone;
  const target = describeTarget(event);
  const changes = Array.isArray(event.details?.changes) ? event.details.changes : [];
  const rows = detailRows(event);
  const when = eventWhen(event.createdAt);
  const name = event.actorName || roleLabel(event.actorRole);

  return createPortal(
    <div className="vh">
      <div aria-hidden="true" className="vh-scrim" onClick={onClose} />
      <aside
        aria-labelledby="activity-drawer-title"
        aria-modal="true"
        className={`vh-drawer al-drawer al-tone-${tone}`}
        onKeyDown={handleKeyDown}
        ref={panelRef}
        role="dialog"
      >
        <div className="vh-dhead">
          <Rings />
          <LogArt />
          <button aria-label="Close event details" className="vh-dclose" onClick={onClose} ref={closeRef} type="button">
            <X aria-hidden="true" size={18} strokeWidth={2.2} />
          </button>
          <span className={`al-tone-${meta.tone}`} style={{ marginBottom: 10 }}>
            <CategoryIcon category={event.category} size={20} />
          </span>
          <span className="al-eyebrowless">{meta.label} event</span>
          <h2 className="vh-dname" id="activity-drawer-title">
            {actionLabel(event.action)}
          </h2>
          <div className="vh-dtags">
            <ResultPill result={event.result} />
            {event.sensitive ? <span className="vh-tag">Sensitive change</span> : null}
            <span className="vh-dref">{eventReference(event)}</span>
          </div>
        </div>

        <div className="vh-dbody">
          <section aria-labelledby="activity-what" className="vh-vcard">
            <div className="vh-vchead">
              <h3 className="vh-vctitle" id="activity-what">
                What happened
              </h3>
              <span className="vh-vlabel">
                {when.day}, {when.time}
              </span>
            </div>
            <span className="vh-vlabel">Target</span>
            <p className="vh-vmain">{target.name}</p>
            {target.detail ? <p className="vh-vdiv">{target.detail}</p> : <div style={{ height: 10 }} />}

            {changes.length ? (
              <>
                <span className="vh-vlabel">Changes</span>
                <Changes changes={changes} />
              </>
            ) : null}

            {rows.length ? (
              <dl className="al-grid" style={{ marginTop: changes.length ? 14 : 0 }}>
                {rows.map((row) => (
                  <div key={row.label}>
                    <dt className="vh-clabel">{row.label}</dt>
                    <dd className="vh-cvalue" style={{ margin: 0 }}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section aria-labelledby="activity-who" className="vh-softcard">
            <h3 className="vh-softtitle" id="activity-who">
              Done by
            </h3>
            <div className="vh-crow">
              <span aria-hidden="true" className={`vh-avatar ${event.actorRole === "admin" ? "vh-avatar-admin" : ""}`} style={{ height: 40, width: 40, fontSize: 13 }}>
                {getInitials(name)}
              </span>
              <span className="vh-ctext">
                <span className="vh-cvalue">{name}</span>
                <span className="vh-clabel">
                  {roleLabel(event.actorRole)} · {towerText(event.tower)}
                </span>
              </span>
            </div>
          </section>

          <section aria-labelledby="activity-where" className="vh-softcard">
            <h3 className="vh-softtitle" id="activity-where">
              Where from
            </h3>
            <div className="al-grid">
              <Fact label="Device" value={describeDevice(event.userAgent)} />
              <Fact label="IP address" mono value={event.ipAddress} />
              <Fact label="Tower" value={towerText(event.tower)} />
              <Fact label="Time" value={eventDateTime(event.createdAt)} />
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
