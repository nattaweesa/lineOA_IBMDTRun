import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

type DataDirectory = "uploads" | "generated";

function resolveSqlitePath() {
  const url = env.DATABASE_URL.trim();
  if (!url.startsWith("file:")) {
    return null;
  }

  const rawPath = url.replace(/^file:/, "");
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(process.cwd(), rawPath);
}

async function findExistingSqlitePath() {
  const sqlitePath = resolveSqlitePath();
  if (!sqlitePath) {
    return null;
  }

  const candidates = [
    sqlitePath,
    path.resolve(process.cwd(), "prisma", env.DATABASE_URL.replace(/^file:/, "")),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch (_error) {
      // Try the next known Prisma SQLite location.
    }
  }

  return sqlitePath;
}

async function removeDirectoryContents(directory: string) {
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory);

  await Promise.all(entries.map((entry) => fs.rm(path.join(directory, entry), {
    recursive: true,
    force: true,
  })));
}

async function getDirectoryFileCount(kind: DataDirectory) {
  const directory = path.join(process.cwd(), "public", kind);

  try {
    const entries = await fs.readdir(directory);
    return entries.length;
  } catch (_error) {
    return 0;
  }
}

export async function getMaintenanceStats() {
  const [users, registrations, submissions, pendingSubmissions, confirmedSubmissions, conversationStates, teams] =
    await Promise.all([
      prisma.user.count(),
      prisma.registration.count(),
      prisma.submission.count(),
      prisma.submission.count({ where: { status: "PENDING" } }),
      prisma.submission.count({ where: { status: "CONFIRMED" } }),
      prisma.conversationState.count(),
      prisma.team.count(),
    ]);

  return {
    users,
    registrations,
    submissions,
    pendingSubmissions,
    confirmedSubmissions,
    conversationStates,
    teams,
    files: {
      uploads: await getDirectoryFileCount("uploads"),
      generated: await getDirectoryFileCount("generated"),
    },
  };
}

export async function createMaintenanceBackup() {
  const sqlitePath = await findExistingSqlitePath();
  if (!sqlitePath) {
    throw new Error("Maintenance backup currently supports SQLite DATABASE_URL only");
  }

  await fs.access(sqlitePath);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const backupRoot = path.resolve(process.cwd(), env.BACKUP_DIR);
  const backupDir = path.join(backupRoot, stamp);
  await fs.mkdir(backupDir, { recursive: true });

  const dbBackupPath = path.join(backupDir, "dev.db");
  await fs.copyFile(sqlitePath, dbBackupPath);

  const stats = await getMaintenanceStats();
  await fs.writeFile(
    path.join(backupDir, "manifest.json"),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      databaseUrlType: "sqlite",
      sourceDatabase: sqlitePath,
      backupDatabase: dbBackupPath,
      stats,
    }, null, 2),
  );

  return {
    backupDir,
    dbBackupPath,
    stats,
  };
}

export async function clearUserData(options: { clearFiles: boolean }) {
  await prisma.$transaction([
    prisma.conversationState.deleteMany({}),
    prisma.submission.deleteMany({}),
    prisma.registration.deleteMany({}),
    prisma.user.deleteMany({}),
  ]);

  if (options.clearFiles) {
    await Promise.all([
      removeDirectoryContents(path.join(process.cwd(), "public", "uploads")),
      removeDirectoryContents(path.join(process.cwd(), "public", "generated")),
    ]);
  }

  return getMaintenanceStats();
}

export function getSqliteDatabasePathForExport() {
  return findExistingSqlitePath();
}
