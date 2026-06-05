import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  ADMIN_API_KEY: z.string().min(8).default("change-me-now"),
  ADMIN_USERNAME: z.string().trim().default(""),
  ADMIN_PASSWORD_HASH: z.string().trim().default(""),
  ADMIN_ALLOW_API_KEY_FALLBACK: z
    .string()
    .transform((v) => v !== "false" && v !== "0")
    .default("true"),
  ADMIN_SESSION_SECRET: z.string().min(16).default("change-admin-session-secret"),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  BACKUP_DIR: z.string().trim().min(1).default("data/backups"),
  MAINTENANCE_CONFIRM_TEXT: z.string().trim().min(8).default("CLEAR_USER_DATA"),
  ADMIN_EXPORT_DB_ENABLED: z
    .string()
    .transform((v) => v !== "false" && v !== "0")
    .default("true"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  ADMIN_ALLOWED_EMAILS: z.string().default(""),
  ADMIN_ALLOWED_DOMAINS: z.string().default(""),
  LIFF_ID: z.string().default(""),
  REGISTRATION_TOKEN_SECRET: z.string().min(16).default("change-registration-secret"),
});

export const env = envSchema.parse(process.env);
