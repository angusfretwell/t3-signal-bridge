import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { List, ListItem, Nodes, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";

export type TextStyle = "BOLD" | "ITALIC" | "STRIKETHROUGH" | "MONOSPACE";
export type StyleRange = { start: number; length: number; style: TextStyle };
export type SignalMessage = { text: string; styles: StyleRange[]; attachments: string[] };

const inlineStyles: Partial<Record<Nodes["type"], TextStyle>> = {
  strong: "BOLD",
  emphasis: "ITALIC",
  delete: "STRIKETHROUGH",
  heading: "BOLD",
};

function localFile(url: string) {
  const path = url.startsWith("file:") ? fileURLToPath(url) : url;
  if (!path.startsWith("/")) return undefined;
  return [path, decodeURIComponent(path)].find((candidate) => existsSync(candidate));
}

function tableLines(table: Table) {
  const rows = table.children.map((row) => row.children.map((cell) => toString(cell)));
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  if (!widths) return [];
  const line = (cells: string[]) =>
    widths
      .map((width, column) => (cells[column] ?? "").padEnd(width))
      .join(" │ ")
      .trimEnd();
  const [header = [], ...body] = rows;
  return [line(header), widths.map((width) => "─".repeat(width)).join("─┼─"), ...body.map(line)];
}

function listMarker(item: ListItem, number: number | undefined) {
  if (typeof item.checked === "boolean") return item.checked ? "☑ " : "☐ ";
  return number === undefined ? "• " : `${number}. `;
}

export function toSignal(markdown: string): SignalMessage {
  let text = "";
  const styles: StyleRange[] = [];
  const attachments: string[] = [];
  let indent = "";

  function write(value: string) {
    text += value.replaceAll("\n", `\n${indent}`);
  }

  function styled(style: TextStyle, render: () => void) {
    const start = text.length;
    render();
    if (text.length > start) styles.push({ start, length: text.length - start, style });
  }

  function indented(prefix: string, render: () => void, continuation = " ".repeat(prefix.length)) {
    const outer = indent;
    indent += continuation;
    write(prefix);
    render();
    indent = outer;
  }

  function blocks<T extends Nodes>(
    children: T[],
    separator: string,
    renderChild: (child: T) => void = render,
  ) {
    let first = true;
    for (const child of children) {
      const before = text.length;
      if (!first) write(separator);
      const afterSeparator = text.length;
      renderChild(child);
      if (text.slice(afterSeparator).trim()) first = false;
      else {
        text = text.slice(0, before);
        while ((styles.at(-1)?.start ?? -1) >= before) styles.pop();
      }
    }
  }

  function list(node: List) {
    const start = node.start ?? 1;
    blocks(node.children, node.spread ? "\n\n" : "\n", (item) => {
      const number = node.ordered ? start + node.children.indexOf(item) : undefined;
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
      case "paragraph":
        return inline(node.children);
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
      case "definition":
      case "footnoteDefinition":
      case "yaml":
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
