import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "vr_admin_session";

export type AdminSessionPayload = {
  email: string;
  name: string;
  pictureUrl?: string;
  adminUserId?: string;
  role?: string;
  iat: number;
  exp: number;
};

const PASSWORD_HASH_ALGO = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 310000;
const PASSWORD_HASH_BYTES = 32;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createAdminSessionToken(payload: AdminSessionPayload, secret: string): string {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

export function verifyAdminSessionToken(token: string, secret: string): AdminSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [body, signature] = parts;
  const expected = sign(body, secret);

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as AdminSessionPayload;
    if (!parsed.email || !parsed.exp || Date.now() >= parsed.exp * 1000) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) {
    return out;
  }

  const pairs = cookieHeader.split(";");
  for (const rawPair of pairs) {
    const trimmed = rawPair.trim();
    if (!trimmed) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    out[key] = decodeURIComponent(value);
  }

  return out;
}

export function createAdminPasswordHash(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BYTES, "sha256");
  return [
    PASSWORD_HASH_ALGO,
    String(PASSWORD_HASH_ITERATIONS),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export function verifyAdminPassword(password: string, encodedHash: string): boolean {
  const parts = encodedHash.split("$");
  if (parts.length !== 4) {
    return false;
  }

  const [algo, iterationsRaw, saltRaw, hashRaw] = parts;
  if (algo !== PASSWORD_HASH_ALGO) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
    return false;
  }

  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch (_error) {
    return false;
  }
}
