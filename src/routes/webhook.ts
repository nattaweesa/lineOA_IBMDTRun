import * as line from "@line/bot-sdk";
import { ConversationMode } from "@prisma/client";
import express from "express";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import {
  cancelPendingSubmission,
  confirmPendingSubmission,
  createPendingSubmission,
  ensureConversationState,
  getConversationState,
  getPendingSubmission,
  setConversationMode,
  updatePendingDistance,
  upsertUserProfile,
} from "../services/submission.service";
import { publicUrl } from "../utils/fs";
import { streamToBuffer, parseDistanceInput } from "../utils/line";
import { createRegisterToken, verifyRegisterToken } from "../utils/register-token";
import { generateSummaryCard } from "../services/summary-card.service";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  parseCookies,
  verifyAdminSessionToken,
} from "../utils/admin-auth";

const router = express.Router();

const lineConfig: line.ClientConfig & line.MiddlewareConfig = {
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
});

const registerSchema = z.object({
  lineUserId: z.string().min(1).optional(),
  token: z.string().min(10).optional(),
  displayName: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  gender: z.string().trim().min(1),
  birthYear: z.coerce.number().int().min(1900).max(2100),
  teamId: z.string().min(1),
  pictureUrl: z.string().url().optional(),
  source: z.string().trim().optional(),
}).refine((value) => Boolean(value.lineUserId || value.token), {
  message: "lineUserId or token is required",
  path: ["lineUserId"],
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const updateTeamSchema = z.object({
  name: z.string().trim().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

function normalizeThaiText(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

const allowedAdminEmails = new Set(
  env.ADMIN_ALLOWED_EMAILS
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const allowedAdminDomains = new Set(
  env.ADMIN_ALLOWED_DOMAINS
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

function isSsoEnabled(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID.trim());
}

function isAllowedAdminEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  // Safety-first: if no allowlist is configured, deny login.
  if (!allowedAdminEmails.size && !allowedAdminDomains.size) {
    return false;
  }

  if (allowedAdminEmails.has(normalizedEmail)) {
    return true;
  }

  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= normalizedEmail.length - 1) {
    return false;
  }

  const domain = normalizedEmail.slice(atIndex + 1);
  return allowedAdminDomains.has(domain);
}

function setAdminSessionCookie(response: express.Response, sessionToken: string) {
  response.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: env.BASE_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
}

function clearAdminSessionCookie(response: express.Response) {
  response.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    secure: env.BASE_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
  });
}

function getAdminSessionFromRequest(request: express.Request) {
  const cookies = parseCookies(request.header("cookie") || "");
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token, env.ADMIN_SESSION_SECRET);
}

function getSafeAdminNextPath(input: unknown): string {
  const nextPath = String(input || "/admin").trim();
  if (!nextPath.startsWith("/admin")) {
    return "/admin";
  }
  if (nextPath.startsWith("//")) {
    return "/admin";
  }
  return nextPath;
}

async function verifyGoogleCredential(credential: string) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!res.ok) {
    return { ok: false as const, error: "Invalid Google credential" };
  }

  const data = (await res.json()) as Record<string, string>;
  const aud = String(data.aud || "");
  const email = String(data.email || "").toLowerCase();
  const emailVerified = String(data.email_verified || "").toLowerCase() === "true";

  if (!aud || aud !== env.GOOGLE_CLIENT_ID) {
    return { ok: false as const, error: "Google client mismatch" };
  }
  if (!email || !emailVerified) {
    return { ok: false as const, error: "Email not verified" };
  }
  if (!isAllowedAdminEmail(email)) {
    return { ok: false as const, error: "This account is not allowed" };
  }

  return {
    ok: true as const,
    profile: {
      email,
      name: String(data.name || email),
      pictureUrl: String(data.picture || ""),
    },
  };
}

function checkAdminAuth(request: express.Request, response: express.Response, next: express.NextFunction) {
  const session = getAdminSessionFromRequest(request);
  if (session) {
    next();
    return;
  }

  if (env.ADMIN_ALLOW_API_KEY_FALLBACK) {
    const key = request.header("x-admin-key");
    if (key && key === env.ADMIN_API_KEY) {
      next();
      return;
    }
  }

  response.status(401).json({ ok: false, error: "Unauthorized" });
}

function createUploadPrompt(): line.messagingApi.TextMessage {
  return {
    type: "text",
    text: "สามารถส่งผลวิ่งได้โดย\n\n1. เลือกรูปแคปหน้าจอผลวิ่งจาก Strava, Apple Fitness หรือ Garmin\n2. ภาพต้องมีระยะทางชัดเจน\n3. ระบบจะอ่านค่าระยะทางให้ตรวจสอบก่อนส่งจริง",
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "cameraRoll",
            label: "เลือกรูปผลวิ่ง 1 รูป",
          },
        },
      ],
    },
  };
}

function formatDistance(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function createPersonalResultMessages(userId: string): Promise<line.messagingApi.Message[]> {
  const [user, confirmedCount, latestSubmission] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.submission.count({ where: { userId, status: "CONFIRMED" } }),
    prisma.submission.findFirst({
      where: { userId, status: "CONFIRMED" },
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!user || confirmedCount === 0 || !latestSubmission) {
    return [
      {
        type: "text",
        text: "ยังไม่พบผลวิ่งที่ยืนยันแล้วของคุณ\n\nเริ่มได้เลยโดยกด 'ส่งผลวิ่ง' แล้วอัปโหลดรูปผลวิ่ง 1 รูป",
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "message",
                label: "ส่งผลวิ่ง",
                text: "ส่งผลวิ่ง",
              },
            },
          ],
        },
      },
    ];
  }

  const summaryCard = await generateSummaryCard({ userId });
  const latestAt = latestSubmission.confirmedAt || latestSubmission.createdAt;
  const latestAtLabel = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(latestAt);

  return [
    {
      type: "image",
      originalContentUrl: summaryCard.url,
      previewImageUrl: summaryCard.url,
    },
    {
      type: "text",
      text:
        `สรุปผลวิ่งของคุณ\n\n` +
        `ระยะล่าสุด: ${formatDistance(user.latestDistanceKm)} กม.\n` +
        `ระยะสะสม: ${formatDistance(user.totalDistanceKm)} กม.\n` +
        `จำนวนครั้งที่ส่งผล: ${confirmedCount} ครั้ง\n` +
        `ทีม: ${user.teamName || "ยังไม่ระบุ"}\n` +
        `อัปเดตล่าสุด: ${latestAtLabel}`,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: "ส่งผลวิ่ง",
              text: "ส่งผลวิ่ง",
            },
          },
          {
            type: "action",
            action: {
              type: "message",
              label: "ลงทะเบียน",
              text: "ลงทะเบียน",
            },
          },
        ],
      },
    },
  ];
}

function createConfirmPrompt(imagePath: string, distanceKm: number): line.messagingApi.Message[] {
  const imageUrl = publicUrl(env.BASE_URL, imagePath);

  return [
    {
      type: "flex",
      altText: `อ่านระยะได้ ${distanceKm.toFixed(2)} กม. กดยืนยันเพื่อบันทึกผลวิ่ง`,
      contents: {
        type: "bubble",
        size: "mega",
        hero: {
          type: "image",
          url: imageUrl,
          size: "full",
          aspectRatio: "3:4",
          aspectMode: "cover",
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: `${distanceKm.toFixed(2)} กม.`,
              weight: "bold",
              size: "xl",
            },
            {
              type: "text",
              text: "กรุณาตรวจสอบระยะทาง ก่อนกดยืนยันค่ะ",
              wrap: true,
              size: "sm",
              color: "#666666",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#1f8f5f",
              action: {
                type: "message",
                label: "ยืนยัน",
                text: "ยืนยัน",
              },
            },
            {
              type: "button",
              style: "secondary",
              action: {
                type: "message",
                label: "แก้ไข",
                text: "แก้ไข",
              },
            },
            {
              type: "button",
              style: "link",
              action: {
                type: "message",
                label: "ยกเลิก",
                text: "ยกเลิก",
              },
            },
          ],
        },
      },
    },
  ];
}

async function getOrCreateUser(source: { type: string; userId?: string } | undefined) {
  if (!source || source.type !== "user" || !source.userId) {
    return null;
  }

  const profile = await client.getProfile(source.userId);
  const user = await upsertUserProfile({
    lineUserId: source.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    statusMessage: profile.statusMessage,
  });

  await ensureConversationState(user.id);

  return user;
}

async function handleTextEvent(event: line.MessageEvent) {
  if (event.message.type !== "text") {
    return;
  }

  const user = await getOrCreateUser(event.source);
  if (!user) {
    return;
  }

  const text = event.message.text.trim();
  const normalizedText = normalizeThaiText(text);
  const state = await getConversationState(user.id);
  const pendingSubmission = state?.pendingSubmissionId
    ? await prisma.submission.findUnique({ where: { id: state.pendingSubmissionId } })
    : await getPendingSubmission(user.id);

  if (["ส่งผลวิ่ง", "submit result"].includes(normalizedText)) {
    if (pendingSubmission) {
      await cancelPendingSubmission(pendingSubmission.id, user.id);
    }

    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [createUploadPrompt()],
    });
    return;
  }

  if (["วิธีส่งผล", "how to submit", "help"].includes(normalizedText)) {
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: "วิธีส่งผลวิ่ง\n\n1. กดปุ่ม 'ส่งผลวิ่ง'\n2. เลือกรูปผลวิ่ง 1 รูป (Strava/Apple Fitness/Garmin)\n3. ตรวจระยะทางที่ระบบอ่านได้\n4. หากถูกต้องกด 'ยืนยัน' หรือกด 'แก้ไข' เพื่อพิมพ์ระยะใหม่",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "ส่งผลวิ่ง",
                  text: "ส่งผลวิ่ง",
                },
              },
            ],
          },
        },
      ],
    });
    return;
  }

  if (["/result", "result", "my result", "ดูผล", "ดูผลรวม", "ยอดรวม"].includes(normalizedText)) {
    const messages = await createPersonalResultMessages(user.id);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages,
    });
    return;
  }

  if (["ลงทะเบียน", "register", "สมัคร"].includes(normalizedText)) {
    const token = createRegisterToken({
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      expiresInMinutes: 60,
    });
    const registerUrl = `${env.BASE_URL}/profile?t=${encodeURIComponent(token)}`;

    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: `ลิงก์ลงทะเบียนของคุณ\n${registerUrl}\n\nลิงก์นี้มีอายุ 60 นาที และใช้ได้เฉพาะบัญชีของคุณ`,
        },
      ],
    });
    return;
  }

  if (text === "แก้ไข" && pendingSubmission) {
    await setConversationMode(user.id, ConversationMode.AWAITING_MANUAL_DISTANCE, pendingSubmission.id);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: "พิมพ์ระยะทางใหม่เป็นกิโลเมตรได้เลย เช่น 5.24",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "ยกเลิก",
                  text: "ยกเลิก",
                },
              },
            ],
          },
        },
      ],
    });
    return;
  }

  if (text === "ยกเลิก" && pendingSubmission) {
    await cancelPendingSubmission(pendingSubmission.id, user.id);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: "ยกเลิกการส่งผลครั้งนี้แล้ว หากต้องการส่งใหม่ พิมพ์ 'ส่งผลวิ่ง'",
        },
      ],
    });
    return;
  }

  if ((normalizedText === "ยืนยัน" || normalizedText === "ยืนยันส่งผล" || normalizedText === "ส่งผล") && pendingSubmission) {
    const summary = await confirmPendingSubmission(pendingSubmission.id, user.id);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "image",
          originalContentUrl: summary.url,
          previewImageUrl: summary.url,
        },
        {
          type: "text",
          text: "บันทึกผลวิ่งเรียบร้อยแล้ว",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "ส่งผลใหม่",
                  text: "ส่งผลวิ่ง",
                },
              },
            ],
          },
        },
      ],
    });
    return;
  }

  if (state?.mode === ConversationMode.AWAITING_MANUAL_DISTANCE && pendingSubmission) {
    const manualDistance = parseDistanceInput(text);
    if (!manualDistance) {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: "รูปแบบระยะทางไม่ถูกต้อง กรุณาพิมพ์ตัวเลข เช่น 5.24",
          },
        ],
      });
      return;
    }

    const updatedSubmission = await updatePendingDistance(pendingSubmission.id, manualDistance);
    await setConversationMode(user.id, ConversationMode.IDLE, pendingSubmission.id);
    const confirmMessages = createConfirmPrompt(updatedSubmission.imagePath, updatedSubmission.confirmedDistanceKm);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: confirmMessages,
    });
    return;
  }

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: "หากต้องการส่งผลวิ่ง กดปุ่มด้านล่างหรือพิมพ์ 'ส่งผลวิ่ง' ได้เลย",
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "message",
                label: "ส่งผลวิ่ง",
                text: "ส่งผลวิ่ง",
              },
            },
          ],
        },
      },
    ],
  });
}

async function handleImageEvent(event: line.MessageEvent) {
  if (event.message.type !== "image") {
    return;
  }

  const user = await getOrCreateUser(event.source);
  if (!user) {
    return;
  }

  const imageStream = await blobClient.getMessageContent(event.message.id);
  const imageBuffer = await streamToBuffer(imageStream as never);
  const submission = await createPendingSubmission({
    userId: user.id,
    imageMessageId: event.message.id,
    imageBuffer,
  });

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: createConfirmPrompt(submission.imagePath, submission.confirmedDistanceKm),
  });
}

async function handleEvent(event: line.WebhookEvent) {
  try {
    if (event.type === "follow") {
      const user = await getOrCreateUser(event.source);
      if (!user) {
        return;
      }

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: "ยินดีต้อนรับสู่ระบบส่งผลวิ่ง กดปุ่มด้านล่างเพื่อเริ่มส่งผลวิ่งได้เลย",
            quickReply: {
              items: [
                {
                  type: "action",
                  action: {
                    type: "message",
                    label: "ส่งผลวิ่ง",
                    text: "ส่งผลวิ่ง",
                  },
                },
              ],
            },
          },
        ],
      });
      return;
    }

    if (event.type !== "message") {
      return;
    }

    if (event.message.type === "text") {
      await handleTextEvent(event);
      return;
    }

    if (event.message.type === "image") {
      await handleImageEvent(event);
      return;
    }
  } catch (error) {
    console.error("Webhook handling failed", error);

    if (event.type === "message") {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "ระบบประมวลผลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
          },
        ],
      });
    }
  }
}

router.post("/webhook", line.middleware(lineConfig), async (request, response) => {
  const events = request.body.events as line.WebhookEvent[];
  await Promise.all(events.map((event) => handleEvent(event)));
  response.status(200).json({ ok: true });
});

router.get("/health", (_request, response) => {
  response.json({ ok: true });
});

router.get("/debug/submissions", async (_request, response) => {
  const users = await prisma.user.findMany({
    include: {
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  response.json(users);
});

router.get("/api/public/teams", async (_request, response) => {
  const teams = await prisma.team.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  response.json({ ok: true, teams });
});

router.get("/api/public/config", async (_request, response) => {
  response.json({
    ok: true,
    liffId: env.LIFF_ID || "",
  });
});

router.get("/api/auth/config", (_request, response) => {
  response.json({
    ok: true,
    ssoEnabled: isSsoEnabled(),
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    apiKeyFallbackEnabled: env.ADMIN_ALLOW_API_KEY_FALLBACK,
  });
});

router.get("/api/auth/me", (request, response) => {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  response.json({
    ok: true,
    admin: {
      email: session.email,
      name: session.name,
      pictureUrl: session.pictureUrl ?? "",
      exp: session.exp,
    },
  });
});

router.post("/api/auth/google", express.json(), async (request, response) => {
  if (!isSsoEnabled()) {
    response.status(400).json({ ok: false, error: "Google SSO is not configured" });
    return;
  }

  const credential = String(request.body?.credential || "").trim();
  if (!credential) {
    response.status(400).json({ ok: false, error: "Missing credential" });
    return;
  }

  const verified = await verifyGoogleCredential(credential);
  if (!verified.ok) {
    response.status(401).json({ ok: false, error: verified.error });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + env.ADMIN_SESSION_TTL_HOURS * 60 * 60;
  const sessionToken = createAdminSessionToken(
    {
      email: verified.profile.email,
      name: verified.profile.name,
      pictureUrl: verified.profile.pictureUrl,
      iat: nowSec,
      exp: expSec,
    },
    env.ADMIN_SESSION_SECRET,
  );

  setAdminSessionCookie(response, sessionToken);
  response.json({ ok: true, admin: verified.profile });
});

router.post("/api/auth/logout", (_request, response) => {
  clearAdminSessionCookie(response);
  response.json({ ok: true });
});

router.get("/api/public/register-context", async (request, response) => {
  const token = String(request.query.t || request.query.token || "");
  if (!token) {
    response.status(400).json({ ok: false, error: "Missing token" });
    return;
  }

  const payload = verifyRegisterToken(token);
  if (!payload) {
    response.status(400).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  response.json({
    ok: true,
    lineUserId: payload.lineUserId,
    displayName: payload.displayName ?? "",
    pictureUrl: payload.pictureUrl ?? "",
  });
});

router.get("/api/public/registration", async (request, response) => {
  const token = String(request.query.t || request.query.token || "");
  const lineUserIdFromQuery = String(request.query.lineUserId || "");

  const tokenPayload = token ? verifyRegisterToken(token) : null;
  if (token && !tokenPayload) {
    response.status(400).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  const lineUserId = tokenPayload?.lineUserId || lineUserIdFromQuery;
  if (!lineUserId) {
    response.status(400).json({ ok: false, error: "Missing lineUserId" });
    return;
  }

  if (tokenPayload && lineUserIdFromQuery && tokenPayload.lineUserId !== lineUserIdFromQuery) {
    response.status(400).json({ ok: false, error: "lineUserId mismatch" });
    return;
  }

  const registration = await prisma.registration.findUnique({
    where: { lineUserId },
    include: {
      team: true,
    },
  });

  response.json({
    ok: true,
    registration: registration
      ? {
          lineUserId: registration.lineUserId,
          displayName: registration.displayName,
          fullName: registration.fullName,
          gender: registration.gender,
          birthYear: registration.birthYear,
          teamId: registration.teamId,
          pictureUrl: registration.pictureUrl,
          updatedAt: registration.updatedAt,
        }
      : null,
  });
});

router.post("/api/register", express.json(), async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const tokenPayload = payload.token ? verifyRegisterToken(payload.token) : null;
  if (payload.token && !tokenPayload) {
    response.status(400).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  const effectiveLineUserId = tokenPayload?.lineUserId ?? payload.lineUserId;
  if (!effectiveLineUserId) {
    response.status(400).json({ ok: false, error: "Missing lineUserId" });
    return;
  }

  if (payload.lineUserId && tokenPayload && payload.lineUserId !== tokenPayload.lineUserId) {
    response.status(400).json({ ok: false, error: "lineUserId mismatch" });
    return;
  }

  const team = await prisma.team.findFirst({ where: { id: payload.teamId, isActive: true } });
  if (!team) {
    response.status(400).json({ ok: false, error: "Team not found" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { lineUserId: effectiveLineUserId } });

  const registration = await prisma.registration.upsert({
    where: { lineUserId: effectiveLineUserId },
    create: {
      lineUserId: effectiveLineUserId,
      displayName: payload.displayName,
      fullName: payload.fullName,
      gender: payload.gender,
      birthYear: payload.birthYear,
      teamId: payload.teamId,
      pictureUrl: payload.pictureUrl,
      source: payload.source ?? "register-page",
      userId: user?.id,
    },
    update: {
      displayName: payload.displayName,
      fullName: payload.fullName,
      gender: payload.gender,
      birthYear: payload.birthYear,
      teamId: payload.teamId,
      pictureUrl: payload.pictureUrl,
      source: payload.source ?? "register-page",
      userId: user?.id,
    },
    include: {
      team: true,
    },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: payload.displayName,
        teamName: team.name,
      },
    });
  }

  response.json({ ok: true, registration });
});

router.get("/api/admin/teams", checkAdminAuth, async (_request, response) => {
  const teams = await prisma.team.findMany({
    include: {
      _count: {
        select: { registrations: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  response.json({ ok: true, teams });
});

router.post("/api/admin/teams", checkAdminAuth, express.json(), async (request, response) => {
  const parsed = createTeamSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const created = await prisma.team.create({
    data: {
      name: payload.name,
      isActive: payload.isActive ?? true,
      sortOrder: payload.sortOrder ?? 0,
    },
  });

  response.status(201).json({ ok: true, team: created });
});

router.patch("/api/admin/teams/:id", checkAdminAuth, express.json(), async (request, response) => {
  const teamId = String(request.params.id);
  const parsed = updateTeamSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  if (Object.keys(payload).length === 0) {
    response.status(400).json({ ok: false, error: "Empty payload" });
    return;
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: payload,
  });

  response.json({ ok: true, team: updated });
});

router.delete("/api/admin/teams/:id", checkAdminAuth, async (request, response) => {
  const teamId = String(request.params.id);
  const inUse = await prisma.registration.count({ where: { teamId } });
  if (inUse > 0) {
    response.status(400).json({ ok: false, error: "Team is in use by existing registrations" });
    return;
  }

  await prisma.team.delete({ where: { id: teamId } });
  response.json({ ok: true });
});

router.get("/api/admin/registrations", checkAdminAuth, async (_request, response) => {
  const registrations = await prisma.registration.findMany({
    include: {
      team: true,
    },
    orderBy: { createdAt: "desc" },
  });

  response.json({ ok: true, registrations });
});

router.delete("/api/admin/registrations/:id", checkAdminAuth, async (request, response) => {
  const registrationId = String(request.params.id);
  await prisma.registration.delete({ where: { id: registrationId } });
  response.json({ ok: true });
});

router.get("/profile", (_request, response) => {
  response.sendFile(path.join(process.cwd(), "public", "register.html"));
});

router.get("/admin/login", (request, response) => {
  const session = getAdminSessionFromRequest(request);
  const nextPath = getSafeAdminNextPath(request.query.next);
  if (session) {
    response.redirect(nextPath);
    return;
  }

  response.sendFile(path.join(process.cwd(), "public", "admin-login.html"));
});

router.get("/admin", (request, response) => {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    response.redirect("/admin/login?next=%2Fadmin");
    return;
  }

  response.sendFile(path.join(process.cwd(), "public", "admin.html"));
});

router.use("/", express.static(path.join(process.cwd(), "public")));

export default router;