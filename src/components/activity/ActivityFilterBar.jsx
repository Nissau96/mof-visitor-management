import { CalendarDays, Search } from "lucide-react";
import AppSelect from "../AppSelect.jsx";
import { DATE_PRESETS } from "../../lib/visitHistory.js";
import {
  CATEGORY_OPTIONS,
  RESULT_OPTIONS,
  ROLE_OPTIONS,
  TOWER_OPTIONS,
} from "../../lib/activityLog.js";

// Closed selects read "Role  All": a small grey label, then the value.
function inlineLabel(label) {
  function InlineLabelTrigger({ label: value }) {
    return (
      <span className="vh-trigger">
        <span aria-hidden="true" className="vh-select-label">
          {label}
        </span>
        <span className="vh-trigger-value">{value}</span>
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
  action: inlineLabel("Action"),
  result: inlineLabel("Result"),
  role: inlineLabel("Role"),
  tower: inlineLabel("Tower"),
  user: inlineLabel("User"),
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

/** Search, date range and the five filters; onChange(field, value). */
export default function ActivityFilterBar({ onChange, rangeError, users, values }) {
  const userOptions = [
    { label: "Everyone", value: "" },
    ...users.map((user) => ({ label: user.name, value: user.id })),
  ];

  return (
    <>
      <div className="vh-filterbar al-filterbar" role="search">
        <div className="vh-search">
          <Search aria-hidden="true" size={17} />
          <label className="vh-sr" htmlFor="activity-search">
            Search events
          </label>
          <input
            autoComplete="off"
            id="activity-search"
            maxLength={80}
            onChange={(event) => onChange("search", event.target.value)}
            placeholder="Search action, visitor, card or reference"
            type="search"
            value={values.search}
          />
        </div>

        <FilterSelect
          className="vh-filter-date"
          id="activity-range"
          label="Date range"
          onChange={(value) => onChange("preset", value)}
          options={DATE_PRESETS}
          TriggerStartIcon={CalendarIcon}
          TriggerView={ValueTrigger}
          value={values.preset}
        />
        <FilterSelect id="activity-user" label="User" onChange={(value) => onChange("user", value)} options={userOptions} TriggerView={TRIGGERS.user} value={values.user} />
        <FilterSelect id="activity-role" label="Role" onChange={(value) => onChange("role", value)} options={ROLE_OPTIONS} TriggerView={TRIGGERS.role} value={values.role} />
        <FilterSelect id="activity-tower" label="Tower" onChange={(value) => onChange("tower", value)} options={TOWER_OPTIONS} TriggerView={TRIGGERS.tower} value={values.tower} />
        <FilterSelect id="activity-action" label="Action" onChange={(value) => onChange("category", value)} options={CATEGORY_OPTIONS} TriggerView={TRIGGERS.action} value={values.category} />
        <FilterSelect id="activity-result" label="Result" onChange={(value) => onChange("result", value)} options={RESULT_OPTIONS} TriggerView={TRIGGERS.result} value={values.result} />
      </div>

      {values.preset === "custom" ? (
        <div className="vh-custom">
          <label className="vh-datefield" htmlFor="activity-from">
            <span>From</span>
            <input id="activity-from" onChange={(event) => onChange("from", event.target.value)} type="date" value={values.from} />
          </label>
          <label className="vh-datefield" htmlFor="activity-to">
            <span>To</span>
            <input id="activity-to" onChange={(event) => onChange("to", event.target.value)} type="date" value={values.to} />
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
