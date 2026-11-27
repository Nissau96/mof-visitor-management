import { ArrowDown, ArrowUp } from "lucide-react";
import { CardPill, PurposePill, StatusPill } from "./HistoryPills.jsx";
import {
  agencyShortName,
  getInitials,
  formatDayMonth,
  formatShortDate,
  formatTime,
  getVisiting,
  sameAccraDay,
} from "../../lib/visitHistory.js";

// Widths from the design; together they fill the table.
const COLUMNS = [
  { key: "visitor", label: "Visitor", sortable: true, width: "11%" },
  { key: "organisation", label: "Organisation", width: "9%" },
  { key: "contact", label: "Contact", width: "11.5%" },
  { key: "purpose", label: "Purpose", width: "7.5%" },
  { key: "visiting", label: "Visiting", width: "8.5%" },
  { key: "agency", label: "Agency", width: "8%" },
  { key: "date", label: "Date", sortable: true, width: "8%" },
  { key: "in", label: "Check-in", width: "6.5%" },
  { key: "out", label: "Check-out", width: "7.5%" },
  { key: "card", label: "Card", width: "9%" },
  { key: "status", label: "Status", width: "13.5%" },
];

// The same columns plus Action (Card incidents), narrowed to make room.
const COLUMNS_WITH_ACTION = [
  { key: "visitor", label: "Visitor", sortable: true, width: "9.5%" },
  { key: "organisation", label: "Organisation", width: "7%" },
  { key: "contact", label: "Contact", width: "10%" },
  { key: "purpose", label: "Purpose", width: "7%" },
  { key: "visiting", label: "Visiting", width: "7.5%" },
  { key: "agency", label: "Agency", width: "7%" },
  { key: "date", label: "Date", sortable: true, width: "7.5%" },
  { key: "in", label: "Check-in", width: "6%" },
  { key: "out", label: "Check-out", width: "6.5%" },
  { key: "card", label: "Card", width: "8.5%" },
  { key: "status", label: "Status", width: "12%" },
  { key: "action", label: "Action", width: "11.5%" },
];

// Optional Reference column, placed before Visitor.
const REFERENCE_COLUMN = { key: "reference", label: "Reference", width: "9.5%" };

// Drop columns, then scale the rest so the table still fills its width.
function pickColumns(columns, omit) {
  const kept = columns.filter((column) => !omit.includes(column.key));
  const total = kept.reduce((sum, column) => sum + Number.parseFloat(column.width), 0);

  return kept.map((column) => ({
    ...column,
    width: `${((Number.parseFloat(column.width) / total) * 100).toFixed(2)}%`,
  }));
}

function defaultStatus(visit) {
  return <StatusPill visit={visit} />;
}

function defaultCard(visit) {
  return <CardPill visit={visit} />;
}

function Clip({ children, missing = "Not given", value }) {
  if (!value) {
    return <span className="vh-clip vh-missing">{missing}</span>;
  }

  return (
    <span className="vh-clip" title={value}>
      {children || value}
    </span>
  );
}

function CheckOut({ visit }) {
  if (!visit.checkedOutAt) {
    return (
      <span aria-label="Not checked out" className="vh-dash">
        —
      </span>
    );
  }

  return (
    <span className="vh-out">
      <span>{formatTime(visit.checkedOutAt)}</span>
      {visit.checkedInAt && !sameAccraDay(visit.checkedInAt, visit.checkedOutAt) ? (
        <span className="vh-out-date">{formatDayMonth(visit.checkedOutAt)}</span>
      ) : null}
    </span>
  );
}

// Short agency name ("MoF"), with the Ministry division under it the way
// the reference sits under the visitor's name.
function Agency({ visit }) {
  return (
    <span className="vh-namestack">
      <span className="vh-agency" title={visit.agency}>
        {agencyShortName(visit.agency)}
      </span>
      {visit.division ? (
        <span className="vh-subline vh-subline-wrap">{visit.division}</span>
      ) : null}
    </span>
  );
}

// `noteMissingEmail`: say "No email" when there is none (Visit History);
// otherwise the phone stands alone.
function Contact({ noteMissingEmail = true, visit }) {
  return (
    <>
      <span className="vh-phone" title={visit.phone || undefined}>
        {visit.phone || "No phone"}
      </span>
      {visit.email ? (
        <span className="vh-mono" title={visit.email}>
          {visit.email}
        </span>
      ) : (
        noteMissingEmail ? <span className="vh-mono vh-missing">No email</span> : null
      )}
    </>
  );
}

function SortHeader({ column, direction, onSort, sort }) {
  const active = sort === column.key;
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      scope="col"
    >
      <button className="vh-sorthead" onClick={() => onSort(column.key)} type="button">
        {column.label}
        <span aria-hidden="true" className="vh-sortarrow">
          {active ? <Arrow size={13} strokeWidth={2.6} /> : null}
        </span>
      </button>
    </th>
  );
}

function visitLabel(visit) {
  return `View visit details for ${visit.fullName}, ${visit.reference}`;
}

// Initials in a round chip; burgundy for VIP visitors.
function Avatar({ visit }) {
  return (
    <span
      aria-hidden="true"
      className={`vh-avatar ${visit.visitorType === "vip" ? "vh-avatar-vip" : ""}`}
    >
      {getInitials(visit.fullName)}
    </span>
  );
}

// Name, with the reference under it unless it has its own column.
function NameStack({ avatar = false, showRef = true, visit }) {
  const stack = (
    <span className="vh-namestack">
      <span className="vh-name" title={visit.fullName}>
        {visit.fullName}
      </span>
      {showRef ? <span className="vh-mono">{visit.reference}</span> : null}
    </span>
  );

  if (!avatar) {
    return stack;
  }

  return (
    <span className="vh-person">
      <Avatar visit={visit} />
      {stack}
    </span>
  );
}

/**
 * Desktop table (lg and up) and a card list below it.
 *
 * - `onOpen(visit, trigger)`: optional; rows open the side panel.
 * - `onSort(key)`: optional; Visitor and Date headers sort.
 * - `renderStatus` / `renderCard`: optional; replace the Status and
 *   Card cells (Card incidents shows the incident's state).
 * - `renderAction(visit, { fullWidth })`: optional; adds an Action column
 *   and a button at the foot of each phone card.
 * - `label`: names the table region and the phone list.
 * - `omitColumns`: column keys to leave out (e.g. ["out"] for visitors
 *   still inside); the rest widen to fill the table.
 * - `referenceColumn`: the reference gets its own first column instead
 *   of sitting under the name.
 * - `avatars`: an initials avatar beside each visitor's name.
 * - `iconAction`: the Action column is narrow, for an icon button.
 * - `noteMissingEmail`: false shows only emails that exist, with no
 *   "No email" placeholder.
 */
export default function VisitHistoryTable({
  direction,
  avatars = false,
  iconAction = false,
  label = "Visit records",
  noteMissingEmail = true,
  omitColumns = [],
  onOpen,
  onSort,
  renderAction,
  renderCard = defaultCard,
  referenceColumn = false,
  renderStatus = defaultStatus,
  selectedId,
  sort,
  visits,
}) {
  const base = (renderAction ? COLUMNS_WITH_ACTION : COLUMNS).map((column) => {
    if (column.key === "action" && iconAction) {
      return { ...column, width: "5.5%" };
    }

    // The avatar takes room from the name, so Visitor widens with it.
    if (column.key === "visitor" && avatars) {
      return { ...column, width: `${Number.parseFloat(column.width) + 3}%` };
    }

    return column;
  });
  const columns = pickColumns(referenceColumn ? [REFERENCE_COLUMN, ...base] : base, omitColumns);
  const shows = (key) => !omitColumns.includes(key);

  return (
    <>
      <div aria-label={`${label} table`} className="vh-tablewrap" role="region" tabIndex={0}>
        <table className="vh-table">
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) =>
                column.sortable && onSort ? (
                  <SortHeader
                    column={column}
                    direction={direction}
                    key={column.key}
                    onSort={onSort}
                    sort={sort}
                  />
                ) : (
                  <th
                    className={column.key === "action" && iconAction ? "vh-cell-center" : undefined}
                    key={column.key}
                    scope="col"
                  >
                    {column.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => (
              <tr
                className={[
                  selectedId === visit.visitId ? "vh-row-selected" : "",
                  onOpen ? "" : "vh-row-static",
                ].join(" ").trim() || undefined}
                key={visit.visitId}
                onClick={
                  onOpen
                    ? (event) => {
                        // The name button handles its own click (and keyboard).
                        if (!event.target.closest("button")) {
                          onOpen(visit, event.currentTarget.querySelector("button"));
                        }
                      }
                    : undefined
                }
              >
                {referenceColumn ? (
                  <td>
                    <span className="vh-refcode" title={visit.reference}>
                      {visit.reference}
                    </span>
                  </td>
                ) : null}
                <td>
                  {onOpen ? (
                    <button
                      aria-label={visitLabel(visit)}
                      className="vh-namebtn"
                      onClick={(event) => onOpen(visit, event.currentTarget)}
                      type="button"
                    >
                      <NameStack avatar={avatars} showRef={!referenceColumn} visit={visit} />
                    </button>
                  ) : (
                    <NameStack avatar={avatars} showRef={!referenceColumn} visit={visit} />
                  )}
                </td>
                <td>
                  <Clip value={visit.organization} />
                </td>
                <td>
                  <Contact noteMissingEmail={noteMissingEmail} visit={visit} />
                </td>
                <td>
                  <PurposePill purpose={visit.purpose} />
                </td>
                <td>
                  <Clip value={getVisiting(visit)} />
                </td>
                <td>
                  <Agency visit={visit} />
                </td>
                <td className="vh-nowrap">
                  {formatShortDate(visit.checkedInAt) || <span className="vh-dash">—</span>}
                </td>
                <td className="vh-nowrap vh-tabular">
                  {formatTime(visit.checkedInAt) || <span className="vh-dash">—</span>}
                </td>
                {shows("out") ? (
                  <td className="vh-nowrap vh-tabular">
                    <CheckOut visit={visit} />
                  </td>
                ) : null}
                <td className="vh-nowrap">{renderCard(visit)}</td>
                <td className="vh-nowrap">{renderStatus(visit)}</td>
                {renderAction ? (
                  <td className={`vh-nowrap ${iconAction ? "vh-cell-center" : ""}`}>
                    {renderAction(visit, { fullWidth: false })}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="vh-cards" aria-label={label}>
        {visits.map((visit) => (
          <li key={visit.visitId}>
            <MobileCard onOpen={onOpen} visit={visit}>
              <span className="vh-mcard-top">
                <NameStack avatar={avatars} visit={visit} />
                {renderStatus(visit)}
              </span>

              <span className="vh-mcard-meta">
                <span>
                  <span className="vh-mcard-label">Visiting</span>
                  <span className="vh-mcard-value">
                    <Clip value={getVisiting(visit)} />
                  </span>
                </span>
                <span>
                  <span className="vh-mcard-label">Organisation</span>
                  <span className="vh-mcard-value">
                    <Clip value={visit.organization} />
                  </span>
                </span>
                <span>
                  <span className="vh-mcard-label">Check-in</span>
                  <span className="vh-mcard-value vh-tabular">
                    {visit.checkedInAt
                      ? `${formatShortDate(visit.checkedInAt)}, ${formatTime(visit.checkedInAt)}`
                      : "—"}
                  </span>
                </span>
                {shows("out") ? (
                  <span>
                    <span className="vh-mcard-label">Check-out</span>
                    <span className="vh-mcard-value vh-tabular">
                      <CheckOut visit={visit} />
                    </span>
                  </span>
                ) : null}
              </span>

              <span className="vh-mcard-foot">
                <PurposePill purpose={visit.purpose} />
                {renderCard(visit)}
              </span>

              {renderAction ? (
                <span className="vh-mcard-action">{renderAction(visit, { fullWidth: true })}</span>
              ) : null}
            </MobileCard>
          </li>
        ))}
      </ul>
    </>
  );
}

// A phone card is one big button when it opens the side panel; with an
// action button inside it is a plain article instead (no nested buttons).
function MobileCard({ children, onOpen, visit }) {
  if (onOpen) {
    return (
      <button
        aria-label={visitLabel(visit)}
        className="vh-mcard"
        onClick={(event) => onOpen(visit, event.currentTarget)}
        type="button"
      >
        {children}
      </button>
    );
  }

  return (
    <article aria-label={`${visit.fullName}, ${visit.reference}`} className="vh-mcard vh-mcard-static">
      {children}
    </article>
  );
}
