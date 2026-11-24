import { ArrowRight, Building2, CalendarCheck, CalendarDays, Landmark, Mail, MapPin, Phone, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { CardPill, PurposePill, StatusPill } from "./HistoryPills.jsx";
import VisitMessages from "./VisitMessages.jsx";
import { getTowerLabel } from "../../constants/visitorOptions.js";
import {
  formatDuration,
  formatFullDate,
  formatShortDate,
  formatSpacedPhone,
  formatTime,
  getCardNote,
  getInitials,
  getMeetingCode,
  getVisitState,
  getVisiting,
  isVip,
  minutesOnSite,
  sameAccraDay,
} from "../../lib/visitHistory.js";

// The badge-on-a-lanyard drawing in the header. The VIP star is always
// drawn and shown by the drawer's VIP class, never by a condition here.
function BadgeArt() {
  return (
    <svg aria-hidden="true" className="vh-dart" fill="none" height="132" viewBox="0 0 138 132" width="138">
      <ellipse cx="72" cy="124" fill="var(--c-line)" rx="54" ry="6" />
      <path d="M58 4 72 30 86 4" stroke="var(--c)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      <rect fill="var(--c-dark)" height="10" rx="3" width="16" x="64" y="26" />
      <rect fill="var(--c-surface)" height="86" rx="12" stroke="var(--c)" strokeWidth="2.5" width="76" x="34" y="34" />
      <rect fill="var(--c)" height="22" rx="12" width="76" x="34" y="34" />
      <rect fill="var(--c)" height="10" width="76" x="34" y="46" />
      <rect fill="#ffffff" height="5" opacity="0.7" rx="2.5" width="20" x="62" y="41" />
      <circle cx="72" cy="76" fill="var(--c-tint)" r="12" stroke="var(--c)" strokeWidth="2" />
      <circle cx="72" cy="73" fill="var(--c)" r="4.5" />
      <path d="M64 83a8 8 0 0 1 16 0" fill="var(--c)" />
      <rect fill="var(--c-line)" height="5" rx="2.5" width="44" x="50" y="96" />
      <rect fill="var(--c-line)" height="5" rx="2.5" width="32" x="56" y="106" />
      <g className="vh-star">
        <circle cx="106" cy="40" fill="#f59e0b" r="14" stroke="#ffffff" strokeWidth="3" />
        <path
          d="m106 32 2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.9-3.8 5.4-.8Z"
          fill="#ffffff"
        />
      </g>
      <path d="M14 64l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#f59e0b" />
      <circle cx="124" cy="96" fill="var(--c-accent)" r="4" />
    </svg>
  );
}

function Rings() {
  return (
    <svg aria-hidden="true" className="vh-dgeo" fill="none" height="220" viewBox="0 0 300 220" width="300">
      <circle cx="250" cy="40" r="58" stroke="var(--c-line)" strokeWidth="1.5" />
      <circle cx="250" cy="40" r="96" stroke="var(--c-line)" strokeWidth="1.5" />
      <circle cx="250" cy="40" r="134" stroke="var(--c-line)" strokeDasharray="3 7" strokeWidth="1.5" />
      <rect fill="#fde68a" height="14" rx="3" transform="rotate(20 283 183)" width="14" x="276" y="176" />
    </svg>
  );
}

function Tile({ icon: Icon, label, value, wide = false }) {
  return (
    <div className={`vh-vtile ${wide ? "vh-vtile-wide" : ""}`}>
      <span className="vh-vtile-icon">
        <Icon aria-hidden="true" size={16} />
      </span>
      <span className="vh-vtile-label">{label}</span>
      <span className="vh-vtile-value">{value}</span>
    </div>
  );
}

function TimeBand({ visit }) {
  if (!visit.checkedInAt) {
    return (
      <div className="vh-band">
        <div className="vh-bandpart">
          <span className="vh-bandlabel">Check-in</span>
          <span className="vh-bandtime">Not checked in</span>
        </div>
        <div />
        <div className="vh-bandpart vh-bandpart-end">
          <span className="vh-bandlabel">Status</span>
          <span className="vh-bandtime">Cancelled</span>
        </div>
      </div>
    );
  }

  const onSite = !visit.checkedOutAt;
  const duration = formatDuration(minutesOnSite(visit));
  const laterDay = !onSite && !sameAccraDay(visit.checkedInAt, visit.checkedOutAt);

  return (
    <div className="vh-band">
      <div className="vh-bandpart">
        <span className="vh-bandlabel">Check-in</span>
        <span className="vh-bandtime">{formatTime(visit.checkedInAt)}</span>
      </div>
      <div className="vh-bandline">
        <span>
          <span className="vh-sr">Time on site: </span>
          {onSite ? `${duration} so far` : duration}
        </span>
      </div>
      <div className="vh-bandpart vh-bandpart-end">
        <span className="vh-bandlabel">Check-out</span>
        <span className="vh-bandtime">{onSite ? "On site" : formatTime(visit.checkedOutAt)}</span>
        {laterDay ? <span className="vh-banddate">{formatShortDate(visit.checkedOutAt)}</span> : null}
      </div>
    </div>
  );
}

const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * The visit record in a right-hand panel. Focus starts on the close
 * button, Tab stays inside, Escape or the backdrop closes it, and focus
 * goes back to whatever opened it (the page handles that in onClose).
 */
export default function VisitDetailDrawer({ loadMessages, onClose, visit }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
    const first = focusable[0];
    const last = focusable.at(-1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  const vip = isVip(visit);
  const kept = getVisitState(visit) === "not_returned";
  const meetingCode = getMeetingCode(visit);

  return createPortal(
    <div className="vh">
      <div aria-hidden="true" className="vh-scrim" onClick={onClose} />
      <aside
        aria-labelledby="visit-drawer-name"
        aria-modal="true"
        className={`vh-drawer ${vip ? "vh-drawer-vip" : ""}`}
        onKeyDown={handleKeyDown}
        ref={panelRef}
        role="dialog"
      >
        <div className="vh-dhead">
          <Rings />
          <BadgeArt />
          <button
            aria-label="Close visit details"
            className="vh-dclose"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={2.2} />
          </button>
          <span aria-hidden="true" className="vh-davatar">
            {getInitials(visit.fullName)}
          </span>
          <h2 className="vh-dname" id="visit-drawer-name">
            {visit.fullName}
          </h2>
          <span className="vh-dorg">{visit.organization || "Organisation not given"}</span>
          <div className="vh-dtags">
            <span className="vh-tag">{vip ? "VIP" : "Regular"}</span>
            <span className="vh-dref">{visit.reference}</span>
            <StatusPill visit={visit} />
          </div>
        </div>

        <div className="vh-dbody">
          <section aria-labelledby="visit-drawer-details" className="vh-vcard">
            <div className="vh-vchead">
              <h3 className="vh-vctitle" id="visit-drawer-details">
                <MapPin aria-hidden="true" size={16} />
                Visit details
              </h3>
              <PurposePill purpose={visit.purpose} />
            </div>
            <span className="vh-vlabel">Visiting</span>
            <p className="vh-vmain">{getVisiting(visit)}</p>
            <p className="vh-vdiv">{visit.division || visit.agency}</p>
            <div className="vh-vtiles">
              <Tile
                icon={CalendarDays}
                label="Date"
                value={formatFullDate(visit.checkedInAt) || "Not checked in"}
              />
              <Tile icon={Building2} label="Reception" value={getTowerLabel(visit.tower)} />
              <Tile icon={Landmark} label="Agency" value={visit.agency} wide />
            </div>
            <TimeBand visit={visit} />
            {meetingCode ? (
              <Link className="vh-meetlink" to="/staff/meetings">
                <CalendarCheck aria-hidden="true" size={16} />
                <span>
                  Booked meeting <b>{meetingCode}</b>
                </span>
                <ArrowRight aria-hidden="true" className="vh-meetlink-arrow" size={16} strokeWidth={2.4} />
              </Link>
            ) : null}
          </section>

          <section aria-labelledby="visit-drawer-contact" className="vh-softcard">
            <h3 className="vh-softtitle" id="visit-drawer-contact">
              Contact
            </h3>
            <div className="vh-crow">
              <span className="vh-cicon">
                <Phone aria-hidden="true" size={16} />
              </span>
              <span className="vh-ctext">
                <span className="vh-clabel">Phone</span>
                <span className={`vh-cvalue vh-tabular ${visit.phone ? "" : "vh-cvalue-missing"}`}>
                  {visit.phone ? formatSpacedPhone(visit.phone) : "Not given"}
                </span>
              </span>
            </div>
            <div className="vh-crow">
              <span className="vh-cicon">
                <Mail aria-hidden="true" size={16} />
              </span>
              <span className="vh-ctext">
                <span className="vh-clabel">Email</span>
                <span className={`vh-cvalue ${visit.email ? "" : "vh-cvalue-missing"}`}>
                  {visit.email || "Not given"}
                </span>
              </span>
            </div>
          </section>

          <VisitMessages loadMessages={loadMessages} reference={visit.reference} />

          <section
            aria-labelledby="visit-drawer-card"
            className={`vh-softcard ${kept ? "vh-softcard-alert" : ""}`}
          >
            <h3 className="vh-softtitle" id="visit-drawer-card">
              Visitor card
            </h3>
            <div className="vh-cardrow">
              <CardPill kept={kept} visit={visit} />
              <span className="vh-cardnote">{getCardNote(visit)}</span>
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
