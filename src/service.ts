import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { exec, run, tryRun } from "./exec.ts";
import { appName, installCommand, paths, serviceName } from "./paths.ts";
import { writeFileIn } from "./util.ts";

const shellQuote = (value: string) => `"${value.replace(/["\\$`]/g, "\\$&")}"`;
const systemdQuote = (value: string) =>
  `"${value.replace(/["\\]/g, "\\$&").replace(/[$%]/g, "$&$&")}"`;

const systemctl = (...args: string[]): [string, string[]] => ["systemctl", ["--user", ...args]];

export const foregroundCommand = `${process.execPath} ${paths.app} run`;

export function renderUnit(node: string, app: string) {
  return `[Unit]
Description=${appName}: T3 Code threads over Signal
After=network-online.target

[Service]
ExecStart=${systemdQuote(node)} ${systemdQuote(app)} run
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`;
}

export function renderAskShim(node: string, app: string) {
  return `#!/bin/sh
exec ${shellQuote(node)} ${shellQuote(app)} ask "$@"
`;
}

export async function hasSystemd() {
  return (await exec(...systemctl("--version"))).ok;
}

export function deploy(bundledCli: string) {
  mkdirSync(dirname(paths.app), { recursive: true });
  copyFileSync(bundledCli, paths.app);
  writeFileIn(paths.askShim, renderAskShim(process.execPath, paths.app));
  chmodSync(paths.askShim, 0o755);
}

export async function startService() {
  writeFileIn(paths.unit, renderUnit(process.execPath, paths.app));
  await run(...systemctl("daemon-reload"));
  await run(...systemctl("enable", serviceName));
  await run(...systemctl("restart", serviceName));
}

export async function stopService() {
  await exec(...systemctl("stop", serviceName));
}

export async function update(bundledCli: string) {
  if (!existsSync(paths.app))
    throw new Error(`The bridge isn't installed. Run \`${installCommand}\` first.`);

  deploy(bundledCli);
  if (existsSync(paths.unit)) await startService();
}

export async function undeploy() {
  if (existsSync(paths.unit)) {
    await exec(...systemctl("disable", "--now", serviceName));
    rmSync(paths.unit);
    await exec(...systemctl("daemon-reload"));
  }

  rmSync(paths.askShim, { force: true });
  rmSync(dirname(paths.app), { recursive: true, force: true });
}

export async function serviceReport() {
  if (!existsSync(paths.unit))
    return {
      running: false,
      lines: ["Bridge: not installed", `Run \`${installCommand}\` to set it up.`],
    };

  const running = (await tryRun(...systemctl("is-active", serviceName))) === "active";
  return {
    running,
    lines: [
      `Bridge: ${running ? "running" : "stopped"}`,
      `Unit: ${paths.unit}`,
      `Logs: journalctl --user -u ${serviceName}`,
      ...(running ? [] : [`Run \`systemctl --user start ${serviceName}\` to start it.`]),
    ],
  };
}

export async function lingerEnabled() {
  const linger = await tryRun("loginctl", [
    "show-user",
    String(process.getuid?.()),
    "--property=Linger",
  ]);
  return linger === "Linger=yes";
}
