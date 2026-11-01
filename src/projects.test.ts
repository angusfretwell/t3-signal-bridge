import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { paths } from "./paths.ts";
import { toWorkspaces } from "./projects.ts";

describe("toWorkspaces", () => {
  test("turns a project title into a lowercase, hyphenated name", () => {
    expect(toWorkspaces([{ title: "My API", workspace_root: "/work/my-api" }])).toEqual({
      projects: [{ name: "my-api", path: "/work/my-api" }],
      scratchPath: undefined,
    });
  });

  test("treats a workspace inside T3 home as the scratch space, not a project", () => {
    const scratch = join(paths.t3Home, "scratch");
    const { projects, scratchPath } = toWorkspaces([
      { title: "No project", workspace_root: scratch },
      { title: "Website", workspace_root: "/work/website" },
    ]);
    expect(scratchPath).toBe(scratch);
    expect(projects).toEqual([{ name: "website", path: "/work/website" }]);
  });

  test("keeps the order T3 Code lists projects in", () => {
    const { projects } = toWorkspaces([
      { title: "Zebra", workspace_root: "/work/zebra" },
      { title: "Apple", workspace_root: "/work/apple" },
      { title: "Mango", workspace_root: "/work/mango" },
    ]);
    expect(projects.map((project) => project.name)).toEqual(["zebra", "apple", "mango"]);
  });
});
