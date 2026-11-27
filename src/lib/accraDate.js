const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
});

// YYYY-MM-DD for the given moment on the Accra calendar.
export function getAccraIsoDate(date = new Date()) {
  return isoDateFormatter.format(date);
}
