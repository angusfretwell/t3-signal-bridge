import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { paths, serviceName } from "./paths.ts";

const shellQuote = (value: string) => `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
const systemdQuote = (value: string) =>
  `"${value.replace(/(["\\])/g, "\\$1").replaceAll("$", "$$$$")}"`;

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

export function hasSystemd() {
  return spawnSync("systemctl", ["--user", "--version"], { stdio: "ignore" }).status === 0;
}

export function copyApp(source: string) {
  mkdirSync(dirname(paths.app), { recursive: true });
  copyFileSync(source, paths.app);
}

export function installAskShim(node: string) {
  mkdirSync(dirname(paths.askShim), { recursive: true });
  writeFileSync(paths.askShim, renderAskShim(node, paths.app));
  chmodSync(paths.askShim, 0o755);
  return (process.env.PATH ?? "").split(delimiter).includes(dirname(paths.askShim));
}

export function stopService() {
  spawnSync("systemctl", ["--user", "stop", serviceName], { stdio: "ignore" });
}

export function installService(node: string) {
  mkdirSync(dirname(paths.unit), { recursive: true });
  writeFileSync(paths.unit, renderUnit(node, paths.app));
  execFileSync("systemctl", ["--user", "daemon-reload"]);
  execFileSync("systemctl", ["--user", "enable", serviceName], { stdio: "ignore" });
  execFileSync("systemctl", ["--user", "restart", serviceName]);
}

export function lingerEnabled() {
  const result = spawnSync("loginctl", ["show-user", process.env.USER ?? "", "--property=Linger"], {
    encoding: "utf8",
  });
  return result.stdout.trim() === "Linger=yes";
}

export function serviceStatus() {
  if (!existsSync(paths.unit)) return "not installed";
  const result = spawnSync("systemctl", ["--user", "is-active", serviceName], { encoding: "utf8" });
  return result.stdout.trim() === "active" ? "running" : "stopped";
}

export function uninstall() {
  if (existsSync(paths.unit)) {
    spawnSync("systemctl", ["--user", "disable", "--now", serviceName], { stdio: "ignore" });
    rmSync(paths.unit);
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  }
  rmSync(paths.askShim, { force: true });
  rmSync(dirname(paths.app), { recursive: true, force: true });
}
