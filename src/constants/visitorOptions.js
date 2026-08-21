export const MINISTRY_OF_FINANCE_AGENCY =
  "Ministry of Finance (MoF)";

export const PFM_SYSTEMS_DIVISION =
  "PFM Systems Division";

export const MEETING_PURPOSE = "Meeting";

export const CUSTOM_MEETING_OPTION = "custom-meeting";

export const TOWER_1 = "tower_1";
export const TOWER_2 = "tower_2";

export const TOWER_OPTIONS = Object.freeze([
  Object.freeze({
    label: "Tower 1",
    value: TOWER_1,
  }),
  Object.freeze({
    label: "Tower 2",
    value: TOWER_2,
  }),
]);

export const VISIT_TOWER_VALUES =
  TOWER_OPTIONS.map((tower) => tower.value);

export const VISIT_AGENCIES = [
  MINISTRY_OF_FINANCE_AGENCY,
  "IAA",
  "ITAB",
  "GIPC",
  "GCX",
  "GIFMIS",
  "GIIF",
  "MIIF",
  "PPA",
];

export const MOF_DIVISIONS = [
  "Budget Office",
  "External Resource Mobilisation Division",
  "Financial Sector Division",
  "Finance Division",
  "Human Capital & General Administration Division",
  "Internal Audit Directorate",
  "Legal Directorate",
  "PFM Compliance Division",
  PFM_SYSTEMS_DIVISION,
  "Policy Coordination Monitoring & Evaluation Division",
  "Procurement Division",
  "Public Debt Management Office",
  "Public Investment & Asset Division",
  "Real Sector Division",
  "Research Division",
  "Revenue Policy Division",
  "Unclaimed Fund Division",
];

export const VISIT_PURPOSES = [
  MEETING_PURPOSE,
  "Follow up",
  "SOD / SOL",
  "PUD / Delivery",
  "Personal",
  "Visit",
  "Official",
];

export const MEETING_SCHEDULE_TYPES = [
  "single",
  "continuous",
  "weekly",
];

export function resolveVisitTower(
  agency,
  division,
) {
  if (
    agency === MINISTRY_OF_FINANCE_AGENCY &&
    division !== PFM_SYSTEMS_DIVISION
  ) {
    return TOWER_2;
  }

  return TOWER_1;
}

export function getTowerLabel(tower) {
  return (
    TOWER_OPTIONS.find(
      (option) => option.value === tower,
    )?.label || "Unknown tower"
  );
}