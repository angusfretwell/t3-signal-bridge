import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { paths } from "./paths.ts";
import { which } from "./which.ts";

const runResultSchema = z.object({
  threadId: z.string(),
  status: z.string(),
  reply: z.string().nullish(),
  error: z.string().nullish(),
});

export type RunResult = z.infer<typeof runResultSchema>;

const threadSchema = z.object({ thread: z.object({ title: z.string() }) });

function serviceBinary() {
  try {
    const { activeVersion } = JSON.parse(
      readFileSync(join(paths.t3Home, "runtime/service-state.json"), "utf8"),
    );
    const binary = join(paths.t3Home, "runtime/versions", activeVersion, "t3");
    return existsSync(binary) ? binary : undefined;
  } catch {
    return undefined;
  }
}

export function resolveT3(configured?: string) {
  return configured ?? serviceBinary() ?? which("t3");
}

export function createT3(binary: string) {
  function t3(args: string[], stdin?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(
            new Error(
              `t3 ${args.slice(0, 2).join(" ")} exited ${code}: ${(stderr || stdout).trim().slice(-500)}`,
            ),
          );
        }
      });
      child.stdin.end(stdin);
    });
  }

  return {
    version: () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(binary, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
        let stdout = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0 ? resolve(stdout.trim()) : reject(new Error(`t3 exited ${code}`)),
        );
      }),

    startThread: async (projectPath: string, base: string | undefined, message: string) =>
      runResultSchema.parse(
        await t3(
          [
            "thread",
            "start",
            "--json",
            "--wait",
            ...(base ? ["--worktree", base] : []),
            projectPath,
            "-",
          ],
          message,
        ),
      ),

    sendToThread: async (threadId: string, message: string) =>
      runResultSchema.parse(
        await t3(["thread", "send", "--json", "--wait", threadId, "-"], message),
      ),

    threadTitle: async (threadId: string) =>
      threadSchema.parse(await t3(["thread", "show", "--json", "--messages", "0", threadId])).thread
        .title,
  };
}
