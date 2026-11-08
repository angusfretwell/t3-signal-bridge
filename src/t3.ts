import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import { exec, tryRun } from "./exec.ts";
import { parseJson } from "./util.ts";
import { which } from "./which.ts";

export const t3Home = process.env.T3CODE_HOME || join(homedir(), ".t3");
export const insideT3Home = (path: string) => !relative(t3Home, path).startsWith("..");

const runResultSchema = z.object({
  threadId: z.string(),
  status: z.string(),
  reply: z.string().nullish(),
  error: z.string().nullish(),
});

type RunResult = z.infer<typeof runResultSchema>;

const threadSchema = z.object({ thread: z.object({ title: z.string() }) });

function serviceBinary() {
  try {
    const { activeVersion } = JSON.parse(
      readFileSync(join(t3Home, "runtime/service-state.json"), "utf8"),
    );
    const binary = join(t3Home, "runtime/versions", activeVersion, "t3");
    return existsSync(binary) ? binary : undefined;
  } catch {
    return undefined;
  }
}

const findT3 = (configured?: string) => configured || serviceBinary() || which("t3");

export async function probeT3(configured?: string) {
  const binary = findT3(configured);
  const version = binary && (await tryRun(binary, ["--version"]));
  return binary && version ? { binary, version } : undefined;
}

export const pinnableT3 = (binary: string) =>
  isAbsolute(binary) && !insideT3Home(binary) ? binary : undefined;

export function runReport(result: RunResult) {
  if (result.status === "completed") return result.reply || "(no reply)";

  const summary = result.error ? `Run ${result.status}: ${result.error}` : `Run ${result.status}`;
  return result.reply ? `${summary}\n\n${result.reply}` : summary;
}

export function createT3(configured?: string) {
  const binary = findT3(configured);
  if (!binary) throw new Error("Couldn't find the T3 Code CLI. Set t3Bin in the config.");

  const t3 = async <T>(schema: z.ZodType<T>, args: string[], input?: string): Promise<T> => {
    const result = await exec(binary, args, input);
    const parsed = schema.safeParse(parseJson(result.stdout));
    if (parsed.success) return parsed.data;

    const output = (result.stderr || result.stdout).trim().slice(-500);
    throw new Error(`t3 ${args.slice(0, 2).join(" ")} exited ${result.code}: ${output}`);
  };

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
