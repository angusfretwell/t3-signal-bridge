import { mkdirSync, type WriteFileOptions, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function writeFileIn(file: string, data: string, options?: WriteFileOptions) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data, options);
}
