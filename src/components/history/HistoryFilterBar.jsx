import { CalendarDays, Search, X } from "lucide-react";
import AppSelect from "../AppSelect.jsx";
import { MINISTRY_OF_FINANCE_AGENCY, VISIT_PURPOSES, getTowerLabel } from "../../constants/visitorOptions.js";
import { AGENCY_FILTER_OPTIONS, DIVISION_FILTER_OPTIONS } from "../../constants/selectOptions.js";
import { DATE_PRESETS, agencyShortName } from "../../lib/visitHistory.js";

const TOWER_CHOICES = [
  { label: "All towers", value: "" },
  { label: "Tower 1", value: "tower_1" },
  { label: "Tower 2", value: "tower_2" },
];

const PURPOSE_CHOICES = [
  { label: "All", value: "" },
  ...VISIT_PURPOSES.map((purpose) => ({ label: purpose, value: purpose })),
];

const AGENCY_CHOICES = AGENCY_FILTER_OPTIONS.map((option) => ({
  label: option.value ? agencyShortName(option.value) : "All",
  value: option.value,
}));

const DIVISION_CHOICES = DIVISION_FILTER_OPTIONS.map((option) => ({
  label: option.value ? option.label : "All",
  value: option.value,
}));

// The closed select reads "Tower  Tower 2": a small grey label inside the
// trigger, then the value in bold. Screen readers get the label from the
// hidden <label> AppSelect renders, so the inline copy is aria-hidden.
function inlineLabel(label) {
  function InlineLabelTrigger({ label: valueLabel }) {
    return (
      <span className="vh-trigger">
        <span aria-hidden="true" className="vh-select-label">
          {label}
        </span>
        <span className="vh-trigger-value">{valueLabel}</span>
      </span>
    );
  }

  return InlineLabelTrigger;
}

function ValueTrigger({ label }) {
  return <span className="vh-trigger-value">{label}</span>;
}

function CalendarIcon(props) {
  return <CalendarDays {...props} />;
}

const TRIGGERS = {
  agency: inlineLabel("Agency"),
  division: inlineLabel("Division"),
  purpose: inlineLabel("Purpose"),
  tower: inlineLabel("Tower"),
};

function FilterSelect({ className = "", id, label, onChange, options, TriggerStartIcon, TriggerView, value }) {
  return (
    <AppSelect
      appearance="filter"
      className={`vh-filter ${className}`}
      id={id}
      label={label}
      labelHidden
      listMinWidth={220}
      onChange={onChange}
      options={options}
      TriggerStartIcon={TriggerStartIcon}
      TriggerView={TriggerView}
      value={value}
    />
  );
}

/**
 * The filter row above the table, plus the From/To row for a custom
 * range. Every change goes straight to onChange(field, value).
 */
export default function HistoryFilterBar({
  administrator,
  onChange,
  rangeError,
  tower,
  values,
}) {
  return (
    <>
      <div className="vh-filterbar" role="search">
        <div className="vh-search">
          <Search aria-hidden="true" size={17} />
          <label className="vh-sr" htmlFor="history-search">
            Search visits
          </label>
          <input
            autoComplete="off"
            id="history-search"
            maxLength={80}
            onChange={(event) => onChange("search", event.target.value)}
            placeholder="Search name, organisation or reference"
            type="search"
            value={values.search}
          />
        </div>

        <FilterSelect
          className="vh-filter-date"
          id="history-range"
          label="Date range"
          onChange={(value) => onChange("preset", value)}
          options={DATE_PRESETS}
          TriggerStartIcon={CalendarIcon}
          TriggerView={ValueTrigger}
          value={values.preset}
        />

        {administrator ? (
          <FilterSelect
            id="history-tower"
            label="Tower"
            onChange={(value) => onChange("tower", value)}
            options={TOWER_CHOICES}
            TriggerView={TRIGGERS.tower}
            value={tower}
          />
        ) : (
          <span className="vh-fixedtower">
            <span className="vh-select-label">Tower</span>
            {getTowerLabel(tower)}
          </span>
        )}

        <FilterSelect
          id="history-agency"
          label="Agency"
          onChange={(value) => onChange("agency", value)}
          options={AGENCY_CHOICES}
          TriggerView={TRIGGERS.agency}
          value={values.agency}
        />

        {values.agency === MINISTRY_OF_FINANCE_AGENCY ? (
          <FilterSelect
            id="history-division"
            label="Division"
            onChange={(value) => onChange("division", value)}
            options={DIVISION_CHOICES}
            TriggerView={TRIGGERS.division}
            value={values.division}
          />
        ) : null}

        <FilterSelect
          id="history-purpose"
          label="Purpose"
          onChange={(value) => onChange("purpose", value)}
          options={PURPOSE_CHOICES}
          TriggerView={TRIGGERS.purpose}
          value={values.purpose}
        />
      </div>

      {values.preset === "custom" ? (
        <div className="vh-custom">
          <label className="vh-datefield" htmlFor="history-from">
            <span>From</span>
            <input
              id="history-from"
              onChange={(event) => onChange("from", event.target.value)}
              type="date"
              value={values.from}
            />
          </label>
          <label className="vh-datefield" htmlFor="history-to">
            <span>To</span>
            <input
              id="history-to"
              onChange={(event) => onChange("to", event.target.value)}
              type="date"
              value={values.to}
            />
          </label>
          {rangeError ? (
            <span className="vh-error" role="alert">
              {rangeError}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** A removable teal chip for an active search, agency, purpose or status. */
export function FilterChip({ label, onRemove }) {
  return (
    <button aria-label={`Remove filter ${label}`} className="vh-chip" onClick={onRemove} type="button">
      {label}
      <X aria-hidden="true" size={14} strokeWidth={2.4} />
    </button>
  );
}
