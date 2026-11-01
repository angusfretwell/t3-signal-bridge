import { describe, expect, test } from "vite-plus/test";
import { route } from "./route.ts";

const threads = new Map([[1000, "thread-a"]]);
const threadFor = (timestamp: number) => threads.get(timestamp);
const projects = ["web", "api"];

describe("route", () => {
  test("a quote-reply to a known message goes to that thread", () => {
    expect(route({ text: " yes, redirect ", quotedTimestamp: 1000 }, threadFor, projects)).toEqual({
      kind: "reply",
      threadId: "thread-a",
      text: "yes, redirect",
    });
  });

  test("a quote-reply to an unknown message is flagged", () => {
    expect(route({ text: "yes", quotedTimestamp: 2000 }, threadFor, projects)).toEqual({
      kind: "unknown-quote",
    });
  });

  test("a plain message starts a thread with no project", () => {
    expect(route({ text: "fix the login bug" }, threadFor, projects)).toEqual({
      kind: "start",
      text: "fix the login bug",
    });
  });

  test("a project prefix picks the project, ignoring case", () => {
    expect(route({ text: "Api: bump deps" }, threadFor, projects)).toEqual({
      kind: "start",
      project: "api",
      text: "bump deps",
    });
  });

  test("a prefix that isn't a project stays in the message", () => {
    expect(route({ text: "note: check the database" }, threadFor, projects)).toEqual({
      kind: "start",
      text: "note: check the database",
    });
  });
});
