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

// Stored values. Visits keep the short code; visitors see the full
// name from VISIT_AGENCY_LABELS. The database accepts the same list.
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
  "VFM",
  "NDPC",
  "PFM4SD",
  "Accra Kumasi Project Office",
  "Ghana Thermal Project Office",
];

export const VISIT_AGENCY_LABELS = Object.freeze({
  [MINISTRY_OF_FINANCE_AGENCY]: MINISTRY_OF_FINANCE_AGENCY,
  GCX: "Ghana Commodity Exchange (GCX)",
  GIFMIS:
    "Ghana Integrated Financial Management System (GIFMIS)",
  GIIF: "Ghana Infrastructure Investment Fund (GIIF)",
  GIPC: "Ghana Investment Promotion Centre (GIPC)",
  IAA: "Internal Audit Agency (IAA)",
  ITAB: "Independent Tax Appeals Board (ITAB)",
  MIIF: "Minerals Income Investment Fund (MIIF)",
  NDPC: "National Development Planning Commission (NDPC)",
  PFM4SD:
    "Public Financial Management for Service Delivery (PFM4SD)",
  PPA: "Public Procurement Authority (PPA)",
  VFM: "Value for Money Office (VFM)",
});

export const MOF_DIVISIONS = [
  "Budget Office",
  "Central Tender Review Committee",
  "External Resource Mobilisation Division",
  "Financial Sector Division",
  "Finance Division",
  "Human Capital & General Administration Division",
  "Internal Audit Directorate",
  "Legal Directorate",
  "Office of the Chief Director",
  "Office of the Coordinating Director (Operation)",
  "Office of the Coordinating Director (Technical)",
  "Office of the Deputy Minister",
  "Office of the Minister",
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

// Divisions a meeting can be hosted by. Headquarters is for meetings
// only; visitor registration keeps MOF_DIVISIONS.
export const MEETING_HOST_DIVISIONS = [
  "Ministry Headquarters",
  ...MOF_DIVISIONS,
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

// ------------------------------------------------------------
// Floors
// ------------------------------------------------------------
// Stored values are the same in both towers; the labels differ where
// a floor holds conference rooms. A meeting stores its floor; a walk-in
// visit's floor comes from its destination.

export const FLOOR_VALUES = Object.freeze([
  "ground",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
]);

const FLOOR_LABEL_OVERRIDES = Object.freeze({
  [TOWER_1]: Object.freeze({
    7: "Floor 7 – K.A. Gbedemah Conference Rooms",
  }),
  [TOWER_2]: Object.freeze({
    5: "Floor 5 – Conference rooms",
    7: "Floor 7 – Conference rooms",
  }),
});

export function getFloorLabel(floor, tower) {
  if (!FLOOR_VALUES.includes(floor)) {
    return "";
  }

  if (floor === "ground") {
    return "Ground floor";
  }

  return (
    FLOOR_LABEL_OVERRIDES[tower]?.[floor] ||
    `Floor ${floor}`
  );
}

export function getFloorOptions(tower) {
  return FLOOR_VALUES.map((value) => ({
    label: getFloorLabel(value, tower),
    value,
  }));
}

const AGENCY_FLOORS = Object.freeze({
  "Accra Kumasi Project Office": "4",
  GCX: "5",
  GIFMIS: "4",
  GIIF: "4",
  GIPC: "2",
  "Ghana Thermal Project Office": "4",
  IAA: "1",
  ITAB: "1",
  NDPC: "3",
  PFM4SD: "4",
  PPA: "5",
  VFM: "6",
});

const DIVISION_FLOORS = Object.freeze({
  "Budget Office": "3",
  "Central Tender Review Committee": "2",
  "External Resource Mobilisation Division": "4",
  "Finance Division": "1",
  "Financial Sector Division": "2",
  "Human Capital & General Administration Division": "1",
  "Internal Audit Directorate": "3",
  "Legal Directorate": "1",
  "Office of the Chief Director": "6",
  "Office of the Coordinating Director (Operation)": "5",
  "Office of the Coordinating Director (Technical)": "5",
  "Office of the Deputy Minister": "6",
  "Office of the Minister": "6",
  "PFM Compliance Division": "3",
  [PFM_SYSTEMS_DIVISION]: "4",
  "Policy Coordination Monitoring & Evaluation Division": "2",
  "Procurement Division": "1",
  "Public Debt Management Office": "4",
  "Public Investment & Asset Division": "3",
  "Real Sector Division": "5",
  "Research Division": "5",
  "Revenue Policy Division": "2",
  "Unclaimed Fund Division": "1",
});

// Floor of an agency or Ministry division, or "" when it is not known
// (Ministry Headquarters, or an agency without a recorded floor).
export function resolveDestinationFloor(agency, division) {
  if (agency === MINISTRY_OF_FINANCE_AGENCY) {
    return DIVISION_FLOORS[division] || "";
  }

  return AGENCY_FLOORS[agency] || "";
}

// ------------------------------------------------------------
// Wi-Fi access
// ------------------------------------------------------------

export const WIFI_ACCESS_OPTIONS = Object.freeze([
  Object.freeze({
    label: "No, I don't need Wi-Fi",
    value: "no",
  }),
  Object.freeze({
    label: "Yes, I need Wi-Fi access",
    value: "yes",
  }),
]);

// The same answer, asked once for a whole meeting.
export const MEETING_WIFI_OPTIONS = Object.freeze([
  Object.freeze({
    label: "No, guests don't need Wi-Fi",
    value: "no",
  }),
  Object.freeze({
    label: "Yes, guests need Wi-Fi access",
    value: "yes",
  }),
]);

export const WIFI_ACCESS_VALUES =
  WIFI_ACCESS_OPTIONS.map((option) => option.value);

export function wifiAccessToBoolean(value) {
  if (value === "yes") {
    return true;
  }

  return value === "no" ? false : null;
}

export function getTowerLabel(tower) {
  return (
    TOWER_OPTIONS.find(
      (option) => option.value === tower,
    )?.label || "Unknown tower"
  );
}