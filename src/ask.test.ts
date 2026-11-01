import { once } from "node:events";
import type { Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { serveAsk } from "./ask.ts";

describe("serveAsk", () => {
  const onQuestion = vi.fn<(threadId: string, question: string) => Promise<void>>(async () => {});
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = serveAsk(0, onQuestion);
    await once(server, "listening");
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    onQuestion.mockClear();
  });

  const post = (body: string, contentType = "application/json") =>
    fetch(`${url}/ask`, { method: "POST", headers: { "content-type": contentType }, body });

  test("answers other paths and methods with 404", async () => {
    expect((await fetch(`${url}/ask`)).status).toBe(404);
    expect(
      (
        await fetch(`${url}/other`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(404);
  });

  test("refuses bodies that aren't JSON with 415, so web pages can't post questions", async () => {
    const body = JSON.stringify({ threadId: "thread-a", question: "Ship it?" });
    expect((await post(body, "text/plain")).status).toBe(415);
    expect((await post(body, "application/x-www-form-urlencoded")).status).toBe(415);
    expect(onQuestion).not.toHaveBeenCalled();
  });

  test("refuses malformed questions with 400", async () => {
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ threadId: "thread-a" }))).status).toBe(400);
    expect((await post(JSON.stringify({ threadId: "", question: "Ship it?" }))).status).toBe(400);
    expect(onQuestion).not.toHaveBeenCalled();
  });

  test("passes the question on and answers 200", async () => {
    const response = await post(
      JSON.stringify({ threadId: "thread-a", question: "Ship it?" }),
      "application/json; charset=utf-8",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(onQuestion).toHaveBeenCalledWith("thread-a", "Ship it?");
  });

  test("answers 502 when the question can't be sent", async () => {
    onQuestion.mockRejectedValueOnce(new Error("signal-cli exited"));
    const response = await post(JSON.stringify({ threadId: "thread-a", question: "Ship it?" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "signal-cli exited" });
  });

  test("survives a client that disconnects mid-body", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const connected = once(server, "connection");
    const client = connect((server.address() as AddressInfo).port, "127.0.0.1");
    const [serverSocket] = await connected;
    const serverClosed = new Promise((resolve) => serverSocket.once("close", resolve));
    client.end(
      "POST /ask HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{",
    );
    await serverClosed;
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(onQuestion).not.toHaveBeenCalled();
  });
});
