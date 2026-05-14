import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "vr_admin_session";

export type AdminSessionPayload = {
  email: string;
  name: string;
  pictureUrl?: string;
  iat: number;
  exp: number;
};

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