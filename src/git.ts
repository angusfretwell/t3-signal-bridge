import { tryRun } from "./exec.ts";

export async function defaultBranch(projectPath: string) {
  const git = (...args: string[]) => tryRun("git", ["-C", projectPath, ...args]);

  const remoteHead = await git("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (remoteHead) return remoteHead.replace(/^origin\//, "");

  return (await git("rev-parse", "--abbrev-ref", "HEAD")) ?? "HEAD";
}
