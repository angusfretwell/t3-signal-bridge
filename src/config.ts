import { readFileSync } from "node:fs";
import { z } from "zod";
import { paths } from "./paths.ts";
import { writeFileIn } from "./util.ts";

export const defaultPort = 8787;

export const configSchema = z.object({
  botNumber: z.string().min(1),
  botName: z.string().optional(),
  owner: z.string().min(1),
  ownerUuid: z.string().optional(),
  signalCli: z.string().min(1),
  defaultProject: z.string().optional(),
  port: z.number().int().default(defaultPort),
  t3Bin: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;

export function readConfig(file = paths.config): Config | undefined {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  return configSchema.parse(JSON.parse(raw));
}

export function loadConfig(file = paths.config): Config {
  const config = readConfig(file);
  if (!config) throw new Error(`No config at ${file}. Run \`npx t3-signal-bridge install\` first.`);
  return config;
}

export function writeConfig(config: ConfigInput, file = paths.config) {
  writeFileIn(file, `${JSON.stringify(configSchema.parse(config), null, 2)}\n`, { mode: 0o600 });
}
