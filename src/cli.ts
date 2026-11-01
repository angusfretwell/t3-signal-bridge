import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };
import { ask } from "./ask.ts";
import { runBridge } from "./bridge.ts";
import { loadConfig } from "./config.ts";
import { install } from "./install.ts";
import { paths, serviceName } from "./paths.ts";
import { serviceStatus, uninstall } from "./service.ts";

const help = `Usage: t3-signal-bridge <command>

Commands:
  install     Set up signal-cli, register the bot's number and start the bridge
  status      Show whether the bridge's service is installed and running
  run         Run the bridge in the foreground
  ask <text>  Send a question from the current T3 Code thread (what signal-ask runs)
  version     Show the installed version
  uninstall   Stop the bridge and remove its service. Keeps your config and Signal keys.
`;

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "install":
      await install(fileURLToPath(import.meta.url));
      break;
    case "status": {
      const status = serviceStatus();
      console.log(`Bridge: ${status}`);
      if (status !== "not installed") {
        console.log(`Unit: ${paths.unit}`);
        console.log(`Logs: journalctl --user -u ${serviceName}`);
      }
      if (status === "not installed")
        console.log("Run `npx t3-signal-bridge install` to set it up.");
      if (status === "stopped")
        console.log(`Run \`systemctl --user start ${serviceName}\` to start it.`);
      process.exitCode = status === "running" ? 0 : 1;
      break;
    }
    case "version":
    case "--version":
    case "-v":
      console.log(packageJson.version);
      break;
    case "run":
      runBridge(loadConfig());
      break;
    case "ask":
      await ask(args);
      break;
    case "uninstall":
      uninstall();
      console.log(
        `Removed the bridge. Your config is in ${paths.config} and Signal keys in ${paths.signalData}.`,
      );
      break;
    default:
      console.log(help);
      process.exitCode = command && command !== "help" && command !== "--help" ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
