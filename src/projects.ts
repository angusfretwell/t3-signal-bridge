import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { z } from "zod";
import { paths } from "./paths.ts";

export type Project = { name: string; path: string };

const rowsSchema = z.array(z.object({ title: z.string(), workspace_root: z.string() }));

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const insideT3Home = (path: string) => !relative(paths.t3Home, path).startsWith("..");

export async function listProjects(): Promise<{ projects: Project[]; noProject?: string }> {
  const { DatabaseSync } = await import("node:sqlite");
  const file = join(paths.t3Home, "userdata/statev2.sqlite");
  let rows: unknown;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    rows = db
      .prepare(
        "SELECT title, workspace_root FROM projection_projects WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at",
      )
      .all();
    db.close();
  } catch (error) {
    throw new Error(
      `Couldn't read T3 Code's projects from ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = rowsSchema.parse(rows);
  return {
    projects: parsed
      .filter((row) => !insideT3Home(row.workspace_root))
      .map((row) => ({ name: slug(row.title), path: row.workspace_root })),
    noProject: parsed.find((row) => insideT3Home(row.workspace_root))?.workspace_root,
  };
}

export function defaultBranch(projectPath: string) {
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", ["-C", projectPath, ...args], {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    } catch {
      return undefined;
    }
  };
  const remoteHead = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  return remoteHead?.replace(/^origin\//, "") ?? git("rev-parse", "--abbrev-ref", "HEAD") ?? "HEAD";
}
