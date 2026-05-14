import { ConversationMode, SubmissionStatus } from "@prisma/client";
import path from "node:path";
import { prisma } from "../db/prisma";
import { saveBufferToFile } from "../utils/fs";
import { analyzeRunningImage } from "./ocr.service";
import { generateSummaryCard } from "./summary-card.service";

type UserProfileInput = {
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  statusMessage?: string | null;
};

export async function upsertUserProfile(profile: UserProfileInput) {
  return prisma.user.upsert({
    where: { lineUserId: profile.lineUserId },
    create: {
      lineUserId: profile.lineUserId,
      displayName: profile.displayName ?? undefined,
      pictureUrl: profile.pictureUrl ?? undefined,
      statusMessage: profile.statusMessage ?? undefined,
    },
    update: {
      displayName: profile.displayName ?? undefined,
      pictureUrl: profile.pictureUrl ?? undefined,
      statusMessage: profile.statusMessage ?? undefined,
    },
  });
}

export async function ensureConversationState(userId: string) {
  return prisma.conversationState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function createPendingSubmission(params: {
  userId: string;
  imageMessageId: string;
  imageBuffer: Buffer;
}) {
  const fileName = `${params.userId}-${Date.now()}-${params.imageMessageId}.jpg`;
  const relativePath = `/uploads/${fileName}`;
  const absolutePath = path.join(process.cwd(), "public", relativePath);

  await saveBufferToFile(absolutePath, params.imageBuffer);

  const analysis = await analyzeRunningImage(params.imageBuffer);

  const submission = await prisma.submission.create({
    data: {
      userId: params.userId,
      imageMessageId: params.imageMessageId,
      imagePath: relativePath,
      sourceApp: analysis.sourceApp ?? undefined,
      ocrText: analysis.text,
      extractedDistanceKm: analysis.detectedDistanceKm,
      confirmedDistanceKm: analysis.detectedDistanceKm,
      status: SubmissionStatus.PENDING,
    },
  });

  await prisma.conversationState.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      mode: ConversationMode.IDLE,
      pendingSubmissionId: submission.id,
    },
    update: {
      mode: ConversationMode.IDLE,
      pendingSubmissionId: submission.id,
    },
  });

  return submission;
}

export async function getPendingSubmission(userId: string) {
  return prisma.submission.findFirst({
    where: {
      userId,
      status: SubmissionStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function setConversationMode(userId: string, mode: ConversationMode, pendingSubmissionId?: string | null) {
  return prisma.conversationState.upsert({
    where: { userId },
    create: {
      userId,
      mode,
      pendingSubmissionId: pendingSubmissionId ?? null,
    },
    update: {
      mode,
      pendingSubmissionId: pendingSubmissionId ?? null,
    },
  });
}

export async function getConversationState(userId: string) {
  return prisma.conversationState.findUnique({ where: { userId } });
}

export async function updatePendingDistance(submissionId: string, distanceKm: number) {
  return prisma.submission.update({
    where: { id: submissionId },
    data: { confirmedDistanceKm: distanceKm },
  });
}

export async function cancelPendingSubmission(submissionId: string, userId: string) {
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.CANCELLED },
  });

  await setConversationMode(userId, ConversationMode.IDLE, null);
}

export async function confirmPendingSubmission(submissionId: string, userId: string) {
  const submission = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: SubmissionStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  const aggregate = await prisma.submission.aggregate({
    _sum: { confirmedDistanceKm: true },
    where: {
      userId,
      status: SubmissionStatus.CONFIRMED,
    },
  });

  const totalDistance = aggregate._sum.confirmedDistanceKm ?? 0;

  await prisma.user.update({
    where: { id: userId },
    data: {
      latestDistanceKm: submission.confirmedDistanceKm,
      totalDistanceKm: totalDistance,
    },
  });

  await setConversationMode(userId, ConversationMode.IDLE, null);

  return generateSummaryCard({ userId });
}