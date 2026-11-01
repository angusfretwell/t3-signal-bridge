import { fileURLToPath } from "node:url";
import meow from "meow";
import packageJson from "../package.json" with { type: "json" };
import { ask } from "./ask.ts";
import { runBridge } from "./bridge.ts";
import { loadConfig } from "./config.ts";
import { install } from "./install.ts";
import { paths, serviceName } from "./paths.ts";
import { serviceStatus, uninstall, update } from "./service.ts";

const cli = meow(
  `
  Usage: t3-signal-bridge <command>

  Commands:
    install     Set up signal-cli, register the bot's number and start the bridge
    update      Replace the installed bridge with this version and restart it
    status      Show whether the bridge's service is installed and running
    run         Run the bridge in the foreground
    ask <text>  Send a question from the current T3 Code thread (what signal-ask runs)
    uninstall   Stop the bridge and remove its service. Keeps your config and Signal keys.

  Options:
    --help      Show this help
    --version   Show the version
`,
  {
    importMeta: import.meta,
    pkg: packageJson,
    description: false,
    commands: ["install", "update", "status", "run", "ask", "uninstall"],
  },
);

const appSource = fileURLToPath(import.meta.url);

try {
  switch (cli.command) {
    case "install":
      await install(appSource);
      break;
    case "update":
      update(appSource);
      console.log(`Updated the bridge to ${packageJson.version}.`);
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
    case "run":
      runBridge(loadConfig());
      break;
    case "ask":
      await ask(cli.input.map(String));
      break;
    case "uninstall":
      uninstall();
      console.log(
        `Removed the bridge. Your config is in ${paths.config} and Signal keys in ${paths.signalData}.`,
      );
      break;
    default:
      cli.showHelp(0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
