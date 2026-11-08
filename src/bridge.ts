import { serveAsk } from "./ask.ts";
import type { Config } from "./config.ts";
import { threadMessage } from "./format.ts";
import { defaultBranch } from "./git.ts";
import { paths } from "./paths.ts";
import { route } from "./route.ts";
import { connectSignal, type Incoming } from "./signal.ts";
import { openThreadStore } from "./store.ts";
import { createT3, runReport } from "./t3.ts";
import { errorMessage } from "./util.ts";
import { listWorkspaces, pickWorkspace } from "./workspaces.ts";

export function runBridge(config: Config) {
  const t3 = createT3(config.t3Bin);
  const store = openThreadStore(paths.threads);
  const signal = connectSignal({
    binary: config.signalCli,
    botNumber: config.botNumber,
    owner: config.owner,
    ownerUuid: config.ownerUuid,
    onMessage: (message) => {
      handle(message).catch((error) => {
        console.error(error);
        signal.send({ text: `⚠️ ${errorMessage(error)}` }).catch(console.error);
      });
    },
  });

  async function sendFromThread(threadId: string, markdown: string) {
    const title = await t3.threadTitle(threadId).catch(() => threadId);
    const timestamp = await signal.send(threadMessage(title, markdown));
    store.remember(timestamp, threadId);
  }

  async function startThread(text: string) {
    const workspace = pickWorkspace(text, await listWorkspaces(), config.defaultProject);
    const base = workspace.isProject ? await defaultBranch(workspace.path) : undefined;
    return t3.startThread(workspace.path, workspace.text, base);
  }

  async function handle(message: Incoming) {
    const target = route(message, store.threadFor);
    if (target.kind === "unknown-quote") {
      await signal.send({
        text: "I don't know which thread that message belongs to. Send it without quoting to start a new thread.",
      });
      return;
    }

    await signal.react("👀", message.timestamp);

    const result =
      target.kind === "reply"
        ? await t3.sendToThread(target.threadId, target.text)
        : await startThread(target.text);
    await sendFromThread(result.threadId, runReport(result));
  }

  serveAsk(config.port, (threadId, question) => sendFromThread(threadId, `❓ ${question}`));

  process.on("exit", () => signal.stop());
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  void signal.exited.then((code) => {
    console.error(`signal-cli exited with code ${code}`);
    process.exit(1);
  });
}
