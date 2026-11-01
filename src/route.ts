export type Route =
  | { kind: "reply"; threadId: string; text: string }
  | { kind: "start"; project?: string; text: string }
  | { kind: "unknown-quote" };

const projectPrefix = /^([\w-]+):\s+([\s\S]+)$/;

export function route(
  message: { text: string; quotedTimestamp?: number },
  threadFor: (signalTimestamp: number) => string | undefined,
  projectNames: string[],
): Route {
  const text = message.text.trim();

  if (message.quotedTimestamp !== undefined) {
    const threadId = threadFor(message.quotedTimestamp);
    return threadId ? { kind: "reply", threadId, text } : { kind: "unknown-quote" };
  }

  const [, prefix, rest] = projectPrefix.exec(text) ?? [];
  const named = prefix && projectNames.find((name) => name.toLowerCase() === prefix.toLowerCase());
  if (named && rest) return { kind: "start", project: named, text: rest.trim() };

  return { kind: "start", text };
}
