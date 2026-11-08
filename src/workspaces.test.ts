import { mkdirSync, mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const t3Home = mkdtempSync(join(tmpdir(), "t3-home-"));
vi.stubEnv("T3CODE_HOME", t3Home);
const { listWorkspaces, pickWorkspace } = await import("./workspaces.ts");

type Row = { title: string; root: string; deleted?: string; archived?: string };

function seedProjects(rows: Row[]) {
  const db = new DatabaseSync(join(t3Home, "userdata/statev2.sqlite"));
  db.exec(`DROP TABLE IF EXISTS projection_projects;
    CREATE TABLE projection_projects (title, workspace_root, deleted_at, archived_at, created_at)`);
  const insert = db.prepare("INSERT INTO projection_projects VALUES (?, ?, ?, ?, ?)");
  rows.forEach(({ title, root, deleted, archived }, index) =>
    insert.run(title, root, deleted ?? null, archived ?? null, index),
  );
  db.close();
}

describe("listWorkspaces", () => {
  beforeEach(() => {
    mkdirSync(join(t3Home, "userdata"), { recursive: true });
  });

  test("makes a project addressable by its lowercase, hyphenated title", async () => {
    seedProjects([{ title: "My API", root: "/work/my-api" }]);

    expect(pickWorkspace("my-api: bump deps", await listWorkspaces())).toEqual({
      path: "/work/my-api",
      isProject: true,
      text: "bump deps",
    });
  });

  test("treats a workspace inside T3 home as the scratch space, not a project", async () => {
    const scratch = join(t3Home, "scratch");
    seedProjects([
      { title: "No project", root: scratch },
      { title: "Website", root: "/work/website" },
    ]);

    expect(await listWorkspaces()).toEqual({
      projects: [{ name: "website", path: "/work/website" }],
      scratchPath: scratch,
    });
  });

  test("leaves out deleted and archived projects", async () => {
    seedProjects([
      { title: "Gone", root: "/work/gone", deleted: "2026-01-01" },
      { title: "Shelved", root: "/work/shelved", archived: "2026-01-01" },
      { title: "Live", root: "/work/live" },
    ]);

    expect((await listWorkspaces()).projects).toEqual([{ name: "live", path: "/work/live" }]);
  });
});

describe("pickWorkspace", () => {
  const scratchPath = "/home/me/.t3/scratch";
  const workspaces = {
    projects: [
      { name: "web", path: "/work/web" },
      { name: "api", path: "/work/api" },
    ],
    scratchPath,
  };

  test("a project prefix picks the project, ignoring case", () => {
    expect(pickWorkspace("Api: bump deps", workspaces, "/work/web")).toEqual({
      path: "/work/api",
      isProject: true,
      text: "bump deps",
    });
  });

  test("a prefix that isn't a project stays in the message", () => {
    expect(pickWorkspace("note: check the database", workspaces)).toEqual({
      path: scratchPath,
      isProject: false,
      text: "note: check the database",
    });
  });

  test("a message without a prefix goes to the default project", () => {
    expect(pickWorkspace("fix the login bug", workspaces, "/work/web")).toEqual({
      path: "/work/web",
      isProject: true,
      text: "fix the login bug",
    });
  });

  test("a default project T3 Code no longer has falls back to the scratch space", () => {
    expect(pickWorkspace("fix the login bug", workspaces, "/work/gone")).toEqual({
      path: scratchPath,
      isProject: false,
      text: "fix the login bug",
    });
  });

  test("without a scratch space, a message needs a project prefix", () => {
    expect(() => pickWorkspace("fix the login bug", { projects: workspaces.projects })).toThrow(
      /project name/,
    );
  });
});
