import { createInterface } from "node:readline";
import { connect } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSmtpServer, MAX_MESSAGE_BYTES } from "./smtp.ts";

const servers: ReturnType<typeof createSmtpServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(done))),
  );
});

async function sendMessage(
  port: number,
  recipient = "contac@plingapp.no",
  body = "Hello there",
  declaredSize?: number,
) {
  const socket = connect(port, "127.0.0.1");
  const lines = createInterface({ input: socket, crlfDelay: Infinity })[Symbol.asyncIterator]();
  const replies: string[] = [];
  const reply = async () => {
    while (true) {
      const next = await lines.next();
      if (next.done) throw new Error("SMTP connection closed before a reply");
      replies.push(next.value);
      if (/^\d{3} /.test(next.value)) return next.value;
    }
  };
  try {
    await reply();
    for (const command of [
      "EHLO example.test",
      `MAIL FROM:<sender@example.test>${declaredSize === undefined ? "" : ` SIZE=${declaredSize}`}`,
      `RCPT TO:<${recipient}>`,
    ]) {
      socket.write(`${command}\r\n`);
      const response = await reply();
      if ((command.startsWith("RCPT") || command.startsWith("MAIL")) && !response.startsWith("250"))
        return response;
      expect(response).toMatch(/^250 /);
      if (command.startsWith("EHLO"))
        expect(replies).toEqual(
          expect.arrayContaining([
            expect.stringMatching(new RegExp(`^250[- ]SIZE ${MAX_MESSAGE_BYTES}$`)),
          ]),
        );
    }
    socket.write("DATA\r\n");
    expect(await reply()).toMatch(/^354 /);
    socket.write(
      "From: Sender <sender@example.test>\r\n" +
        "To: Person <person@example.test>\r\n" +
        "Message-ID: <mail-123@example.test>\r\n" +
        "Subject: A note\r\n" +
        "\r\n" +
        `${body}\r\n.\r\n`,
    );
    return await reply();
  } finally {
    socket.end();
  }
}

async function listen(fetchWebhook: (url: string, init: RequestInit) => Promise<Response>) {
  const smtp = createSmtpServer({
    address: "contac@plingapp.no",
    webhookUrl: "http://api:8787/webhooks/inbound-email",
    secret: "test-secret",
    fetchWebhook,
  });
  servers.push(smtp);
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const address = smtp.server.address();
  if (!address || typeof address === "string") throw new Error("SMTP did not bind to a TCP port");
  return address.port;
}

describe("separate SMTP intake", () => {
  it("accepts mail larger than the old 1 MB limit", async () => {
    const fetchWebhook = vi.fn(async () => Response.json({ accepted: true }, { status: 202 }));
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port, undefined, "a".repeat(1_100_000), 1_101_000)).toMatch(/^250 /);
    expect(fetchWebhook).toHaveBeenCalledOnce();
  });
  it("rejects a declared message above 10 MB", async () => {
    const fetchWebhook = vi.fn(async () => Response.json({ accepted: true }));
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port, undefined, "text", MAX_MESSAGE_BYTES + 1)).toMatch(/^552 /);
    expect(fetchWebhook).not.toHaveBeenCalled();
  });
  it("rejects oversized DATA even without a declared size", async () => {
    const fetchWebhook = vi.fn(async () => Response.json({ accepted: true }));
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port, undefined, "a".repeat(MAX_MESSAGE_BYTES))).toMatch(/^552 /);
    expect(fetchWebhook).not.toHaveBeenCalled();
  });
  it("forwards a parsed message and acknowledges it only after the webhook succeeds", async () => {
    const fetchWebhook = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ accepted: true }, { status: 202 }),
    );
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port)).toMatch(/^250 /);
    expect(fetchWebhook).toHaveBeenCalledOnce();
    const [url, init] = fetchWebhook.mock.calls[0]!;
    expect(url).toBe("http://api:8787/webhooks/inbound-email");
    expect(init.headers).toEqual({
      authorization: "Bearer test-secret",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      providerMessageId: "<mail-123@example.test>",
      fromEmail: "sender@example.test",
      toEmails: ["person@example.test"],
      bccEmails: ["contac@plingapp.no"],
      subject: "A note",
      body: "Hello there",
    });
  });

  it("temporarily rejects mail when the API cannot persist it", async () => {
    const fetchWebhook = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port)).toMatch(/^451 /);
    expect(fetchWebhook).toHaveBeenCalledOnce();
  });

  it("does not acknowledge an unrelated successful HTTP response", async () => {
    const fetchWebhook = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ ok: true }),
    );
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port)).toMatch(/^451 /);
  });

  it("acknowledges a message that the API has already stored", async () => {
    const fetchWebhook = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ duplicate: true }),
    );
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port)).toMatch(/^250 /);
  });

  it("rejects unrelated recipients without calling the webhook", async () => {
    const fetchWebhook = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ accepted: true }, { status: 202 }),
    );
    const port = await listen(fetchWebhook);
    expect(await sendMessage(port, "other@plingapp.no")).toMatch(/^550 /);
    expect(fetchWebhook).not.toHaveBeenCalled();
  });
});
