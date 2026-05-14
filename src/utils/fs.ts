import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

export async function saveBufferToFile(filePath: string, buffer: Buffer) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, buffer);
}

export function publicUrl(baseUrl: string, relativePath: string) {
  return new URL(relativePath.replace(/^\//, ""), `${baseUrl}/`).toString();
}