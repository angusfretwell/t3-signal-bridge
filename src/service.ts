import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, dirname } from "node:path";
import { exec, run } from "./exec.ts";
import { paths } from "./paths.ts";
import { writeFileIn } from "./util.ts";
import { onPath } from "./which.ts";

export const serviceName = basename(paths.unit);

const shellQuote = (value: string) => `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
const systemdQuote = (value: string) =>
  `"${value.replace(/["\\]/g, "\\$&").replace(/[$%]/g, "$&$&")}"`;

const systemctl = (...args: string[]) => run("systemctl", ["--user", ...args]);
const succeeds = (work: Promise<unknown>) =>
  work.then(
    () => true,
    () => false,
  );

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
exec ${shellQuote(node)} ${shellQuote(app)} ask -- "$@"
`;
}

const hasSystemd = () => succeeds(systemctl("--version"));

function copyApp(source: string) {
  mkdirSync(dirname(paths.app), { recursive: true });
  copyFileSync(source, paths.app);
}

function installAskShim() {
  writeFileIn(paths.askShim, renderAskShim(process.execPath, paths.app));
  chmodSync(paths.askShim, 0o755);
}

async function installUnit() {
  writeFileIn(paths.unit, renderUnit(process.execPath, paths.app));
  await systemctl("daemon-reload");
  await systemctl("enable", serviceName);
  await systemctl("restart", serviceName);
}

export async function deploy(appSource: string) {
  copyApp(appSource);
  installAskShim();
  const systemd = await hasSystemd();
  if (systemd) await installUnit();
  return { askOnPath: onPath(dirname(paths.askShim)), systemd };
}

export async function undeploy() {
  if (existsSync(paths.unit)) {
    await systemctl("disable", "--now", serviceName).catch(() => {});
    rmSync(paths.unit);
    await systemctl("daemon-reload").catch(() => {});
  }
  rmSync(paths.askShim, { force: true });
  rmSync(dirname(paths.app), { recursive: true, force: true });
}

export async function update(appSource: string) {
  if (!existsSync(paths.app))
    throw new Error("The bridge isn't installed. Run `npx t3-signal-bridge install` first.");
  await deploy(appSource);
}

export async function stopService() {
  await systemctl("stop", serviceName).catch(() => {});
}

export async function serviceStatus() {
  if (!existsSync(paths.unit)) return "not installed";
  return (await succeeds(systemctl("is-active", serviceName))) ? "running" : "stopped";
}

export async function lingerEnabled() {
  const result = await exec("loginctl", ["show-user", userInfo().username, "--property=Linger"]);
  return result.stdout.trim() === "Linger=yes";
}
