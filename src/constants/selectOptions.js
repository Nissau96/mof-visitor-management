import {
  MOF_DIVISIONS,
  VISIT_AGENCIES,
} from "./visitorOptions.js";

// Option lists for AppSelect. Filter lists start with an explicit
// "All …" entry whose value "" means "no filter".

export function toOptions(values) {
  return values.map((value) => ({
    label: value,
    value,
  }));
}

export const AGENCY_FILTER_OPTIONS = [
  { label: "All agencies", value: "" },
  ...toOptions(VISIT_AGENCIES),
];

export const DIVISION_FILTER_OPTIONS = [
  { label: "All divisions", value: "" },
  ...toOptions(MOF_DIVISIONS),
];
