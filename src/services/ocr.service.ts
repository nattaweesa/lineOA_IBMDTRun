import sharp from "sharp";
import { createWorker } from "tesseract.js";

type OcrResult = {
  detectedDistanceKm: number;
  sourceApp: string | null;
  text: string;
};

type Candidate = {
  value: number;
  score: number;
};

const KM_TOKEN_REGEX = /([0-9OoIlSBGgq.,:]{1,10})\s*(?:km|kilometer|kilometre|กม\.?)/gi;
const DISTANCE_LABELED_KM_REGEX = /distance(?:\s+time)?(?:\s+[0-9OoIlSBGgq:,]{3,12})?\s+([0-9OoIlSBGgq.,:]{1,10})\s*(?:km|kilometer|kilometre|กม\.?)/gi;

function normalizeText(text: string) {
  return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeNumericToken(token: string) {
  // Common OCR confusions: O->0, I/l->1, S->5, B->8, : and , as decimal separators.
  const replaced = token
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/[:;,]/g, ".")
    .replace(/[^0-9.]/g, "");

  const firstDot = replaced.indexOf(".");
  if (firstDot === -1) {
    return replaced;
  }

  return replaced.slice(0, firstDot + 1) + replaced.slice(firstDot + 1).replace(/\./g, "");
}

function scoreDistance(value: number, hasDecimal: boolean, nearDistanceKeyword: boolean, decimalShift = 0) {
  let score = 0;

  if (nearDistanceKeyword) {
    score += 35;
  }

  if (hasDecimal) {
    score += 25;
  }

  if (value > 0 && value <= 100) {
    score += 30;
  } else if (value > 100 && value <= 250) {
    score += 8;
  } else {
    score -= 25;
  }

  if (value >= 1 && value <= 60) {
    score += 15;
  }

  if (decimalShift > 0) {
    score -= decimalShift * 4;
  }

  return score;
}

function scoreContext(context: string) {
  let score = 0;

  if (/workout details|workout time/.test(context)) {
    score += 18;
  }

  if (/segment|segments/.test(context)) {
    score -= 24;
  }

  if (/active kilocalories|avg\. heart rate|total kilocalories/.test(context)) {
    score += 6;
  }

  return score;
}

function addCandidate(candidates: Candidate[], value: number, score: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 999) {
    return;
  }

  const rounded = Math.round(value * 100) / 100;
  const existing = candidates.find((item) => item.value === rounded);
  if (existing) {
    existing.score = Math.max(existing.score, score);
    return;
  }

  candidates.push({ value: rounded, score });
}

function extractDistanceWithHeuristics(text: string) {
  const normalized = text.toLowerCase();
  const candidates: Candidate[] = [];

  for (const match of normalized.matchAll(DISTANCE_LABELED_KM_REGEX)) {
    const rawToken = match[1] ?? "";
    const token = normalizeNumericToken(rawToken);
    if (!token) {
      continue;
    }

    const parsed = Number.parseFloat(token);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const context = normalized.slice(Math.max(0, matchIndex - 30), Math.min(normalized.length, matchIndex + 50));
    const hasDecimal = token.includes(".");

    addCandidate(candidates, parsed, scoreDistance(parsed, hasDecimal, true) + 40 + scoreContext(context));
  }

  for (const match of normalized.matchAll(KM_TOKEN_REGEX)) {
    const rawToken = match[1] ?? "";
    const token = normalizeNumericToken(rawToken);
    if (!token) {
      continue;
    }

    const parsed = Number.parseFloat(token);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const context = normalized.slice(Math.max(0, matchIndex - 25), Math.min(normalized.length, matchIndex + 25));
    const nearDistanceKeyword = /distance|ระยะ/.test(context);
    const hasDecimal = token.includes(".");

    addCandidate(candidates, parsed, scoreDistance(parsed, hasDecimal, nearDistanceKeyword) + scoreContext(context));

    // Heuristic for missing decimal point (e.g. 999 should likely be 9.99)
    if (!hasDecimal && parsed >= 100) {
      addCandidate(candidates, parsed / 10, scoreDistance(parsed / 10, true, nearDistanceKeyword, 1) + scoreContext(context));
      addCandidate(candidates, parsed / 100, scoreDistance(parsed / 100, true, nearDistanceKeyword, 2) + scoreContext(context));
      addCandidate(candidates, parsed / 1000, scoreDistance(parsed / 1000, true, nearDistanceKeyword, 3) + scoreContext(context));
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0].value;
}

function detectSourceApp(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("strava")) {
    return "strava";
  }

  if (lower.includes("workout details") || lower.includes("kilocalories")) {
    return "apple-fitness";
  }

  if (lower.includes("garmin") || lower.includes("pace") || lower.includes("elevation")) {
    return "garmin";
  }

  return null;
}

export async function analyzeRunningImage(imageBuffer: Buffer): Promise<OcrResult> {
  const processedBuffer = await sharp(imageBuffer)
    .rotate()
    .resize({ width: 2200, fit: "inside", withoutEnlargement: false })
    .grayscale()
    .normalize()
    .modulate({ brightness: 1.08, saturation: 0 })
    .sharpen({ sigma: 1.2 })
    .png()
    .toBuffer();

  const worker = await createWorker("eng");

  try {
    const result = await worker.recognize(processedBuffer);
    const text = normalizeText(result.data.text);
    const detectedDistanceKm = extractDistanceWithHeuristics(text);

    if (!detectedDistanceKm) {
      throw new Error("ไม่พบค่าระยะทางในภาพ กรุณาเลือกภาพที่มีคำว่า Distance หรือ KM ชัดเจน");
    }

    return {
      detectedDistanceKm,
      sourceApp: detectSourceApp(text),
      text,
    };
  } finally {
    await worker.terminate();
  }
}