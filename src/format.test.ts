import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { threadMessage, toSignal } from "./format.ts";

function emptyFile(name: string) {
  const file = join(mkdtempSync(join(tmpdir(), "format-")), name);
  writeFileSync(file, "");
  return file;
}

function styledText(markdown: string) {
  const { text, styles } = toSignal(markdown);
  return {
    text,
    styles: styles.map(({ start, length, style }) => [style, text.slice(start, start + length)]),
  };
}

describe("toSignal", () => {
  test("turns emphasis, headings and code into Signal text styles", () => {
    expect(
      styledText("# Done\n\nI **fixed** the *flaky* test in `ci.yml`, ~~not~~ the build."),
    ).toEqual({
      text: "Done\n\nI fixed the flaky test in ci.yml, not the build.",
      styles: [
        ["BOLD", "Done"],
        ["BOLD", "fixed"],
        ["ITALIC", "flaky"],
        ["MONOSPACE", "ci.yml"],
        ["STRIKETHROUGH", "not"],
      ],
    });
  });

  test("counts offsets in UTF-16 units after emoji", () => {
    expect(styledText("👩‍💻 **ok**")).toEqual({ text: "👩‍💻 ok", styles: [["BOLD", "ok"]] });
  });

  test("keeps code blocks whole in monospace", () => {
    expect(styledText("Run:\n\n```sh\nnpm test\nnpm run build\n```")).toEqual({
      text: "Run:\n\nnpm test\nnpm run build",
      styles: [["MONOSPACE", "npm test\nnpm run build"]],
    });
  });

  test("drops blank code blocks", () => {
    expect(toSignal("Before\n\n```\n   \n```\n\nAfter")).toEqual({
      text: "Before\n\nAfter",
      styles: [],
      attachments: [],
    });
  });

  test("writes link targets after their labels", () => {
    expect(
      toSignal("See [the PR](https://github.com/a/b/pull/1) or https://example.com.").text,
    ).toBe("See the PR (https://github.com/a/b/pull/1) or https://example.com.");
  });

  test("bullets, numbers and indents lists", () => {
    expect(toSignal("- one\n- two\n  1. nested\n  2. again\n- [x] done\n- [ ] todo").text).toBe(
      "• one\n• two\n  1. nested\n  2. again\n☑ done\n☐ todo",
    );
  });

  test("starts ordered lists at their first number", () => {
    expect(toSignal("3. three\n4. four").text).toBe("3. three\n4. four");
  });

  test("marks quotes with a bar", () => {
    expect(toSignal("You said:\n\n> ship it\n> today\n\nDone.").text).toBe(
      "You said:\n\n│ ship it\n│ today\n\nDone.",
    );
  });

  test("lines tables up in monospace", () => {
    expect(styledText("| Test | Result |\n| --- | --- |\n| unit | pass |\n| e2e | fail |")).toEqual(
      {
        text: "Test │ Result\n─────┼───────\nunit │ pass\ne2e  │ fail",
        styles: [["MONOSPACE", "Test │ Result\n─────┼───────\nunit │ pass\ne2e  │ fail"]],
      },
    );
  });

  test("attaches local images and drops them from the text", () => {
    const image = emptyFile("shot one.png");

    expect(toSignal(`Here it is:\n\n![shot](<${image}>)\n\nLooks good.`)).toEqual({
      text: "Here it is:\n\nLooks good.",
      styles: [],
      attachments: [image],
    });
    expect(toSignal(`![shot](${image.replace(" ", "%20")})`).attachments).toEqual([image]);
    expect(toSignal(`![shot](file://${image.replace(" ", "%20")})`).attachments).toEqual([image]);
  });

  test("drops the gap left by images on neighbouring lines", () => {
    const [one, two] = [emptyFile("one.png"), emptyFile("two.png")];

    expect(toSignal(`Before:\n\n![one](${one})\n![two](${two})\n\nAfter.`)).toEqual({
      text: "Before:\n\nAfter.",
      styles: [],
      attachments: [one, two],
    });
  });

  test("links images it can't attach", () => {
    expect(toSignal("![chart](https://example.com/c.png) ![gone](/nope/missing.png)")).toEqual({
      text: "chart (https://example.com/c.png) gone (/nope/missing.png)",
      styles: [],
      attachments: [],
    });
  });

  test("links image paths it can't decode", () => {
    expect(toSignal("![odd](/nope/100%.png) ![remote](file://host/c.png)")).toEqual({
      text: "odd (/nope/100%.png) remote (file://host/c.png)",
      styles: [],
      attachments: [],
    });
  });

  test("attaches files whose names contain a literal %", () => {
    const image = emptyFile("100%.png");
    expect(toSignal(`![full](${image})`).attachments).toEqual([image]);
  });

  test("doesn't attach directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "format-"));
    expect(toSignal(`![dir](${dir})`)).toEqual({
      text: `dir (${dir})`,
      styles: [],
      attachments: [],
    });
  });

  test("leaves plain text alone", () => {
    expect(toSignal("Done. Nothing to report.\nSecond line.")).toEqual({
      text: "Done. Nothing to report.\nSecond line.",
      styles: [],
      attachments: [],
    });
  });
});

describe("threadMessage", () => {
  const header = (title: string) => threadMessage(title, "").text.trimEnd();

  test("keeps short titles whole", () => {
    expect(header("Bump deps")).toBe("🧵 Bump deps");
  });

  test("cuts long titles to 40 characters", () => {
    expect(header("just testing signal integration out, don’t do anything, just reply to me")).toBe(
      "🧵 just testing signal integration out, do…",
    );
  });

  test("keeps emoji whole when cutting", () => {
    expect(header(`${"a".repeat(38)}👩‍💻 and more`)).toBe(`🧵 ${"a".repeat(38)}👩‍💻…`);
  });

  test("puts the thread header first and keeps styles on their text", () => {
    const { text, styles } = threadMessage("👩‍💻 Fix login", "I **fixed** it");
    expect(text).toBe("🧵 👩‍💻 Fix login\n\nI fixed it");
    expect(styles.map(({ start, length }) => text.slice(start, start + length))).toEqual(["fixed"]);
  });
});
