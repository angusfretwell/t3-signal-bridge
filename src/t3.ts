import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { exec } from "./exec.ts";
import { paths } from "./paths.ts";
import { parseJson } from "./util.ts";
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

export const findT3 = (configured?: string) => configured || serviceBinary() || which("t3");

export function createT3(binary: string) {
  async function t3<T>(schema: z.ZodType<T>, args: string[], input?: string): Promise<T> {
    const result = await exec(binary, args, input);
    const parsed = schema.safeParse(parseJson(result.stdout));
    if (parsed.success) return parsed.data;

    const output = (result.stderr || result.stdout).trim().slice(-500);
    throw new Error(`t3 ${args.slice(0, 2).join(" ")} exited ${result.code}: ${output}`);
  }

  return {
    startThread: (projectPath: string, message: string, base?: string) =>
      t3(
        runResultSchema,
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

    sendToThread: (threadId: string, message: string) =>
      t3(runResultSchema, ["thread", "send", "--json", "--wait", threadId, "-"], message),

    threadTitle: async (threadId: string) => {
      const args = ["thread", "show", "--json", "--messages", "0", threadId];
      const { thread } = await t3(threadSchema, args);
      return thread.title;
    },
  };
}
