import { join } from "node:path";
import { z } from "zod";
import { insideT3Home, paths } from "./paths.ts";
import { errorMessage } from "./util.ts";

type Project = { name: string; path: string };
export type Workspaces = { projects: Project[]; scratchPath?: string };

const rowsSchema = z.array(z.object({ title: z.string(), workspace_root: z.string() }));

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function toWorkspaces(rows: z.infer<typeof rowsSchema>): Workspaces {
  return {
    projects: rows
      .filter((row) => !insideT3Home(row.workspace_root))
      .map((row) => ({ name: slug(row.title), path: row.workspace_root })),
    scratchPath: rows.find((row) => insideT3Home(row.workspace_root))?.workspace_root,
  };
}

async function queryProjectRows(file: string) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });

  try {
    return db
      .prepare(
        "SELECT title, workspace_root FROM projection_projects WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at",
      )
      .all();
  } finally {
    db.close();
  }
}

export async function listProjects(): Promise<Workspaces> {
  const file = join(paths.t3Home, "userdata/statev2.sqlite");
  try {
    return toWorkspaces(rowsSchema.parse(await queryProjectRows(file)));
  } catch (error) {
    throw new Error(`Couldn't read T3 Code's projects from ${file}: ${errorMessage(error)}`);
  }
}
