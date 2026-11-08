import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { installCommand, paths } from "./paths.ts";
import { writeFileIn } from "./util.ts";

const configSchema = z.object({
  botNumber: z.string().min(1),
  botName: z.string().optional(),
  owner: z.string().min(1),
  ownerUuid: z.string().optional(),
  signalCli: z.string().min(1),
  defaultProject: z.string().optional(),
  port: z.number().int().default(8787),
  t3Bin: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function readConfig(): Config | undefined {
  if (!existsSync(paths.config)) return undefined;
  return configSchema.parse(JSON.parse(readFileSync(paths.config, "utf8")));
}

export function loadConfig(): Config {
  const config = readConfig();
  if (!config) throw new Error(`No config at ${paths.config}. Run \`${installCommand}\` first.`);
  return config;
}

export function writeConfig(config: z.input<typeof configSchema>) {
  writeFileIn(paths.config, `${JSON.stringify(configSchema.parse(config), null, 2)}\n`, {
    mode: 0o600,
  });
}
