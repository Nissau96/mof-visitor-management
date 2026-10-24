// Draws the reception poster (seal, title, QR code, PEER values) onto a
// canvas so "Download PNG" saves the whole poster, not just the QR code.
// Colours mirror the on-screen poster in StaffWeeklyQrPage.

const WIDTH = 1240;
const HEIGHT = 1754; // A4 portrait at ~150 dpi
const TEAL = "#134e4a";
const TEAL_DEEP = "#0f403c";
const MINT = "#ccfbf1";
const FRAME = "#e6f6f4";
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

// Layout (px). The PEER band fills everything below the QR section.
const SEAL_SIZE = 150;
const QR_TOP = 440;
const FRAME_SIZE = 560;
const QR_SIZE = 490;
const PEER_TOP = 1150;

// Crop of the PEER artwork that drops its empty margins.
const PEER_CROP = { height: 717, width: 1472, x: 100, y: 90 };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("A poster image could not be loaded."));
    image.src = src;
  });
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function centredText(context, text, y, font, color) {
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(text, WIDTH / 2, y);
}

export async function renderPosterPng({
  peerSrc,
  qrSrc,
  sealSrc,
  validityLabel,
}) {
  const [seal, qr, peer] = await Promise.all([
    loadImage(sealSrc),
    loadImage(qrSrc),
    loadImage(peerSrc),
  ]);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");

  // Header band
  context.fillStyle = TEAL;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.drawImage(seal, (WIDTH - SEAL_SIZE) / 2, 50, SEAL_SIZE, SEAL_SIZE);

  centredText(context, "Visitor Registration", 300, `800 76px ${FONT}`, "#ffffff");
  centredText(
    context,
    "Scan to access the visitor management application.",
    355,
    `500 32px ${FONT}`,
    MINT,
  );
  centredText(context, validityLabel, 400, `600 24px ${FONT}`, MINT);

  // QR section
  context.fillStyle = TEAL_DEEP;
  context.fillRect(0, QR_TOP, WIDTH, PEER_TOP - QR_TOP);

  centredText(context, "Scan QR Code", QR_TOP + 80, `800 44px ${FONT}`, "#ffffff");

  const frameY = QR_TOP + 110;
  context.fillStyle = FRAME;
  roundedRect(context, (WIDTH - FRAME_SIZE) / 2, frameY, FRAME_SIZE, FRAME_SIZE, 44);
  context.fill();

  context.imageSmoothingEnabled = false;
  context.drawImage(
    qr,
    (WIDTH - QR_SIZE) / 2,
    frameY + (FRAME_SIZE - QR_SIZE) / 2,
    QR_SIZE,
    QR_SIZE,
  );
  context.imageSmoothingEnabled = true;

  // PEER values artwork on its own white band (its background is white).
  context.fillStyle = "#fefefe";
  context.fillRect(0, PEER_TOP, WIDTH, HEIGHT - PEER_TOP);
  context.drawImage(
    peer,
    PEER_CROP.x,
    PEER_CROP.y,
    PEER_CROP.width,
    PEER_CROP.height,
    0,
    PEER_TOP,
    WIDTH,
    HEIGHT - PEER_TOP,
  );

  return canvas.toDataURL("image/png");
}
