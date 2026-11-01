import type { Workspaces } from "./projects.ts";

export type Route =
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

const projectPrefix = /^([\w-]+):\s+([\s\S]+)$/;

export function pickWorkspace(
  text: string,
  { projects, scratchPath }: Workspaces,
  defaultProject?: string,
) {
  const [, prefix, rest] = projectPrefix.exec(text) ?? [];
  const named =
    prefix && projects.find((project) => project.name.toLowerCase() === prefix.toLowerCase());
  if (named && rest) return { path: named.path, isProject: true, text: rest.trim() };

  const fallback = projects.find((project) => project.path === defaultProject);
  if (fallback) return { path: fallback.path, isProject: true, text };
  if (scratchPath) return { path: scratchPath, isProject: false, text };
  throw new Error('T3 Code has no "No project" space. Start the message with a project name.');
}
