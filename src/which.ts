import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export function which(command: string) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}
