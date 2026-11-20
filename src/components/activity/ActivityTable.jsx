import {
  ArrowDown,
  CalendarCheck,
  CreditCard,
  Download,
  Link2,
  LogIn,
  Server,
  Settings,
  TabletSmartphone,
  UserCheck,
  Wifi,
} from "lucide-react";
import {
  actionLabel,
  categoryMeta,
  describeTarget,
  eventReference,
  eventWhen,
  roleLabel,
  towerText,
} from "../../lib/activityLog.js";
import { getInitials } from "../../lib/visitHistory.js";

const CATEGORY_ICONS = {
  card: CreditCard,
  export: Download,
  kiosk: TabletSmartphone,
  link: Link2,
  meeting: CalendarCheck,
  settings: Settings,
  signin: LogIn,
  system: Server,
  visitor: UserCheck,
  wifi: Wifi,
};

// Widths fill the table; Action and Target get the room.
const COLUMNS = [
  { key: "time", label: "Time", width: "10%" },
  { key: "user", label: "User", width: "19%" },
  { key: "action", label: "Action", width: "22%" },
  { key: "target", label: "Target", width: "22%" },
  { key: "tower", label: "Tower", width: "12%" },
  { key: "result", label: "Result", width: "15%" },
];

export function CategoryIcon({ category, size = 16 }) {
  const Icon = CATEGORY_ICONS[category] || Server;
  const tone = categoryMeta(category).tone;

  return (
    <span aria-hidden="true" className={`al-icon al-tone-${tone}`}>
      <Icon size={size} strokeWidth={2.1} />
    </span>
  );
}

export function ResultPill({ result }) {
  const failed = result === "failed";

  return (
    <span className={`vh-status ${failed ? "vh-status-failed" : "vh-status-in"}`}>
      <span aria-hidden="true" className="vh-dot" />
      {failed ? "Failed" : "Success"}
    </span>
  );
}

function Actor({ event }) {
  const name = event.actorName || roleLabel(event.actorRole);
  const staff = Boolean(event.actorId);

  return (
    <span className="vh-person">
      <span
        aria-hidden="true"
        className={`vh-avatar ${event.actorRole === "admin" ? "vh-avatar-admin" : ""} ${staff ? "" : "vh-avatar-muted"}`}
      >
        {staff ? getInitials(name) : name.charAt(0).toUpperCase()}
      </span>
      <span className="vh-namestack">
        <span className="vh-name" title={name}>
          {name}
        </span>
        <span className="al-meta">{roleLabel(event.actorRole)}</span>
      </span>
    </span>
  );
}

function Action({ event }) {
  const meta = categoryMeta(event.category);
  const label = actionLabel(event.action);

  return (
    <span className="al-action">
      <CategoryIcon category={event.category} />
      <span className="vh-namestack">
        <span className="al-action-label" title={label}>
          {label}
        </span>
        <span className="al-meta">
          {meta.label}
          {event.sensitive ? (
            <>
              {" · "}
              <span className="al-sensitive">Sensitive</span>
            </>
          ) : null}
        </span>
      </span>
    </span>
  );
}

function Target({ event }) {
  const target = describeTarget(event);

  return (
    <span className="vh-namestack">
      <span className="vh-clip" style={{ fontWeight: 600 }} title={target.name}>
        {target.name}
      </span>
      {target.detail ? (
        <span className="al-meta" title={target.detail}>
          {target.detail}
        </span>
      ) : null}
    </span>
  );
}

function When({ event }) {
  const when = eventWhen(event.createdAt);

  return (
    <span className="al-when">
      <span className="al-time">{when.time}</span>
      <span className="al-meta">{when.day}</span>
    </span>
  );
}

function eventLabel(event) {
  return `${actionLabel(event.action)} by ${event.actorName || roleLabel(event.actorRole)}, ${eventReference(event)}`;
}

/** Events newest first; a row (or its phone card) opens the side panel. */
export default function ActivityTable({ events, onOpen, selectedId }) {
  return (
    <>
      <div aria-label="Activity events table" className="vh-tablewrap" role="region" tabIndex={0}>
        <table className="vh-table al-table">
          <colgroup>
            {COLUMNS.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th aria-sort={column.key === "time" ? "descending" : undefined} key={column.key} scope="col">
                  {column.key === "time" ? (
                    <span className="vh-sorthead" style={{ cursor: "default" }}>
                      {column.label}
                      <span aria-hidden="true" className="vh-sortarrow">
                        <ArrowDown size={13} strokeWidth={2.6} />
                      </span>
                    </span>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                className={[
                  selectedId === String(event.id) ? "vh-row-selected" : "",
                  event.result === "failed" ? "al-row-failed" : "",
                ].join(" ").trim() || undefined}
                key={event.id}
                onClick={(clickEvent) => {
                  if (!clickEvent.target.closest("button")) {
                    onOpen(event, clickEvent.currentTarget.querySelector("button"));
                  }
                }}
              >
                <td>
                  <button
                    aria-label={`View ${eventLabel(event)}`}
                    className="vh-namebtn"
                    onClick={(clickEvent) => onOpen(event, clickEvent.currentTarget)}
                    type="button"
                  >
                    <When event={event} />
                  </button>
                </td>
                <td>
                  <Actor event={event} />
                </td>
                <td>
                  <Action event={event} />
                </td>
                <td>
                  <Target event={event} />
                </td>
                <td className="vh-nowrap">{towerText(event.tower)}</td>
                <td className="vh-nowrap">
                  <ResultPill result={event.result} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label="Activity events" className="vh-cards">
        {events.map((event) => {
          const when = eventWhen(event.createdAt);

          return (
            <li key={event.id}>
              <button
                aria-label={`View ${eventLabel(event)}`}
                className={`vh-mcard ${event.result === "failed" ? "al-mcard-failed" : ""}`}
                onClick={(clickEvent) => onOpen(event, clickEvent.currentTarget)}
                type="button"
              >
                <span className="vh-mcard-top">
                  <Action event={event} />
                  <ResultPill result={event.result} />
                </span>
                <span className="vh-mcard-meta">
                  <span>
                    <span className="vh-mcard-label">By</span>
                    <span className="vh-mcard-value">{event.actorName || roleLabel(event.actorRole)}</span>
                  </span>
                  <span>
                    <span className="vh-mcard-label">When</span>
                    <span className="vh-mcard-value vh-tabular">
                      {when.day}, {when.time}
                    </span>
                  </span>
                  <span>
                    <span className="vh-mcard-label">Target</span>
                    <span className="vh-mcard-value">
                      <span className="vh-clip">{describeTarget(event).name}</span>
                    </span>
                  </span>
                  <span>
                    <span className="vh-mcard-label">Tower</span>
                    <span className="vh-mcard-value">{towerText(event.tower)}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
