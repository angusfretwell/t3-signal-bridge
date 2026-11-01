import { describe, expect, test } from "vite-plus/test";
import { pickWorkspace, route } from "./route.ts";

const threads = new Map([[1000, "thread-a"]]);
const threadFor = (timestamp: number) => threads.get(timestamp);

describe("route", () => {
  test("a quote-reply to a known message goes to that thread", () => {
    expect(route({ text: " yes, redirect ", quotedTimestamp: 1000 }, threadFor)).toEqual({
      kind: "reply",
      threadId: "thread-a",
      text: "yes, redirect",
    });
  });

  test("a quote-reply to an unknown message is flagged", () => {
    expect(route({ text: "yes", quotedTimestamp: 2000 }, threadFor)).toEqual({
      kind: "unknown-quote",
    });
  });

  test("a plain message starts a thread", () => {
    expect(route({ text: " fix the login bug " }, threadFor)).toEqual({
      kind: "start",
      text: "fix the login bug",
    });
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
      'T3 Code has no "No project" space. Start the message with a project name.',
    );
  });
});
