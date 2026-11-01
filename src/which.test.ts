import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { onPath, which } from "./which.ts";

let dir: string;
const originalPath = process.env.PATH;
const originalCwd = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "which-"));
  writeFileSync(join(dir, "tool"), "#!/bin/sh\n");
  chmodSync(join(dir, "tool"), 0o755);
});

afterEach(() => {
  process.env.PATH = originalPath;
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

describe("which", () => {
  test("finds an executable on PATH", () => {
    process.env.PATH = ["/nonexistent", dir].join(delimiter);
    expect(which("tool")).toBe(join(dir, "tool"));
  });

  test("ignores empty PATH entries instead of searching the current directory", () => {
    process.chdir(dir);
    process.env.PATH = ["", "/nonexistent"].join(delimiter);
    expect(which("tool")).toBeUndefined();
  });
});

describe("onPath", () => {
  test("matches whole PATH entries", () => {
    process.env.PATH = ["/usr/bin", dir].join(delimiter);
    expect(onPath(dir)).toBe(true);
    expect(onPath("/usr")).toBe(false);
  });
});
