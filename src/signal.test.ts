import { describe, expect, test } from "vite-plus/test";
import { parseIncoming } from "./signal.ts";

const owner = "+61400000000";
const ownerIds = [owner, "uuid-owner"];

function receive(envelope: Record<string, unknown>) {
  return { jsonrpc: "2.0", method: "receive", params: { envelope, account: "+61400000001" } };
}

describe("parseIncoming", () => {
  test("reads the owner's message and the message it quotes", () => {
    const line = receive({
      sourceNumber: owner,
      sourceUuid: "uuid-owner",
      timestamp: 5,
      dataMessage: { message: "yes", quote: { id: 3, text: "Redirect?" } },
    });
    expect(parseIncoming(line, ownerIds)).toEqual({
      timestamp: 5,
      text: "yes",
      quotedTimestamp: 3,
    });
  });

  test("accepts the owner by UUID when their number is hidden", () => {
    const line = receive({
      sourceNumber: null,
      sourceUuid: "uuid-owner",
      timestamp: 5,
      dataMessage: { message: "hi" },
    });
    expect(parseIncoming(line, ownerIds)).toEqual({
      timestamp: 5,
      text: "hi",
      quotedTimestamp: undefined,
    });
  });

  test("drops messages from anyone else", () => {
    const line = receive({
      sourceNumber: "+61400000009",
      sourceUuid: "uuid-other",
      timestamp: 5,
      dataMessage: { message: "hi" },
    });
    expect(parseIncoming(line, ownerIds)).toBeUndefined();
  });

  test("drops receipts, typing indicators and other notifications", () => {
    expect(
      parseIncoming(receive({ sourceNumber: owner, timestamp: 5, typingMessage: {} }), ownerIds),
    ).toBeUndefined();
    expect(parseIncoming({ jsonrpc: "2.0", id: "1", result: {} }, ownerIds)).toBeUndefined();
  });
});
