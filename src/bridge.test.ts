import { describe, expect, test } from "vite-plus/test";
import { threadHeader } from "./bridge.ts";

describe("threadHeader", () => {
  test("keeps short titles whole", () => {
    expect(threadHeader("Bump deps")).toBe("🧵 Bump deps");
  });

  test("cuts long titles to 40 characters", () => {
    expect(
      threadHeader("just testing signal integration out, don’t do anything, just reply to me"),
    ).toBe("🧵 just testing signal integration out, do…");
  });
});
