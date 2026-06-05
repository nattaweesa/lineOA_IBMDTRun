import sharp from "sharp";
import { createWorker } from "tesseract.js";

type OcrResult = {
  detectedDistanceKm: number;
  sourceApp: string | null;
  text: string;
  confidence: number;
};

type Candidate = {
  value: number;
  score: number;
  source: string;
  context: string;
};

const MAX_REASONABLE_DISTANCE_KM = 100;
const MIN_ACCEPTED_CANDIDATE_SCORE = 45;
const STRONG_CANDIDATE_SCORE = 100;
const KM_TOKEN_REGEX = /([0-9OoIlSBGgq.,:]{1,10})\s*(?:km|kilometer|kilometre|กม\.?)/gi;
const DISTANCE_LABELED_KM_REGEX = /(?:distance|dist\.?|ระยะทาง|ระยะ)(?:\s+time)?(?:\s+[0-9OoIlSBGgq:,]{3,12})?\s+([0-9OoIlSBGgq.,:]{1,10})\s*(?:km|kilometer|kilometre|กม\.?)/gi;

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

  if (value <= 0 || value > MAX_REASONABLE_DISTANCE_KM) {
    return -1000;
  }

  if (nearDistanceKeyword) {
    score += 35;
  }

  if (hasDecimal) {
    score += 25;
  }

  score += 30;

  if (value >= 1 && value <= 60) {
    score += 15;
  }

  if (decimalShift > 0) {
    score -= decimalShift === 1 ? 18 : 4 + decimalShift * 2;
  }

  return score;
}

function scoreContext(context: string) {
  let score = 0;

  if (/distance|dist\.?|ระยะทาง|ระยะ/.test(context)) {
    score += 35;
  }

  if (/workout details|workout time|activity details/.test(context)) {
    score += 18;
  }

  if (/total distance|distance travelled|run distance/.test(context)) {
    score += 30;
  }

  if (/segment|segments|split|splits|lap|laps/.test(context)) {
    score -= 28;
  }

  if (/pace|avg pace|average pace|min\/km|\/km/.test(context)) {
    score -= 42;
  }

  if (/heart rate|avg\. heart rate|bpm|calorie|calories|kilocalories|kcal|elevation|gain|steps/.test(context)) {
    score -= 40;
  }

  if (/duration|time|moving time|elapsed time/.test(context) && !/distance/.test(context)) {
    score -= 20;
  }

  return score;
}

function addCandidate(candidates: Candidate[], value: number, score: number, source: string, context: string) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_REASONABLE_DISTANCE_KM || score < -100) {
    return;
  }

  const rounded = Math.round(value * 100) / 100;
  const existing = candidates.find((item) => item.value === rounded);
  if (existing) {
    if (score >= existing.score) {
      existing.score = score;
      existing.source = source;
      existing.context = context;
    }
    return;
  }

  candidates.push({ value: rounded, score, source, context });
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

    addCandidate(
      candidates,
      parsed,
      scoreDistance(parsed, hasDecimal, true) + 40 + scoreContext(context),
      "distance-label",
      context,
    );
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
    const context = normalized.slice(Math.max(0, matchIndex - 40), Math.min(normalized.length, matchIndex + 40));
    const nearDistanceKeyword = /distance|dist\.?|ระยะ/.test(context);
    const hasDecimal = token.includes(".");

    addCandidate(
      candidates,
      parsed,
      scoreDistance(parsed, hasDecimal, nearDistanceKeyword) + scoreContext(context),
      "km-token",
      context,
    );

    // Heuristic for missing decimal point (e.g. 999 should likely be 9.99)
    if (!hasDecimal && parsed >= 100) {
      addCandidate(
        candidates,
        parsed / 10,
        scoreDistance(parsed / 10, true, nearDistanceKeyword, 1) + scoreContext(context),
        "decimal-shift-1",
        context,
      );
      addCandidate(
        candidates,
        parsed / 100,
        scoreDistance(parsed / 100, true, nearDistanceKeyword, 2) + scoreContext(context),
        "decimal-shift-2",
        context,
      );
      addCandidate(
        candidates,
        parsed / 1000,
        scoreDistance(parsed / 1000, true, nearDistanceKeyword, 3) + scoreContext(context),
        "decimal-shift-3",
        context,
      );
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  if (candidates[0].score < MIN_ACCEPTED_CANDIDATE_SCORE) {
    return null;
  }

  return candidates[0];
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

async function createProcessedImageVariants(imageBuffer: Buffer) {
  const base = sharp(imageBuffer).rotate().resize({ width: 2200, fit: "inside", withoutEnlargement: false });

  return Promise.all([
    base
      .clone()
      .grayscale()
      .normalize()
      .modulate({ brightness: 1.08, saturation: 0 })
      .sharpen({ sigma: 1.2 })
      .png()
      .toBuffer()
      .then((buffer) => ({ name: "normalized", buffer, scoreBias: 12 })),
    base
      .clone()
      .grayscale()
      .linear(1.25, -18)
      .sharpen({ sigma: 1.6 })
      .png()
      .toBuffer()
      .then((buffer) => ({ name: "high-contrast", buffer, scoreBias: 0 })),
    base
      .clone()
      .grayscale()
      .threshold(150)
      .sharpen()
      .png()
      .toBuffer()
      .then((buffer) => ({ name: "threshold", buffer, scoreBias: -10 })),
  ]);
}

export async function analyzeRunningImage(imageBuffer: Buffer): Promise<OcrResult> {
  const variants = await createProcessedImageVariants(imageBuffer);
  const worker = await createWorker("eng");
  const attempts: Array<{
    variant: string;
    text: string;
    confidence: number;
    candidate: Candidate | null;
  }> = [];

  try {
    for (const variant of variants) {
      const result = await worker.recognize(variant.buffer);
      const text = normalizeText(result.data.text);
      const candidate = extractDistanceWithHeuristics(text);
      if (candidate) {
        candidate.score += variant.scoreBias;
      }
      attempts.push({
        variant: variant.name,
        text,
        confidence: Number(result.data.confidence || 0),
        candidate,
      });

      if (candidate && candidate.score >= STRONG_CANDIDATE_SCORE) {
        break;
      }
    }

    const best = attempts
      .filter((attempt): attempt is typeof attempt & { candidate: Candidate } => Boolean(attempt.candidate))
      .sort((a, b) => {
        const scoreDiff = b.candidate.score - a.candidate.score;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return b.confidence - a.confidence;
      })[0];

    if (!best) {
      throw new Error(`ไม่พบค่าระยะทางที่มั่นใจได้ หรือค่าที่พบเกิน ${MAX_REASONABLE_DISTANCE_KM} กม. กรุณาพิมพ์ระยะทางเอง`);
    }

    return {
      detectedDistanceKm: best.candidate.value,
      sourceApp: detectSourceApp(best.text),
      text: attempts.map((attempt) => `[${attempt.variant}] ${attempt.text}`).join("\n"),
      confidence: best.confidence,
    };
  } finally {
    await worker.terminate();
  }
}
