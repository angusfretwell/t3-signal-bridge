import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { exec, run, tryRun } from "./exec.ts";
import { paths, serviceName } from "./paths.ts";
import { writeFileIn } from "./util.ts";

const shellQuote = (value: string) => `"${value.replace(/["\\$`]/g, "\\$&")}"`;
const systemdQuote = (value: string) =>
  `"${value.replace(/["\\]/g, "\\$&").replace(/[$%]/g, "$&$&")}"`;

const systemctl = (...args: string[]) => exec("systemctl", ["--user", ...args]);

export function renderUnit(node: string, app: string) {
  return `[Unit]
Description=t3-signal-bridge: T3 Code threads over Signal
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
  return (await systemctl("--version")).ok;
}

export function deploy(appSource: string) {
  mkdirSync(dirname(paths.app), { recursive: true });
  copyFileSync(appSource, paths.app);
  writeFileIn(paths.askShim, renderAskShim(process.execPath, paths.app));
  chmodSync(paths.askShim, 0o755);
}

export async function startService() {
  writeFileIn(paths.unit, renderUnit(process.execPath, paths.app));
  await run("systemctl", ["--user", "daemon-reload"]);
  await run("systemctl", ["--user", "enable", serviceName]);
  await run("systemctl", ["--user", "restart", serviceName]);
}

export async function stopService() {
  await systemctl("stop", serviceName);
}

export async function update(appSource: string) {
  if (!existsSync(paths.app))
    throw new Error("The bridge isn't installed. Run `npx t3-signal-bridge install` first.");

  deploy(appSource);
  if (existsSync(paths.unit)) await startService();
}

export async function undeploy() {
  if (existsSync(paths.unit)) {
    await systemctl("disable", "--now", serviceName);
    rmSync(paths.unit);
    await systemctl("daemon-reload");
  }

  rmSync(paths.askShim, { force: true });
  rmSync(dirname(paths.app), { recursive: true, force: true });
}

export async function serviceStatus() {
  if (!existsSync(paths.unit)) return "not installed";

  const state = await tryRun("systemctl", ["--user", "is-active", serviceName]);
  return state === "active" ? "running" : "stopped";
}

export async function lingerEnabled() {
  const linger = await tryRun("loginctl", [
    "show-user",
    String(process.getuid?.()),
    "--property=Linger",
  ]);
  return linger === "Linger=yes";
}
