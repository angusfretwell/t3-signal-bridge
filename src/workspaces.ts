import { join } from "node:path";
import { z } from "zod";
import { insideT3Home, t3Home } from "./t3.ts";
import { errorMessage } from "./util.ts";

type Project = { name: string; path: string };
type Workspaces = { projects: Project[]; scratchPath?: string };

const rowsSchema = z.array(z.object({ title: z.string(), workspace_root: z.string() }));

const nameCharacters = String.raw`\w-`;
const outsideName = new RegExp(`[^${nameCharacters}]+`, "g");
const projectPrefix = new RegExp(String.raw`^([${nameCharacters}]+):\s+([\s\S]+)$`);

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(outsideName, "-")
    .replace(/^-+|-+$/g, "");

function toWorkspaces(rows: z.infer<typeof rowsSchema>): Workspaces {
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

export async function listWorkspaces(): Promise<Workspaces> {
  const file = join(t3Home, "userdata/statev2.sqlite");
  try {
    return toWorkspaces(rowsSchema.parse(await queryProjectRows(file)));
  } catch (error) {
    throw new Error(`Couldn't read T3 Code's projects from ${file}: ${errorMessage(error)}`);
  }
}

export function pickWorkspace(
  text: string,
  { projects, scratchPath }: Workspaces,
  defaultProject?: string,
) {
  const [, prefix, rest] = projectPrefix.exec(text) ?? [];
  const named = prefix && projects.find((project) => project.name === prefix.toLowerCase());
  if (named && rest) return { path: named.path, isProject: true, text: rest.trim() };

  const fallback = projects.find((project) => project.path === defaultProject);
  if (fallback) return { path: fallback.path, isProject: true, text };

  if (scratchPath) return { path: scratchPath, isProject: false, text };
  throw new Error('T3 Code has no "No project" space. Start the message with a project name.');
}
