import { createServer } from "node:http";
import { z } from "zod";
import type { Config } from "./config.ts";
import { toSignal } from "./format.ts";
import { paths } from "./paths.ts";
import { defaultBranch } from "./git.ts";
import { listProjects, type Project } from "./projects.ts";
import { type Route, route } from "./route.ts";
import { createSignal, type Incoming } from "./signal.ts";
import { ThreadStore } from "./store.ts";
import { createT3, findT3, type RunResult } from "./t3.ts";
import { errorMessage, parseJson } from "./util.ts";

const askSchema = z.object({ threadId: z.string().min(1), question: z.string().min(1) });

function describe(result: RunResult) {
  if (result.status === "completed") return result.reply || "(no reply)";
  return `Run ${result.status}${result.error ? `: ${result.error}` : ""}${result.reply ? `\n\n${result.reply}` : ""}`;
}

const maxTitleLength = 40;

export function threadHeader(title: string) {
  const characters = Array.from(new Intl.Segmenter().segment(title), ({ segment }) => segment);
  if (characters.length <= maxTitleLength) return `🧵 ${title}`;
  return `🧵 ${characters
    .slice(0, maxTitleLength - 1)
    .join("")
    .trimEnd()}…`;
}

export function runBridge(config: Config) {
  const store = new ThreadStore(paths.threads);
  const t3Found = findT3(config.t3Bin);
  if (!t3Found) throw new Error("Couldn't find the T3 Code CLI. Set t3Bin in the config.");
  const t3 = createT3(t3Found.binary);
  const signal = createSignal({
    binary: config.signalCli,
    botNumber: config.botNumber,
    owner: config.owner,
    ownerUuid: config.ownerUuid,
  });

  async function sendFromThread(threadId: string, body: string) {
    const title = await t3.threadTitle(threadId).catch(() => threadId);
    const header = `${threadHeader(title)}\n\n`;
    const { text, styles, attachments } = toSignal(body);
    const timestamp = await signal.send({
      text: header + text,
      styles: styles.map((range) => ({ ...range, start: range.start + header.length })),
      attachments,
    });
    store.remember(timestamp, threadId);
  }

  async function run(
    target: Exclude<Route, { kind: "unknown-quote" }>,
    projects: Project[],
    scratchPath?: string,
  ) {
    if (target.kind === "reply") return t3.sendToThread(target.threadId, target.text);
    const project = projects.find((candidate) =>
      target.project ? candidate.name === target.project : candidate.path === config.defaultProject,
    );
    if (project)
      return t3.startThread(project.path, await defaultBranch(project.path), target.text);
    if (!scratchPath)
      throw new Error('T3 Code has no "No project" space. Start the message with a project name.');
    return t3.startThread(scratchPath, undefined, target.text);
  }

  async function handle(message: Incoming) {
    const { projects, scratchPath } =
      message.quotedTimestamp === undefined
        ? await listProjects()
        : { projects: [], scratchPath: undefined };
    const target = route(
      message,
      store.threadFor,
      projects.map((project) => project.name),
    );
    if (target.kind === "unknown-quote") {
      await signal.send({
        text: "I don't know which thread that message belongs to. Send it without quoting to start a new thread.",
      });
      return;
    }

    await signal.react("👀", message.timestamp);
    const result = await run(target, projects, scratchPath);
    await sendFromThread(result.threadId, describe(result));
  }

  signal.listen((message) => {
    handle(message).catch((error) => {
      console.error(error);
      signal.send({ text: `⚠️ ${errorMessage(error)}` }).catch(console.error);
    });
  });

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/ask") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const ask = askSchema.safeParse(parseJson(body));
    if (!ask.success) {
      response
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ error: ask.error.message }));
      return;
    }
    try {
      await sendFromThread(ask.data.threadId, `❓ ${ask.data.question}`);
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ sent: true }));
    } catch (error) {
      response
        .writeHead(502, { "content-type": "application/json" })
        .end(JSON.stringify({ error: String(error) }));
    }
  });

  server.listen(config.port, "127.0.0.1", () =>
    console.log(`t3-signal-bridge listening on 127.0.0.1:${config.port}`),
  );

  for (const signalName of ["SIGTERM", "SIGINT"] as const)
    process.on(signalName, () => process.exit(0));
  void signal.exited.then((code) => {
    console.error(`signal-cli exited with code ${code}`);
    process.exit(1);
  });
}
