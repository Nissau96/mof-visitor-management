import { VISIT_STATES, getVisitState, isVip } from "../../lib/visitHistory.js";

const PURPOSE_TONES = {
  "Follow up": "vh-purpose-follow",
  Meeting: "vh-purpose-meeting",
  Official: "vh-purpose-official",
};

export function PurposePill({ purpose }) {
  return (
    <span className={`vh-purpose ${PURPOSE_TONES[purpose] || ""}`} title={purpose}>
      {purpose}
    </span>
  );
}

/** Solid card pill: burgundy for VIP cards, teal otherwise, rose if kept. */
export function CardPill({ kept = false, visit }) {
  if (!visit.cardNumber) {
    return <span className="vh-none">None</span>;
  }

  const tone = kept ? "vh-card-kept" : isVip(visit) ? "vh-card-vip" : "";

  return (
    <span className={`vh-card ${tone}`} title={isVip(visit) ? "VIP visitor card" : "Visitor card"}>
      {visit.cardNumber}
    </span>
  );
}

// Visitors still inside: "Checked in", or "Card not returned" once the
// card is kept past its 24-hour return time.
export function CheckedInStatus({ visit }) {
  const kept = visit.cardStatus === "not_returned";

  return (
    <span className={`vh-status ${kept ? "vh-status-kept" : "vh-status-in"}`}>
      <span aria-hidden="true" className="vh-dot" />
      {kept ? "Card not returned" : "Checked in"}
    </span>
  );
}

// A visitor inside without a card is waiting for one.
export function CheckedInCard({ visit }) {
  if (!visit.cardNumber) {
    return <span className="vh-awaiting">Awaiting card</span>;
  }

  return <CardPill kept={visit.cardStatus === "not_returned"} visit={visit} />;
}

export function StatusPill({ visit }) {
  const state = VISIT_STATES[getVisitState(visit)];

  return (
    <span className={`vh-status vh-status-${state.tone}`}>
      <span aria-hidden="true" className="vh-dot" />
      {state.label}
    </span>
  );
}
