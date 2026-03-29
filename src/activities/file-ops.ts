import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * Read a file's contents. Returns null if file doesn't exist.
 */
export async function readFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

/**
 * Write content to a file, creating parent directories as needed.
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Check if a file or directory exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}

/**
 * Read a JSON file and parse it. Returns null if file doesn't exist or is invalid.
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  const content = await readFile(filePath);
  if (content === null) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write an object as JSON to a file.
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}
