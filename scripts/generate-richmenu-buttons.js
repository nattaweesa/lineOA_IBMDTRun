const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// LINE Rich Menu: half-size 3-column
// Full image: 2500 x 843 px
// Each column: ~833 x 843 px (A=0-833, B=833-1666, C=1666-2500)
const TOTAL_W = 2500;
const TOTAL_H = 843;
const COL_W = Math.floor(TOTAL_W / 3); // 833
const DIVIDER = 4; // divider line width between columns

const outDir = path.join(process.cwd(), "assets", "richmenu-buttons");
fs.mkdirSync(outDir, { recursive: true });

// Column order: A=ลงทะเบียน, B=ส่งผลวิ่ง, C=ดูผล
const columns = [
  { title: "ลงทะเบียน", subtitle: "Register",      icon: "ID",  accent: "#0f766e", bg1: "#5eead4", bg2: "#0f766e" },
  { title: "ส่งผลวิ่ง",  subtitle: "Submit Result", icon: "GO",  accent: "#15803d", bg1: "#22c55e", bg2: "#15803d" },
  { title: "ดูผล",      subtitle: "View Result",   icon: "OK",  accent: "#1d4ed8", bg1: "#60a5fa", bg2: "#1d4ed8" },
];

// Build full SVG — stacked layout: icon top, Thai text middle, English subtitle bottom
function buildFullSvg() {
  const cols = columns.map((c, i) => {
    const x = i * COL_W;
    const midX = x + COL_W / 2;  // center of this column
    const iconCY = 280;           // icon circle center Y
    const titleY = 510;           // Thai title baseline
    const subtitleY = 640;        // English subtitle baseline
    return `
  <defs>
    <linearGradient id="bg${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.bg1}"/>
      <stop offset="100%" stop-color="${c.bg2}"/>
    </linearGradient>
    <clipPath id="clip${i}">
      <rect x="${x}" y="0" width="${COL_W}" height="${TOTAL_H}"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect x="${x}" y="0" width="${COL_W}" height="${TOTAL_H}" fill="url(#bg${i})"/>

  <!-- Card inner border -->
  <rect x="${x + 24}" y="24" width="${COL_W - 48}" height="${TOTAL_H - 48}" rx="60"
        fill="rgba(0,0,0,0.12)" clip-path="url(#clip${i})"/>
  <rect x="${x + 24}" y="24" width="${COL_W - 48}" height="${TOTAL_H - 48}" rx="60"
        fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="5" clip-path="url(#clip${i})"/>

  <!-- Icon circle (outer shadow) -->
  <circle cx="${midX}" cy="${iconCY}" r="130" fill="rgba(0,0,0,0.2)" clip-path="url(#clip${i})"/>
  <!-- Icon circle white bg -->
  <circle cx="${midX}" cy="${iconCY}" r="120" fill="#ffffff" opacity="0.95" clip-path="url(#clip${i})"/>
  <!-- Icon text -->
  <text x="${midX}" y="${iconCY + 44}" text-anchor="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-size="100" font-weight="900" fill="${c.accent}">${c.icon}</text>

  <!-- Thai title centered in column -->
  <g clip-path="url(#clip${i})">
    <text x="${midX}" y="${titleY}" text-anchor="middle"
          font-family="Noto Sans Thai, Thonburi, NotoSansThai, sans-serif"
          font-size="138" font-weight="900" fill="#ffffff">${c.title}</text>
  </g>

  <!-- English subtitle centered in column -->
  <text x="${midX}" y="${subtitleY}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="76" font-weight="700" fill="rgba(255,255,255,0.82)">${c.subtitle}</text>`;
  });

  const dividers = [1, 2].map(i => {
    const dx = i * COL_W;
    return `<rect x="${dx - DIVIDER / 2}" y="0" width="${DIVIDER}" height="${TOTAL_H}" fill="rgba(255,255,255,0.25)"/>`;
  }).join("\n");

  return `<svg width="${TOTAL_W}" height="${TOTAL_H}" viewBox="0 0 ${TOTAL_W} ${TOTAL_H}" xmlns="http://www.w3.org/2000/svg">
${cols.join("\n")}
${dividers}
</svg>`;
}

(async () => {
  const svg = buildFullSvg();
  const outPath = path.join(outDir, "richmenu_full.png");
  await sharp(Buffer.from(svg))
    .resize(TOTAL_W, TOTAL_H)
    .png()
    .toFile(outPath);
  console.log(`Generated ${outPath}  (${TOTAL_W}x${TOTAL_H})`);
  console.log();
  console.log("LINE Rich Menu areas (x, y, width, height):");
  console.log(`  A (ลงทะเบียน): x=0,    y=0, width=${COL_W},   height=${TOTAL_H}`);
  console.log(`  B (ส่งผลวิ่ง): x=${COL_W}, y=0, width=${COL_W},   height=${TOTAL_H}`);
  console.log(`  C (ดูผล):      x=${COL_W * 2}, y=0, width=${TOTAL_W - COL_W * 2}, height=${TOTAL_H}`);
})();
