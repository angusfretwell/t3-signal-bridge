import { execFile } from "node:child_process";

type ExecResult = { ok: boolean; code: number | null; stdout: string; stderr: string };

export function exec(command: string, args: string[], input?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { maxBuffer: Infinity }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ ok: true, code: 0, stdout, stderr });
      } else if (typeof error.code === "number") {
        resolve({ ok: false, code: error.code, stdout, stderr });
      } else {
        resolve({ ok: false, code: null, stdout, stderr: error.message });
      }
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

export async function run(command: string, args: string[], input?: string): Promise<string> {
  const result = await exec(command, args, input);
  if (!result.ok) throw new Error(result.stderr.trim() || `${command} exited ${result.code}`);
  return result.stdout;
}

export async function tryRun(command: string, args: string[]): Promise<string | undefined> {
  const result = await exec(command, args);
  return result.ok ? result.stdout.trim() : undefined;
}
