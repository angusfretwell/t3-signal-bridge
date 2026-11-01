import { exec } from "./exec.ts";

export async function defaultBranch(projectPath: string) {
  const git = async (...args: string[]) => {
    const result = await exec("git", ["-C", projectPath, ...args]);
    return result.ok ? result.stdout.trim() : undefined;
  };
  const remoteHead = await git("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  return (
    remoteHead?.replace(/^origin\//, "") ??
    (await git("rev-parse", "--abbrev-ref", "HEAD")) ??
    "HEAD"
  );
}
