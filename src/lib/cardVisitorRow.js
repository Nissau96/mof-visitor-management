// Card records use their own field names; the shared visitor tables
// expect these.
export function toVisitorRow(record) {
  return {
    email: record.email || "",
    fullName: record.fullName || "Unknown visitor",
    organization: record.organization || "",
    phone: record.phone || "",
    purpose: record.purpose || "",
    reference: record.referenceCode || "",
    visitorType: record.visitorType || null,
    bookedGuest: Boolean(record.bookedGuest),
  };
}
