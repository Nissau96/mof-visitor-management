import {
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  VISIT_AGENCY_LABELS,
} from "./visitorOptions.js";

// Option lists for AppSelect. Filter lists start with an explicit
// "All …" entry whose value "" means "no filter".

export function toOptions(values) {
  return values.map((value) => ({
    label: value,
    value,
  }));
}

// Visitor forms show full agency names; staff screens use the codes.
export const VISIT_AGENCY_OPTIONS = VISIT_AGENCIES.map((value) => ({
  label: VISIT_AGENCY_LABELS[value] || value,
  value,
}));

export const AGENCY_FILTER_OPTIONS = [
  { label: "All agencies", value: "" },
  ...toOptions(VISIT_AGENCIES),
];

export const DIVISION_FILTER_OPTIONS = [
  { label: "All divisions", value: "" },
  ...toOptions(MOF_DIVISIONS),
];
