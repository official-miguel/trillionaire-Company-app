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
