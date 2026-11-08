import { homedir } from "node:os";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };

export const appName = packageJson.name;
export const serviceName = `${appName}.service`;
export const installCommand = `npx ${appName} install`;

const home = homedir();
const configHome = process.env.XDG_CONFIG_HOME || join(home, ".config");
const stateHome = process.env.XDG_STATE_HOME || join(home, ".local/state");
const dataHome = process.env.XDG_DATA_HOME || join(home, ".local/share");

export const paths = {
  config: join(configHome, appName, "config.json"),
  threads: join(stateHome, appName, "threads.json"),
  signalData: join(dataHome, appName, "signal-cli"),
  signalCliBinary: join(dataHome, appName, "bin", "signal-cli"),
  app: join(dataHome, appName, "app", "cli.mjs"),
  askShim: join(process.env.XDG_BIN_HOME || join(home, ".local/bin"), "signal-ask"),
  unit: join(configHome, "systemd/user", serviceName),
};
