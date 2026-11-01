import { readConfig } from "./config.ts";

export async function ask(args: string[]) {
  const threadId = process.env.T3CODE_THREAD_ID;
  const question = (args.join(" ") || (process.stdin.isTTY ? "" : await readStdin())).trim();
  const port = readConfig()?.port ?? 8787;
  const bridgeUrl = process.env.SIGNAL_BRIDGE_URL ?? `http://127.0.0.1:${port}`;

  if (!threadId)
    throw new Error("signal-ask only works inside a T3 Code thread: T3CODE_THREAD_ID is not set.");
  if (!question) throw new Error('Usage: signal-ask "<question>" (or pipe the question on stdin)');

  const response = await fetch(`${bridgeUrl}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, question }),
  }).catch((error: Error) => error);

  if (response instanceof Error || !response.ok) {
    const reason =
      response instanceof Error ? response.message : `${response.status} ${await response.text()}`;
    throw new Error(`signal-ask failed, so the owner was not asked: ${reason}`);
  }

  console.log(
    "Sent to the owner on Signal. End your turn now; their reply arrives as your next message.",
  );
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}
