// Draws the app icons (the </> mark in lime on ink) with sharp, which Next
// already installs. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const mark = (size, pad) => {
  const s = size, p = pad, w = s - 2 * p;
  const stroke = Math.round(w * 0.085);
  // "<", "/", ">" drawn as strokes so no font is needed.
  const x = (f) => p + f * w, y = (f) => p + f * w;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#0a0a0a"/>
  <g fill="none" stroke="#32cd32" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${x(0.32)} ${y(0.3)} L${x(0.12)} ${y(0.5)} L${x(0.32)} ${y(0.7)}"/>
    <path d="M${x(0.58)} ${y(0.24)} L${x(0.42)} ${y(0.76)}"/>
    <path d="M${x(0.68)} ${y(0.3)} L${x(0.88)} ${y(0.5)} L${x(0.68)} ${y(0.7)}"/>
  </g>
</svg>`;
};

const out = [
  ["public/icons/icon-192.png", 192, 28],
  ["public/icons/icon-512.png", 512, 76],
  ["public/icons/maskable-512.png", 512, 130],
  ["public/icons/apple-touch-icon.png", 180, 28],
];
for (const [file, size, pad] of out) await sharp(Buffer.from(mark(size, pad))).png().toFile(file);
console.log("icons written");

// Status-bar icon for notifications (Android shows only its shape, so it is
// white on transparent).
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <g fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 26 L10 48 L30 70"/><path d="M56 18 L40 78"/><path d="M66 26 L86 48 L66 70"/>
  </g>
</svg>`;
await sharp(Buffer.from(badge)).png().toFile("public/icons/badge-96.png");
console.log("badge written");
