import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

type RegisterTokenPayload = {
  lineUserId: string;
  displayName?: string;
  pictureUrl?: string;
  exp: number;
};

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string) {
  return createHmac("sha256", env.REGISTRATION_TOKEN_SECRET).update(payloadB64).digest("base64url");
}

export function createRegisterToken(input: {
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  expiresInMinutes?: number;
}) {
  const payload: RegisterTokenPayload = {
    lineUserId: input.lineUserId,
    displayName: input.displayName ?? undefined,
    pictureUrl: input.pictureUrl ?? undefined,
    exp: Date.now() + (input.expiresInMinutes ?? 30) * 60_000,
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyRegisterToken(token: string): RegisterTokenPayload | null {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    return null;
  }

  const expected = sign(payloadB64);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as RegisterTokenPayload;
    if (!payload.lineUserId || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
