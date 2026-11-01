import { parseArgs } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { ask } from "./ask.ts";
import { runBridge } from "./bridge.ts";
import { loadConfig } from "./config.ts";
import { install } from "./install.ts";
import { paths } from "./paths.ts";
import { serviceName, serviceStatus, undeploy, update } from "./service.ts";
import { errorMessage } from "./util.ts";

const help = `
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
`;

async function printStatus() {
  const status = await serviceStatus();
  console.log(`Bridge: ${status}`);
  if (status === "not installed") {
    console.log("Run `npx t3-signal-bridge install` to set it up.");
  } else {
    console.log(`Unit: ${paths.unit}`);
    console.log(`Logs: journalctl --user -u ${serviceName}`);
    if (status === "stopped")
      console.log(`Run \`systemctl --user start ${serviceName}\` to start it.`);
  }
  process.exitCode = status === "running" ? 0 : 1;
}

async function runCommand(command: string, args: string[]) {
  switch (command) {
    case "install":
      await install(import.meta.filename);
      break;
    case "update":
      await update(import.meta.filename);
      console.log(`Updated the bridge to ${packageJson.version}.`);
      break;
    case "status":
      await printStatus();
      break;
    case "run":
      runBridge(loadConfig());
      break;
    case "ask":
      await ask(args);
      break;
    case "uninstall":
      await undeploy();
      console.log(
        `Removed the bridge. Your config is in ${paths.config} and Signal keys in ${paths.signalData}.`,
      );
      break;
    default:
      console.error(help);
      process.exitCode = 1;
  }
}

try {
  const {
    values,
    positionals: [command, ...args],
  } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) console.log(packageJson.version);
  else if (values.help || !command) console.log(help);
  else await runCommand(command, args);
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
