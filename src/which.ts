import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

const pathDirs = () => (process.env.PATH ?? "").split(delimiter).filter(Boolean);

export function which(command: string) {
  for (const dir of pathDirs()) {
    const candidate = join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

export const onPath = (dir: string) => pathDirs().includes(dir);
