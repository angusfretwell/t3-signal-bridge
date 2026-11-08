import { describe, expect, test } from "vite-plus/test";
import { route } from "./route.ts";

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
