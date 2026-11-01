import { readFileSync } from "node:fs";
import { z } from "zod";
import { paths } from "./paths.ts";
import { writeFileIn } from "./util.ts";

export const defaultPort = 8787;

const configSchema = z.object({
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

export function readConfig(): Config | undefined {
  let raw: string;
  try {
    raw = readFileSync(paths.config, "utf8");
  } catch {
    return undefined;
  }
  return configSchema.parse(JSON.parse(raw));
}

export function loadConfig(): Config {
  const config = readConfig();
  if (!config)
    throw new Error(`No config at ${paths.config}. Run \`npx t3-signal-bridge install\` first.`);
  return config;
}

export function writeConfig(config: z.input<typeof configSchema>) {
  writeFileIn(paths.config, `${JSON.stringify(configSchema.parse(config), null, 2)}\n`, {
    mode: 0o600,
  });
}
