// Week dates arrive as YYYY-MM-DD in Accra time (UTC+0); noon UTC keeps
// formatting on the right calendar day.
export function fromIsoDate(isoDate) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

const shortDayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
});

// "Mon 19 Oct to Sun 25 Oct 2026"
export function formatWeekRange(weeklyQr) {
  const end = fromIsoDate(weeklyQr.weekEndsOn);

  return `${shortDayFormatter.format(
    fromIsoDate(weeklyQr.weekStartsOn),
  )} to ${shortDayFormatter.format(end)} ${end.getUTCFullYear()}`;
}

// margin is the white border in QR modules; a reader needs about four
// modules of plain space around the code, inside or outside the image.
export async function createQrDataUrl(accessUrl, { margin = 4 } = {}) {
  const qrModule =
    await import("qrcode");

  const qrCode =
    qrModule.default || qrModule;

  if (
    typeof qrCode.toDataURL !==
    "function"
  ) {
    throw new Error(
      "The QR renderer is unavailable.",
    );
  }

  return await qrCode.toDataURL(
    accessUrl,
    {
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
      margin,
      type: "image/png",
      width: 768,
    },
  );
}
