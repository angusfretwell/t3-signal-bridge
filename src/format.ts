import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { List, ListItem, Nodes, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import type { StyleRange, TextStyle } from "./signal.ts";

const inlineStyles: Partial<Record<Nodes["type"], TextStyle>> = {
  strong: "BOLD",
  emphasis: "ITALIC",
  delete: "STRIKETHROUGH",
  heading: "BOLD",
};

const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile();

function localFile(url: string) {
  try {
    const path = url.startsWith("file:") ? fileURLToPath(url) : url;
    if (!path.startsWith("/")) return undefined;
    if (isFile(path)) return path;

    const decoded = decodeURIComponent(path);
    return isFile(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function tableLines(table: Table) {
  const rows = table.children.map((row) => row.children.map((cell) => toString(cell)));
  const [header = [], ...body] = rows;
  const widths = header.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    widths
      .map((width, column) => (cells[column] ?? "").padEnd(width))
      .join(" │ ")
      .trimEnd();

  return [line(header), widths.map((width) => "─".repeat(width)).join("─┼─"), ...body.map(line)];
}

function listMarker(item: ListItem, number: number | undefined) {
  if (typeof item.checked === "boolean") return item.checked ? "☑ " : "☐ ";
  return number === undefined ? "• " : `${number}. `;
}

export function toSignal(markdown: string) {
  let text = "";
  let indent = "";
  const styles: StyleRange[] = [];
  const attachments: string[] = [];

  function write(value: string) {
    text += value.replaceAll("\n", `\n${indent}`);
  }

  function styled(style: TextStyle, content: () => void) {
    const start = text.length;
    content();
    if (text.length > start) styles.push({ start, length: text.length - start, style });
  }

  function indented(prefix: string, content: () => void, continuation = " ".repeat(prefix.length)) {
    const outer = indent;
    indent += continuation;
    write(prefix);
    content();
    indent = outer;
  }

  function truncate(length: number) {
    text = text.slice(0, length);
    while ((styles.at(-1)?.start ?? -1) >= length) styles.pop();
  }

  function blocks<T extends Nodes>(
    children: T[],
    separator: string,
    renderChild: (child: T, index: number) => void = render,
  ) {
    let wroteBlock = false;
    for (const [index, child] of children.entries()) {
      const before = text.length;
      if (wroteBlock) write(separator);
      const afterSeparator = text.length;
      renderChild(child, index);

      const blank = !text.slice(afterSeparator).trim();
      if (blank) truncate(before);
      else wroteBlock = true;
    }
  }

  function list(node: List) {
    const start = node.start ?? 1;
    blocks(node.children, node.spread ? "\n\n" : "\n", (item, index) => {
      const number = node.ordered ? start + index : undefined;
      indented(listMarker(item, number), () => blocks(item.children, item.spread ? "\n\n" : "\n"));
    });
  }

  function inline(children: Nodes[]) {
    for (const child of children) render(child);
  }

  function render(node: Nodes): void {
    const style = inlineStyles[node.type];
    if (style && "children" in node) return styled(style, () => inline(node.children));

    switch (node.type) {
      case "root":
        return blocks(node.children, "\n\n");
      case "blockquote":
        return indented("│ ", () => blocks(node.children, "\n\n"), "│ ");
      case "list":
        return list(node);
      case "text":
      case "html":
        return write(node.value);
      case "inlineCode":
      case "code":
        return styled("MONOSPACE", () => write(node.value));
      case "table":
        return styled("MONOSPACE", () => write(tableLines(node).join("\n")));
      case "break":
        return write("\n");
      case "thematicBreak":
        return write("———");
      case "link": {
        const label = toString(node);
        if (!label || label === node.url || `mailto:${label}` === node.url) return write(node.url);
        inline(node.children);
        return write(` (${node.url})`);
      }
      case "image": {
        const file = localFile(node.url);
        if (file) {
          attachments.push(file);
          return;
        }
        return write(node.alt ? `${node.alt} (${node.url})` : node.url);
      }
      case "imageReference":
        return write(node.alt ?? "");
      case "footnoteDefinition":
        return;
      default:
        if ("children" in node) return inline(node.children);
    }
  }

  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  render(tree);

  return { text, styles, attachments };
}

const maxTitleLength = 40;

function threadHeader(title: string) {
  const characters = Array.from(new Intl.Segmenter().segment(title), ({ segment }) => segment);
  if (characters.length <= maxTitleLength) return `🧵 ${title}`;

  const cut = characters.slice(0, maxTitleLength - 1).join("");
  return `🧵 ${cut.trimEnd()}…`;
}

export function threadMessage(title: string, markdown: string) {
  const header = `${threadHeader(title)}\n\n`;
  const { text, styles, attachments } = toSignal(markdown);
  return {
    text: header + text,
    styles: styles.map((range) => ({ ...range, start: range.start + header.length })),
    attachments,
  };
}
