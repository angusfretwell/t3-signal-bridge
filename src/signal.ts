import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import { paths } from "./paths.ts";
import { parseJson } from "./util.ts";

export type Incoming = { timestamp: number; text: string; quotedTimestamp?: number };

export type TextStyle = "BOLD" | "ITALIC" | "STRIKETHROUGH" | "MONOSPACE";
export type StyleRange = { start: number; length: number; style: TextStyle };
export type Outgoing = { text: string; styles?: StyleRange[]; attachments?: string[] };

const envelopeSchema = z.object({
  source: z.string().nullish(),
  sourceNumber: z.string().nullish(),
  sourceUuid: z.string().nullish(),
  timestamp: z.number(),
  dataMessage: z
    .object({
      message: z.string().nullish(),
      quote: z.object({ id: z.number() }).nullish(),
    })
    .nullish(),
});

const receiveSchema = z.object({
  method: z.literal("receive"),
  params: z.object({ envelope: envelopeSchema }),
});

export function parseIncoming(line: unknown, ownerIds: string[]): Incoming | undefined {
  const notification = receiveSchema.safeParse(line);
  if (!notification.success) return undefined;

  const { envelope } = notification.data.params;
  const senders = [envelope.source, envelope.sourceNumber, envelope.sourceUuid];
  const text = envelope.dataMessage?.message;
  if (!senders.some((sender) => sender && ownerIds.includes(sender)) || !text) return undefined;

  return {
    timestamp: envelope.timestamp,
    text,
    quotedTimestamp: envelope.dataMessage?.quote?.id,
  };
}

const responseSchema = z.object({
  id: z.string(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).nullish(),
});

const sendResultSchema = z.object({ timestamp: z.number() });

export const signalCliArgs = (account: string, ...args: string[]) => [
  "--data-dir",
  paths.signalData,
  "-a",
  account,
  ...args,
];

export function connectSignal(options: {
  binary: string;
  botNumber: string;
  owner: string;
  ownerUuid?: string;
  onMessage: (message: Incoming) => void;
}) {
  const { botNumber, owner } = options;
  const ownerIds = [owner, options.ownerUuid].filter((id): id is string => !!id);
  const child = spawn(options.binary, signalCliArgs(botNumber, "jsonRpc"), {
    stdio: ["pipe", "pipe", "inherit"],
  });
  process.on("exit", () => child.kill());
  const pending = new Map<
    string,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 0;

  createInterface({ input: child.stdout }).on("line", (line) => {
    const json = parseJson(line);
    if (json === undefined) return;
    const response = responseSchema.safeParse(json);
    if (response.success) {
      const request = pending.get(response.data.id);
      pending.delete(response.data.id);
      if (response.data.error)
        request?.reject(new Error(`signal-cli: ${response.data.error.message}`));
      else request?.resolve(response.data.result);
      return;
    }
    const message = parseIncoming(json, ownerIds);
    if (message) options.onMessage(message);
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => {
      for (const request of pending.values())
        request.reject(new Error(`signal-cli exited with code ${code}`));
      pending.clear();
      resolve(code);
    });
  });

  function call(method: string, params: Record<string, unknown>) {
    const id = String(++nextId);
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  return {
    send: async ({ text, styles = [], attachments = [] }: Outgoing) =>
      sendResultSchema.parse(
        await call("send", {
          recipient: [owner],
          message: text,
          textStyle: styles.map(({ start, length, style }) => `${start}:${length}:${style}`),
          attachment: attachments,
        }),
      ).timestamp,
    react: (emoji: string, targetTimestamp: number) =>
      call("sendReaction", { recipient: [owner], emoji, targetAuthor: owner, targetTimestamp }),
    exited,
  };
}
