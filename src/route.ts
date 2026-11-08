type Route =
  | { kind: "reply"; threadId: string; text: string }
  | { kind: "start"; text: string }
  | { kind: "unknown-quote" };

export function route(
  message: { text: string; quotedTimestamp?: number },
  threadFor: (signalTimestamp: number) => string | undefined,
): Route {
  const text = message.text.trim();
  if (message.quotedTimestamp === undefined) return { kind: "start", text };

  const threadId = threadFor(message.quotedTimestamp);
  return threadId ? { kind: "reply", threadId, text } : { kind: "unknown-quote" };
}
