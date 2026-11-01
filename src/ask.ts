import { createServer, type ServerResponse } from "node:http";
import { text } from "node:stream/consumers";
import { z } from "zod";
import { defaultPort, readConfig } from "./config.ts";
import { errorMessage, parseJson } from "./util.ts";

const host = "127.0.0.1";

const askSchema = z.object({ threadId: z.string().min(1), question: z.string().min(1) });

function sendJson(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

export function serveAsk(
  port: number,
  onQuestion: (threadId: string, question: string) => Promise<void>,
) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/ask") {
      response.writeHead(404).end();
      return;
    }
    const mediaType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      sendJson(response, 415, { error: "Send the question as application/json." });
      return;
    }
    const body = await text(request).catch(() => undefined);
    if (body === undefined) {
      sendJson(response, 400, { error: "Couldn't read the request body." });
      return;
    }
    const ask = askSchema.safeParse(parseJson(body));
    if (!ask.success) {
      sendJson(response, 400, { error: ask.error.message });
      return;
    }
    try {
      await onQuestion(ask.data.threadId, ask.data.question);
    } catch (error) {
      sendJson(response, 502, { error: errorMessage(error) });
      return;
    }
    sendJson(response, 200, { sent: true });
  });

  return server.listen(port, host, () =>
    console.log(`t3-signal-bridge listening on ${host}:${port}`),
  );
}

function fetchFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause ? `${errorMessage(error)}: ${errorMessage(cause)}` : errorMessage(error);
}

export async function ask(args: string[]) {
  const threadId = process.env.T3CODE_THREAD_ID;
  const question = (
    args.join(" ") || (process.stdin.isTTY ? "" : await text(process.stdin))
  ).trim();
  const port = readConfig()?.port ?? defaultPort;
  const bridgeUrl = process.env.SIGNAL_BRIDGE_URL ?? `http://${host}:${port}`;

  if (!threadId)
    throw new Error("signal-ask only works inside a T3 Code thread: T3CODE_THREAD_ID is not set.");
  if (!question) throw new Error('Usage: signal-ask "<question>" (or pipe the question on stdin)');

  let failure: string | undefined;
  try {
    const response = await fetch(`${bridgeUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, question }),
    });
    if (!response.ok) failure = `${response.status} ${await response.text()}`;
  } catch (error) {
    failure = fetchFailure(error);
  }
  if (failure) throw new Error(`signal-ask failed, so the owner was not asked: ${failure}`);

  console.log(
    "Sent to the owner on Signal. End your turn now; their reply arrives as your next message.",
  );
}
