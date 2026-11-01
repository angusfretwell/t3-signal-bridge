import { describe, expect, test } from "vite-plus/test";
import { renderAskShim, renderUnit } from "./service.ts";

describe("renderUnit", () => {
  test("quotes paths and escapes systemd specifiers", () => {
    expect(renderUnit("/opt/my node/bin/node", "/home/a$b/app/cli.mjs")).toContain(
      'ExecStart="/opt/my node/bin/node" "/home/a$$b/app/cli.mjs" run',
    );
  });
});

describe("renderAskShim", () => {
  test("quotes paths for sh and forwards arguments", () => {
    expect(renderAskShim("/opt/my node/bin/node", "/home/a$b/app/cli.mjs")).toBe(
      '#!/bin/sh\nexec "/opt/my node/bin/node" "/home/a\\$b/app/cli.mjs" ask "$@"\n',
    );
  });
});
