import path from "node:path";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { publicUrl, saveBufferToFile } from "../utils/fs";
import sharp from "sharp";

type SummaryCardInput = {
  userId: string;
  variant?: SummaryCardVariant;
};

export type SummaryCardVariant = "corporate" | "sport";
export type SummaryCardNumberPreset = "modern" | "mono" | "thai-clean" | "thai-legacy";

type SummaryMetrics = {
  displayName: string;
  teamName: string;
  bibNumber: string;
  latestDistanceKm: number;
  totalDistanceKm: number;
  teamTotal: number;
  projectTotal: number;
  confirmedCount: number;
  overallRankLabel: string;
  teamRankLabel: string;
  participantCount: number;
  teamMemberCount: number;
  projectShare: number;
  teamShare: number;
  timestamp: string;
};

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
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function fitFontSizeByLength(text: string, baseSize: number, maxCharsAtBase: number, minSize: number) {
  if (text.length <= maxCharsAtBase) {
    return baseSize;
  }
  const scaled = Math.floor((baseSize * maxCharsAtBase) / text.length);
  return Math.max(minSize, scaled);
}

const NUMBER_FONT_PRESETS: Record<SummaryCardNumberPreset, string> = {
  modern: 'font-family="Noto Sans, Noto Sans Thai, sans-serif" font-feature-settings="\'tnum\' 1"',
  mono: 'font-family="Noto Sans Mono, monospace" font-feature-settings="\'tnum\' 1"',
  "thai-clean": 'font-family="Garuda, Noto Sans Thai, sans-serif" font-feature-settings="\'tnum\' 1"',
  "thai-legacy": 'font-family="Loma, TlwgTypist, Noto Sans Thai, sans-serif" font-feature-settings="\'tnum\' 1"',
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCorporateSvg(metrics: SummaryMetrics, numberTextAttrs: string) {
  return `
  <svg width="1080" height="1440" viewBox="0 0 1080 1440" xmlns="http://www.w3.org/2000/svg" font-family="'Noto Sans Thai', 'TlwgTypo', 'Garuda', sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f4f7f6" />
        <stop offset="100%" stop-color="#e7efec" />
      </linearGradient>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#173a4a" />
        <stop offset="100%" stop-color="#1f586f" />
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#38c6c0" />
        <stop offset="100%" stop-color="#7be495" />
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#0f2b37" flood-opacity="0.1" />
      </filter>
    </defs>

    <rect width="1080" height="1440" fill="url(#bg)" rx="52" />
    <rect x="48" y="44" width="984" height="336" rx="38" fill="url(#hero)" filter="url(#softShadow)" />
    <rect x="78" y="86" width="170" height="66" rx="16" fill="url(#accent)" />
    <text x="163" y="130" text-anchor="middle" fill="#133240" font-size="36" font-weight="800">IBMDT RUN</text>
    <text x="78" y="212" fill="#d6edf5" font-size="30" font-weight="700">RUNNER OVERVIEW</text>
    <text x="78" y="278" fill="#ffffff" font-size="74" font-weight="900">${escapeXml(metrics.displayName)}</text>
    <text x="78" y="326" fill="#b8dce8" font-size="30">ทีม ${escapeXml(metrics.teamName)}  •  eBIB ${escapeXml(metrics.bibNumber)}</text>

    <rect x="48" y="410" width="984" height="264" rx="34" fill="#ffffff" stroke="#d7e3df" filter="url(#softShadow)" />
    <text x="84" y="472" fill="#64746f" font-size="24" font-weight="700">TOTAL DISTANCE</text>
    <text x="84" y="588" fill="#173a4a" font-size="138" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.totalDistanceKm)}</text>
    <text x="640" y="588" fill="#64746f" font-size="42" font-weight="700">KM</text>
    <text x="84" y="632" fill="#7c8b87" font-size="28">ระยะสะสมส่วนตัวจากผลที่ยืนยันแล้วทั้งหมด</text>

    <rect x="760" y="470" width="230" height="158" rx="28" fill="#173a4a" />
    <text x="790" y="522" fill="#8ed0df" font-size="22" font-weight="700">OVERALL RANK</text>
    <text x="790" y="596" fill="#ffffff" font-size="76" font-weight="900" ${numberTextAttrs}>${escapeXml(metrics.overallRankLabel)}</text>
    <text x="790" y="626" fill="#b8dce8" font-size="22">จาก ${metrics.participantCount} คน</text>

    <rect x="48" y="706" width="308" height="208" rx="30" fill="#ffffff" stroke="#d7e3df" />
    <text x="78" y="760" fill="#687772" font-size="22" font-weight="700">ระยะล่าสุด</text>
    <text x="78" y="838" fill="#173a4a" font-size="72" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.latestDistanceKm)}</text>
    <text x="256" y="838" fill="#687772" font-size="26" font-weight="700">กม.</text>
    <text x="78" y="876" fill="#80908b" font-size="22">ผลวิ่งครั้งล่าสุดที่ยืนยัน</text>

    <rect x="386" y="706" width="308" height="208" rx="30" fill="#ffffff" stroke="#d7e3df" />
    <text x="416" y="760" fill="#687772" font-size="22" font-weight="700">จำนวนครั้งที่ส่งผล</text>
    <text x="416" y="838" fill="#173a4a" font-size="72" font-weight="900" ${numberTextAttrs}>${metrics.confirmedCount}</text>
    <text x="416" y="876" fill="#80908b" font-size="22">นับเฉพาะผลที่ยืนยันแล้ว</text>

    <rect x="724" y="706" width="308" height="208" rx="30" fill="#173a4a" />
    <text x="754" y="760" fill="#8ed0df" font-size="22" font-weight="700">สัดส่วนต่อโครงการ</text>
    <text x="754" y="838" fill="#ffffff" font-size="72" font-weight="900" ${numberTextAttrs}>${formatPercent(metrics.projectShare)}</text>
    <text x="926" y="838" fill="#b8dce8" font-size="26" font-weight="700">%</text>
    <text x="754" y="876" fill="#b8dce8" font-size="22">ส่วนแบ่งจากยอดวิ่งรวมทั้งหมด</text>

    <rect x="48" y="946" width="984" height="230" rx="34" fill="#ffffff" stroke="#d7e3df" />
    <text x="84" y="1006" fill="#687772" font-size="24" font-weight="700">TEAM SNAPSHOT</text>
    <text x="84" y="1068" fill="#173a4a" font-size="56" font-weight="850">${escapeXml(metrics.teamName)}</text>

    <rect x="84" y="1088" width="286" height="82" rx="22" fill="#f6fbf9" stroke="#dbe7e2" />
    <text x="106" y="1121" fill="#65756f" font-size="17" font-weight="700">ผลรวมทีม</text>
    <text x="106" y="1154" fill="#173a4a" font-size="42" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.teamTotal)} กม.</text>

    <rect x="396" y="1088" width="286" height="82" rx="22" fill="#f6fbf9" stroke="#dbe7e2" />
    <text x="418" y="1121" fill="#65756f" font-size="17" font-weight="700">อันดับในทีม</text>
    <text x="418" y="1154" fill="#173a4a" font-size="42" font-weight="900" ${numberTextAttrs}>${escapeXml(metrics.teamRankLabel)}</text>
    <text x="530" y="1154" fill="#7f8e89" font-size="20">จาก ${metrics.teamMemberCount} คน</text>

    <rect x="708" y="1088" width="286" height="82" rx="22" fill="#173a4a" />
    <text x="730" y="1121" fill="#8ed0df" font-size="17" font-weight="700">สัดส่วนต่อทีม</text>
    <text x="730" y="1154" fill="#ffffff" font-size="42" font-weight="900" ${numberTextAttrs}>${formatPercent(metrics.teamShare)}%</text>

    <rect x="48" y="1206" width="984" height="186" rx="30" fill="url(#hero)" filter="url(#softShadow)" />
    <text x="84" y="1264" fill="#8ed0df" font-size="22" font-weight="700">PROJECT OVERVIEW</text>
    <text x="84" y="1332" fill="#ffffff" font-size="72" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.projectTotal)} กม.</text>
    <text x="84" y="1368" fill="#bddde7" font-size="24">ยอดวิ่งรวมของโครงการทั้งหมด</text>
    <text x="786" y="1272" text-anchor="middle" fill="#bddde7" font-size="22" font-weight="700">UPDATED</text>
    <text x="786" y="1320" text-anchor="middle" fill="#ffffff" font-size="34" font-weight="800" ${numberTextAttrs}>${escapeXml(metrics.timestamp)}</text>
    <text x="786" y="1360" text-anchor="middle" fill="#bddde7" font-size="22">Generated by LINE OA IBMDT Run</text>
  </svg>`;
}

function buildSportSvg(metrics: SummaryMetrics, numberTextAttrs: string) {
  const englishTextAttrs = 'font-family="DejaVu Sans, Noto Sans, Arial, sans-serif"';
  const displayName = escapeXml(clampLabel(metrics.displayName, 18));
  const profileTeamName = escapeXml(clampLabel(metrics.teamName, 26));
  const snapshotTeamName = escapeXml(clampLabel(metrics.teamName, 14));

  const overallMetaText = `จาก ${metrics.participantCount} คน`;
  const overallMetaFontSize = fitFontSizeByLength(overallMetaText, 22, 12, 16);

  const teamRankMetaText = `จาก ${metrics.teamMemberCount} คน`;
  const teamRankMetaFontSize = fitFontSizeByLength(teamRankMetaText, 20, 11, 14);

  const teamTotalText = `${formatNumber(metrics.teamTotal)} กม.`;
  const teamTotalFontSize = fitFontSizeByLength(teamTotalText, 42, 10, 28);

  return `
  <svg width="1080" height="1440" viewBox="0 0 1080 1440" xmlns="http://www.w3.org/2000/svg" font-family="'Noto Sans Thai', 'TlwgTypo', 'Garuda', sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0e3d32" />
        <stop offset="50%" stop-color="#186c57" />
        <stop offset="100%" stop-color="#edf3e9" />
      </linearGradient>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#123f35" />
        <stop offset="100%" stop-color="#1d725c" />
      </linearGradient>
      <linearGradient id="warm" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f9c467" />
        <stop offset="100%" stop-color="#ff8a4a" />
      </linearGradient>
      <filter id="sportShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#0f2e26" flood-opacity="0.2" />
      </filter>
    </defs>

    <rect width="1080" height="1440" fill="#edf2e9" rx="50" />
    <rect x="0" y="0" width="1080" height="430" fill="url(#bg)" rx="50" />
    <circle cx="930" cy="136" r="136" fill="#f8c96e" opacity="0.16" />
    <circle cx="972" cy="194" r="84" fill="#fff4cc" opacity="0.32" />
    <circle cx="120" cy="126" r="98" fill="#5bc9a3" opacity="0.22" />

    <rect x="52" y="58" width="976" height="86" rx="26" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.14)" />
    <rect x="82" y="76" width="128" height="54" rx="18" fill="url(#warm)" />
    <text x="146" y="112" text-anchor="middle" fill="#1c3c33" font-size="38" font-weight="800" ${englishTextAttrs}>VAYU</text>
    <text x="240" y="112" fill="#ffffff" font-size="58" font-weight="900" ${englishTextAttrs}>Running Dashboard</text>
    <text x="240" y="145" fill="#d2ece0" font-size="26" font-weight="600">สรุปผลวิ่งสะสมจาก LINE OA แบบเรียลไทม์</text>

    <text x="86" y="204" fill="#d8eee3" font-size="30" font-weight="700" ${englishTextAttrs}>RUNNER PROFILE</text>
    <text x="86" y="262" fill="#ffffff" font-size="64" font-weight="900">${displayName}</text>
    <text x="86" y="306" fill="#bfe4d7" font-size="30">ทีม ${profileTeamName}  •  eBIB ${escapeXml(metrics.bibNumber)}</text>

    <rect x="52" y="316" width="976" height="280" rx="38" fill="#fbfcfb" filter="url(#sportShadow)" />
    <text x="88" y="384" fill="#5f716a" font-size="24" font-weight="700" ${englishTextAttrs}>TOTAL DISTANCE</text>
    <text x="88" y="500" fill="#134338" font-size="132" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.totalDistanceKm)}</text>
    <text x="620" y="500" fill="#5f716a" font-size="38" font-weight="800" ${englishTextAttrs}>KM</text>
    <text x="88" y="548" fill="#778a83" font-size="30">ระยะสะสมส่วนตัวจากผลที่ยืนยันแล้วทั้งหมด</text>

    <rect x="782" y="382" width="204" height="134" rx="24" fill="#134338" />
    <text x="808" y="425" fill="#89d3b7" font-size="19" font-weight="700" ${englishTextAttrs}>OVERALL RANK</text>
    <text x="808" y="485" fill="#ffffff" font-size="62" font-weight="900" ${numberTextAttrs}>${escapeXml(metrics.overallRankLabel)}</text>
    <text x="808" y="512" fill="#c3e8da" font-size="${Math.max(14, overallMetaFontSize - 2)}">${overallMetaText}</text>

    <rect x="52" y="632" width="308" height="206" rx="30" fill="#ffffff" stroke="#d8e4de" />
    <text x="82" y="686" fill="#677973" font-size="22" font-weight="700">ระยะล่าสุด</text>
    <text x="82" y="764" fill="#134338" font-size="74" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.latestDistanceKm)}</text>
    <text x="258" y="764" fill="#677973" font-size="26" font-weight="700">กม.</text>
    <text x="82" y="802" fill="#81928c" font-size="22">อัปเดตจากผลครั้งล่าสุด</text>

    <rect x="386" y="632" width="308" height="206" rx="30" fill="#ffffff" stroke="#d8e4de" />
    <text x="416" y="686" fill="#677973" font-size="22" font-weight="700">จำนวนครั้งที่ส่งผล</text>
    <text x="416" y="764" fill="#134338" font-size="74" font-weight="900" ${numberTextAttrs}>${metrics.confirmedCount}</text>
    <text x="416" y="802" fill="#81928c" font-size="22">นับเฉพาะผลที่ยืนยันแล้ว</text>

    <rect x="720" y="632" width="308" height="206" rx="30" fill="#134338" />
    <text x="750" y="686" fill="#89d3b7" font-size="22" font-weight="700">สัดส่วนต่อโครงการ</text>
    <text x="750" y="764" fill="#ffffff" font-size="74" font-weight="900" ${numberTextAttrs}>${formatPercent(metrics.projectShare)}</text>
    <text x="928" y="764" fill="#c3e8da" font-size="26" font-weight="700">%</text>
    <text x="750" y="802" fill="#c3e8da" font-size="22">ส่วนแบ่งจากยอดวิ่งรวมทั้งหมด</text>

    <rect x="52" y="870" width="976" height="230" rx="34" fill="#ffffff" stroke="#d8e4de" />
    <text x="88" y="932" fill="#677973" font-size="24" font-weight="700" ${englishTextAttrs}>TEAM SNAPSHOT</text>
    <text x="88" y="994" fill="#134338" font-size="56" font-weight="850">${snapshotTeamName}</text>

    <rect x="88" y="1012" width="286" height="84" rx="22" fill="#f5faf8" stroke="#dbe7e2" />
    <text x="110" y="1046" fill="#65756f" font-size="18" font-weight="700">ผลรวมทีม</text>
    <text x="110" y="1080" fill="#134338" font-size="${teamTotalFontSize}" font-weight="900" ${numberTextAttrs}>${teamTotalText}</text>

    <rect x="400" y="1012" width="286" height="84" rx="22" fill="#f5faf8" stroke="#dbe7e2" />
    <text x="422" y="1046" fill="#65756f" font-size="18" font-weight="700">อันดับในทีม</text>
    <text x="422" y="1080" fill="#134338" font-size="38" font-weight="900" ${numberTextAttrs}>${escapeXml(metrics.teamRankLabel)}</text>
    <text x="520" y="1080" fill="#7d8d88" font-size="${teamRankMetaFontSize}">${teamRankMetaText}</text>

    <rect x="712" y="1012" width="286" height="84" rx="22" fill="#134338" />
    <text x="734" y="1046" fill="#89d3b7" font-size="18" font-weight="700">สัดส่วนต่อทีม</text>
    <text x="734" y="1080" fill="#ffffff" font-size="42" font-weight="900" ${numberTextAttrs}>${formatPercent(metrics.teamShare)}%</text>

    <rect x="52" y="1132" width="976" height="238" rx="36" fill="url(#hero)" filter="url(#sportShadow)" />
    <text x="88" y="1196" fill="#89d3b7" font-size="24" font-weight="700" ${englishTextAttrs}>PROJECT OVERVIEW</text>
    <text x="88" y="1270" fill="#ffffff" font-size="78" font-weight="900" ${numberTextAttrs}>${formatNumber(metrics.projectTotal)} กม.</text>
    <text x="88" y="1310" fill="#c3e8da" font-size="26">ยอดวิ่งรวมของโครงการทั้งหมด</text>
    <text x="800" y="1212" text-anchor="middle" fill="#c3e8da" font-size="24" font-weight="700" ${englishTextAttrs}>UPDATED</text>
    <text x="800" y="1270" text-anchor="middle" fill="#ffffff" font-size="38" font-weight="800" ${numberTextAttrs}>${escapeXml(metrics.timestamp)}</text>
    <text x="800" y="1314" text-anchor="middle" fill="#c3e8da" font-size="22" ${englishTextAttrs}>Generated by LINE OA IBMDT Run</text>
  </svg>`;
}

async function collectSummaryMetrics(userId: string): Promise<SummaryMetrics> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const [projectAggregate, confirmedCount, rankedUsers] = await Promise.all([
    prisma.submission.aggregate({
      _sum: { confirmedDistanceKm: true },
      where: { status: "CONFIRMED" },
    }),
    prisma.submission.count({
      where: {
        userId,
        status: "CONFIRMED",
      },
    }),
    prisma.user.findMany({
      where: { totalDistanceKm: { gt: 0 } },
      select: {
        id: true,
        teamName: true,
        totalDistanceKm: true,
      },
      orderBy: [{ totalDistanceKm: "desc" }, { updatedAt: "asc" }],
    }),
  ]);

  const teamAggregate = user.teamName
    ? await prisma.submission.aggregate({
        _sum: { confirmedDistanceKm: true },
        where: {
          status: "CONFIRMED",
          user: { teamName: user.teamName },
        },
      })
    : null;

  const projectTotal = projectAggregate._sum.confirmedDistanceKm ?? 0;
  const teamTotal = teamAggregate?._sum.confirmedDistanceKm ?? user.totalDistanceKm;
  const overallRank = rankedUsers.findIndex((entry) => entry.id === user.id) + 1;
  const teamRank = user.teamName
    ? rankedUsers.filter((entry) => entry.teamName === user.teamName).findIndex((entry) => entry.id === user.id) + 1
    : 0;
  const projectShare = projectTotal > 0 ? (user.totalDistanceKm / projectTotal) * 100 : 0;
  const teamShare = teamTotal > 0 ? (user.totalDistanceKm / teamTotal) * 100 : 0;
  const teamMemberCount = user.teamName
    ? rankedUsers.filter((entry) => entry.teamName === user.teamName).length
    : 0;
  const participantCount = rankedUsers.length;
  const timestamp = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());

  return {
    displayName: user.displayName ?? "LINE Member",
    teamName: user.teamName ?? "ยังไม่ระบุทีม",
    bibNumber: user.bibNumber ?? "-",
    latestDistanceKm: user.latestDistanceKm,
    totalDistanceKm: user.totalDistanceKm,
    teamTotal,
    projectTotal,
    confirmedCount,
    overallRankLabel: overallRank > 0 ? `#${overallRank}` : "-",
    teamRankLabel: teamRank > 0 ? `#${teamRank}` : "-",
    participantCount,
    teamMemberCount,
    projectShare,
    teamShare,
    timestamp,
  };
}

export async function generateSummaryCard({ userId, variant = "sport" }: SummaryCardInput) {
  const numberTextAttrs = NUMBER_FONT_PRESETS.modern;
  const metrics = await collectSummaryMetrics(userId);
  const svg = variant === "corporate"
    ? buildCorporateSvg(metrics, numberTextAttrs)
    : buildSportSvg(metrics, numberTextAttrs);

  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const fileName = `${userId}-summary-${variant}.jpg`;
  const outputPath = path.join(process.cwd(), "public", "generated", fileName);

  await saveBufferToFile(outputPath, buffer);

  return {
    filePath: outputPath,
    url: publicUrl(env.BASE_URL, `/generated/${fileName}`),
  };
}

export async function generateSummaryCardVariants({ userId }: { userId: string }) {
  const [corporate, sport] = await Promise.all([
    generateSummaryCard({ userId, variant: "corporate" }),
    generateSummaryCard({ userId, variant: "sport" }),
  ]);

  return { corporate, sport };
}

export async function generateSummaryCardNumberPresetPreviews({
  userId,
  variant = "sport",
}: {
  userId: string;
  variant?: SummaryCardVariant;
}) {
  const metrics = await collectSummaryMetrics(userId);
  const presets = Object.keys(NUMBER_FONT_PRESETS) as SummaryCardNumberPreset[];

  const rendered = await Promise.all(
    presets.map(async (preset) => {
      const numberTextAttrs = NUMBER_FONT_PRESETS[preset];
      const svg = variant === "corporate"
        ? buildCorporateSvg(metrics, numberTextAttrs)
        : buildSportSvg(metrics, numberTextAttrs);

      const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
      const fileName = `${userId}-summary-${variant}-${preset}.png`;
      const outputPath = path.join(process.cwd(), "public", "generated", fileName);

      await saveBufferToFile(outputPath, buffer);
      return {
        preset,
        filePath: outputPath,
        url: publicUrl(env.BASE_URL, `/generated/${fileName}`),
      };
    }),
  );

  return rendered;
}