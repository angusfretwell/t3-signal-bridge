import { describe, expect, test } from "vite-plus/test";
import { runReport } from "./t3.ts";

describe("runReport", () => {
  test("reports a completed run as its reply", () => {
    expect(runReport({ threadId: "t", status: "completed", reply: "Done." })).toBe("Done.");
  });

  test("says when a completed run didn't reply", () => {
    expect(runReport({ threadId: "t", status: "completed", reply: null })).toBe("(no reply)");
  });

  test("leads a failed run with its status and error, then the reply", () => {
    expect(
      runReport({ threadId: "t", status: "failed", error: "out of tokens", reply: "Half done." }),
    ).toBe("Run failed: out of tokens\n\nHalf done.");
  });
});
