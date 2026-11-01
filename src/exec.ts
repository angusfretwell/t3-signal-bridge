import { execFile } from "node:child_process";

export type ExecResult = { ok: boolean; code: number | null; stdout: string; stderr: string };

const maxBuffer = 64 * 1024 * 1024;

export function exec(command: string, args: string[], input?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { maxBuffer }, (error, stdout, stderr) => {
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
