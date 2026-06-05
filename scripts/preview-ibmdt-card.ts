#!/usr/bin/env npx tsx
/**
 * Preview the IBMDT Run summary card theme with mock data.
 * No database connection required.
 *
 * Usage: npx tsx scripts/preview-ibmdt-card.ts
 * Output: public/generated/preview-ibmdt-card.jpg
 */

import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

// ---- helpers (mirrors summary-card.service.ts) ----

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value < 10 && value % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function clampLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function fitFontSizeByLength(text: string, baseSize: number, maxCharsAtBase: number, minSize: number) {
  if (text.length <= maxCharsAtBase) return baseSize;
  return Math.max(minSize, Math.floor((baseSize * maxCharsAtBase) / text.length));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---- mock data ----

const mock = {
  displayName: "Nattawee",
  teamName: "IBMDT COO",
  bibNumber: "A-001",
  latestDistanceKm: 9.08,
  totalDistanceKm: 42.5,
  teamTotal: 156.25,
  projectTotal: 890.75,
  confirmedCount: 7,
  overallRankLabel: "#2",
  teamRankLabel: "#1",
  participantCount: 38,
  teamMemberCount: 8,
  projectShare: 4.77,
  teamShare: 27.2,
  timestamp: new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date()),
};

// ---- SVG builder ----

function buildIbmdtSvg() {
  const numberTextAttrs = `font-family="Noto Sans, Noto Sans Thai, sans-serif" font-feature-settings="'tnum' 1"`;
  const englishTextAttrs = `font-family="DejaVu Sans, Noto Sans, Arial, sans-serif"`;

  const displayName = escapeXml(clampLabel(mock.displayName, 18));
  const profileTeamName = escapeXml(clampLabel(mock.teamName, 26));
  const snapshotTeamName = escapeXml(clampLabel(mock.teamName, 18));

  const overallMetaText = `จาก ${mock.participantCount} คน`;
  const overallMetaFontSize = fitFontSizeByLength(overallMetaText, 20, 12, 14);

  const teamRankMetaText = `จาก ${mock.teamMemberCount} คน`;
  const teamRankMetaFontSize = fitFontSizeByLength(teamRankMetaText, 20, 11, 14);

  const teamTotalText = `${formatNumber(mock.teamTotal)} กม.`;
  const teamTotalFontSize = fitFontSizeByLength(teamTotalText, 40, 10, 26);

  return `
  <svg width="1080" height="1440" viewBox="0 0 1080 1440" xmlns="http://www.w3.org/2000/svg" font-family="'Noto Sans Thai', 'TlwgTypo', 'Garuda', sans-serif">
    <defs>
      <linearGradient id="ibmHdr" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#000b2f" />
        <stop offset="55%" stop-color="#002d9c" />
        <stop offset="100%" stop-color="#0f62fe" />
      </linearGradient>
      <radialGradient id="ibmHdrGlow" cx="84%" cy="22%" r="52%">
        <stop offset="0%" stop-color="#82cfff" stop-opacity="0.45" />
        <stop offset="100%" stop-color="#82cfff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ibmOrg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ff6900" />
        <stop offset="100%" stop-color="#ff832b" />
      </linearGradient>
      <linearGradient id="ibmFtr" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#001d6c" />
        <stop offset="100%" stop-color="#0530ad" />
      </linearGradient>
      <linearGradient id="ibmSkyline" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0053d6" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#001141" stop-opacity="0.9" />
      </linearGradient>
      <linearGradient id="speed" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#82cfff" stop-opacity="0" />
        <stop offset="25%" stop-color="#82cfff" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#0f62fe" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="roadLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#78a9ff" />
        <stop offset="100%" stop-color="#33b1ff" />
      </linearGradient>
      <pattern id="dotGrid" width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="#a6c8ff" opacity="0.35" />
      </pattern>
      <filter id="cShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#001141" flood-opacity="0.10" />
      </filter>
    </defs>

    <!-- Background -->
    <rect width="1080" height="1440" fill="#eaf1fb" />
    <rect width="1080" height="1440" fill="url(#dotGrid)" opacity="0.26" />

    <!-- Header -->
    <rect x="0" y="0" width="1080" height="376" fill="url(#ibmHdr)" />
    <rect x="0" y="0" width="1080" height="376" fill="url(#ibmHdrGlow)" />
    <circle cx="1020" cy="58" r="130" fill="#0f62fe" opacity="0.22" />
    <circle cx="978" cy="158" r="72" fill="#4589ff" opacity="0.18" />
    <circle cx="50" cy="316" r="96" fill="#002d9c" opacity="0.28" />
    <polygon points="0,0 270,0 148,376 0,376" fill="rgba(0,0,0,0.12)" />
    <g opacity="0.78" stroke="url(#speed)" stroke-linecap="round">
      <line x1="110" y1="150" x2="520" y2="110" stroke-width="6" />
      <line x1="80" y1="176" x2="498" y2="138" stroke-width="5" />
      <line x1="54" y1="202" x2="476" y2="167" stroke-width="4" />
      <line x1="34" y1="228" x2="456" y2="196" stroke-width="3" />
    </g>
    <g fill="url(#ibmSkyline)" opacity="0.72">
      <rect x="744" y="312" width="18" height="50" />
      <rect x="768" y="298" width="20" height="64" />
      <rect x="794" y="286" width="30" height="76" />
      <rect x="830" y="270" width="36" height="92" />
      <rect x="872" y="292" width="22" height="70" />
      <rect x="900" y="258" width="42" height="104" />
      <rect x="948" y="276" width="20" height="86" />
      <rect x="974" y="302" width="26" height="60" />
    </g>

    <!-- Brand bar -->
    <rect x="48" y="50" width="984" height="80" rx="22" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
    <rect x="68" y="64" width="156" height="52" rx="16" fill="url(#ibmOrg)" />
    <text x="146" y="99" text-anchor="middle" fill="#ffffff" font-size="34" font-weight="900" ${englishTextAttrs}>IBMDT</text>
    <text x="246" y="100" fill="#ffffff" font-size="50" font-weight="900" ${englishTextAttrs}>RUN</text>
    <text x="344" y="100" fill="rgba(255,255,255,0.75)" font-size="28">•  Running Report</text>

    <!-- Runner info -->
    <text x="68" y="194" fill="#a8c8ff" font-size="26" font-weight="700" ${englishTextAttrs}>RUNNER PROFILE</text>
    <text x="68" y="268" fill="#ffffff" font-size="64" font-weight="900">${displayName}</text>
    <text x="68" y="302" fill="#88b4f8" font-size="28">ทีม ${profileTeamName}  •  eBIB ${escapeXml(mock.bibNumber)}</text>

    <!-- Total Distance card (overlaps header bottom) -->
    <rect x="48" y="318" width="984" height="296" rx="36" fill="#ffffff" filter="url(#cShadow)" />
    <text x="88" y="382" fill="#697077" font-size="22" font-weight="700" ${englishTextAttrs}>TOTAL DISTANCE</text>
    <text x="88" y="518" fill="#001141" font-size="136" font-weight="900" ${numberTextAttrs}>${formatNumber(mock.totalDistanceKm)}</text>
    <text x="634" y="518" fill="#697077" font-size="40" font-weight="800" ${englishTextAttrs}>KM</text>
    <text x="88" y="568" fill="#878d96" font-size="28">ระยะสะสมส่วนตัวจากผลที่ยืนยันแล้วทั้งหมด</text>
    <rect x="770" y="372" width="224" height="164" rx="24" fill="#001d6c" />
    <text x="882" y="418" text-anchor="middle" fill="#82cfff" font-size="19" font-weight="700" ${englishTextAttrs}>OVERALL RANK</text>
    <text x="882" y="498" text-anchor="middle" fill="#ffffff" font-size="70" font-weight="900" ${numberTextAttrs}>${escapeXml(mock.overallRankLabel)}</text>
    <text x="882" y="528" text-anchor="middle" fill="#a6c8ff" font-size="${overallMetaFontSize}">${overallMetaText}</text>

    <!-- 3 stat cards -->
    <rect x="48" y="638" width="308" height="210" rx="28" fill="#ffffff" stroke="#dde3ed" />
    <text x="78" y="692" fill="#697077" font-size="22" font-weight="700">ระยะล่าสุด</text>
    <text x="78" y="780" fill="#001141" font-size="74" font-weight="900" ${numberTextAttrs}>${formatNumber(mock.latestDistanceKm)}</text>
    <text x="262" y="780" fill="#697077" font-size="28" font-weight="700">กม.</text>
    <text x="78" y="818" fill="#878d96" font-size="22">อัปเดตจากผลครั้งล่าสุด</text>

    <rect x="386" y="638" width="308" height="210" rx="28" fill="#ffffff" stroke="#dde3ed" />
    <text x="416" y="692" fill="#697077" font-size="22" font-weight="700">จำนวนครั้งที่ส่งผล</text>
    <text x="416" y="780" fill="#001141" font-size="74" font-weight="900" ${numberTextAttrs}>${mock.confirmedCount}</text>
    <text x="416" y="818" fill="#878d96" font-size="22">นับเฉพาะผลที่ยืนยันแล้ว</text>

    <rect x="724" y="638" width="308" height="210" rx="28" fill="#0f62fe" />
    <text x="754" y="692" fill="#a6c8ff" font-size="22" font-weight="700">สัดส่วนต่อโครงการ</text>
    <text x="754" y="780" fill="#ffffff" font-size="74" font-weight="900" ${numberTextAttrs}>${formatPercent(mock.projectShare)}</text>
    <text x="930" y="780" fill="#d0e2ff" font-size="28" font-weight="700">%</text>
    <text x="754" y="818" fill="#d0e2ff" font-size="22">ส่วนแบ่งจากยอดวิ่งรวมทั้งหมด</text>

    <!-- Team Snapshot -->
    <rect x="48" y="880" width="984" height="236" rx="32" fill="#ffffff" stroke="#dde3ed" />
    <text x="88" y="928" fill="#697077" font-size="22" font-weight="700" ${englishTextAttrs}>TEAM SNAPSHOT</text>
    <text x="88" y="990" fill="#001141" font-size="52" font-weight="850">${snapshotTeamName}</text>

    <rect x="88" y="1006" width="286" height="80" rx="20" fill="#edf5ff" stroke="#d0e2ff" />
    <text x="110" y="1038" fill="#697077" font-size="18" font-weight="700">ผลรวมทีม</text>
    <text x="110" y="1074" fill="#001141" font-size="${teamTotalFontSize}" font-weight="900" ${numberTextAttrs}>${teamTotalText}</text>

    <rect x="400" y="1006" width="286" height="80" rx="20" fill="#edf5ff" stroke="#d0e2ff" />
    <text x="422" y="1038" fill="#697077" font-size="18" font-weight="700">อันดับในทีม</text>
    <text x="422" y="1074" fill="#001141" font-size="38" font-weight="900" ${numberTextAttrs}>${escapeXml(mock.teamRankLabel)}</text>
    <text x="522" y="1074" fill="#8d929b" font-size="${teamRankMetaFontSize}">${teamRankMetaText}</text>

    <rect x="712" y="1006" width="286" height="80" rx="20" fill="#001d6c" />
    <text x="734" y="1038" fill="#82cfff" font-size="18" font-weight="700">สัดส่วนต่อทีม</text>
    <text x="734" y="1074" fill="#ffffff" font-size="42" font-weight="900" ${numberTextAttrs}>${formatPercent(mock.teamShare)}%</text>

    <!-- Project Overview Footer -->
    <rect x="48" y="1136" width="984" height="256" rx="36" fill="url(#ibmFtr)" filter="url(#cShadow)" />
    <path d="M116 1368 C 280 1254, 440 1216, 646 1186 C 770 1168, 892 1174, 1000 1212" fill="none" stroke="#ffffff" stroke-width="20" stroke-linecap="round" opacity="0.42" />
    <path d="M96 1392 C 258 1278, 426 1240, 632 1212 C 756 1194, 878 1200, 992 1238" fill="none" stroke="url(#roadLine)" stroke-width="16" stroke-linecap="round" opacity="0.46" />
    <path d="M110 1396 C 272 1284, 438 1248, 644 1222" fill="none" stroke="#0f62fe" stroke-width="7" stroke-linecap="round" opacity="0.35" />
    <g fill="#78a9ff" opacity="0.22">
      <rect x="780" y="1188" width="12" height="24" />
      <rect x="798" y="1178" width="12" height="34" />
      <rect x="816" y="1166" width="18" height="46" />
      <rect x="840" y="1176" width="12" height="36" />
      <rect x="858" y="1158" width="24" height="54" />
      <rect x="888" y="1170" width="14" height="42" />
    </g>
    <circle cx="956" cy="1214" r="110" fill="rgba(255,255,255,0.05)" />
    <circle cx="994" cy="1350" r="66" fill="rgba(255,255,255,0.06)" />
    <rect x="72" y="1216" width="462" height="152" rx="26" fill="rgba(0,17,65,0.34)" />
    <rect x="574" y="1212" width="400" height="146" rx="24" fill="rgba(0,17,65,0.30)" />
    <text x="88" y="1196" fill="#82cfff" font-size="22" font-weight="700" ${englishTextAttrs}>PROJECT OVERVIEW</text>
    <text x="88" y="1296" fill="#ffffff" font-size="80" font-weight="900" ${numberTextAttrs}>${formatNumber(mock.projectTotal)} กม.</text>
    <text x="88" y="1338" fill="#d0e2ff" font-size="26">ยอดวิ่งรวมของโครงการทั้งหมด</text>
    <text x="800" y="1210" text-anchor="middle" fill="#82cfff" font-size="22" font-weight="700" ${englishTextAttrs}>UPDATED</text>
    <text x="800" y="1276" text-anchor="middle" fill="#ffffff" font-size="36" font-weight="800" ${numberTextAttrs}>${escapeXml(mock.timestamp)}</text>
    <text x="800" y="1318" text-anchor="middle" fill="#d0e2ff" font-size="22" ${englishTextAttrs}>Generated by LINE OA IBMDT Run</text>
  </svg>`;
}

// ---- render ----

async function main() {
  const svg = buildIbmdtSvg();
  const outputDir = path.join(process.cwd(), "public", "generated");
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "preview-ibmdt-card.jpg");
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);

  console.log(`✓ Preview saved: ${outputPath}`);
}

main().catch((error) => {
  console.error("Preview failed:", error);
  process.exit(1);
});
