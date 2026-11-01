import { homedir } from "node:os";
import { join } from "node:path";

const name = "t3-signal-bridge";
const home = homedir();
const configHome = process.env.XDG_CONFIG_HOME || join(home, ".config");
const stateHome = process.env.XDG_STATE_HOME || join(home, ".local/state");
const dataHome = process.env.XDG_DATA_HOME || join(home, ".local/share");

export const paths = {
  config: join(configHome, name, "config.json"),
  threads: join(stateHome, name, "threads.json"),
  signalData: join(dataHome, name, "signal-cli"),
  signalCliBinary: join(dataHome, name, "bin", "signal-cli"),
  app: join(dataHome, name, "app", "cli.mjs"),
  askShim: join(process.env.XDG_BIN_HOME || join(home, ".local/bin"), "signal-ask"),
  unit: join(configHome, "systemd/user", `${name}.service`),
  t3Home: process.env.T3CODE_HOME || join(home, ".t3"),
};
