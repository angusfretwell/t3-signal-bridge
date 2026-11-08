import { parseArgs } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { ask } from "./ask.ts";
import { runBridge } from "./bridge.ts";
import { loadConfig } from "./config.ts";
import { install } from "./install.ts";
import { appName, paths } from "./paths.ts";
import { serviceReport, undeploy, update } from "./service.ts";
import { errorMessage } from "./util.ts";

type Command = { name: string; usage?: string; summary: string; run: () => unknown };

const commands: Command[] = [
  {
    name: "install",
    summary: "Set up signal-cli, register the bot's number and start the bridge",
    run: () => install(import.meta.filename),
  },
  {
    name: "update",
    summary: "Replace the installed bridge with this version and restart it",
    run: async () => {
      await update(import.meta.filename);
      console.log(`Updated the bridge to ${packageJson.version}.`);
    },
  },
  {
    name: "status",
    summary: "Show whether the bridge's service is installed and running",
    run: async () => {
      const { running, lines } = await serviceReport();
      process.exitCode = running ? 0 : 1;
      console.log(lines.join("\n"));
    },
  },
  {
    name: "run",
    summary: "Run the bridge in the foreground",
    run: () => runBridge(loadConfig()),
  },
  {
    name: "ask",
    usage: "ask <text>",
    summary: "Send a question from the current T3 Code thread (what signal-ask runs)",
    run: () => ask(process.argv.slice(3)),
  },
  {
    name: "uninstall",
    summary: "Stop the bridge and remove its service, keeping your config and Signal keys",
    run: async () => {
      await undeploy();
      console.log(
        `Removed the bridge. Your config is in ${paths.config} and Signal keys in ${paths.signalData}.`,
      );
    },
  },
];

const commandUsage = ({ name, usage }: Command) => usage ?? name;
const column = Math.max(...commands.map((command) => commandUsage(command).length)) + 2;
const helpRow = (usage: string, summary: string) => `    ${usage.padEnd(column)}${summary}`;

const help = `
  Usage: ${appName} <command>

  Commands:
${commands.map((command) => helpRow(commandUsage(command), command.summary)).join("\n")}

  Options:
${helpRow("--help", "Show this help")}
${helpRow("--version", "Show the version")}
`;

async function main() {
  const args = process.argv.slice(2);
  const {
    values,
    positionals: [name],
  } = parseArgs({
    args: args[0] === "ask" ? ["ask"] : args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) return console.log(packageJson.version);
  if (values.help || !name) return console.log(help);

  const command = commands.find((candidate) => candidate.name === name);
  if (command) return command.run();

  console.error(help);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
