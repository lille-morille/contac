import { describe, expect, it } from "vitest";
import { parseInlineForward } from "./forwarded-email.ts";

describe("inline forwarded mail", () => {
  it("extracts an original message without retaining the forwarding signature", () => {
    const result = parseInlineForward(
      `—\nAnders Morille\nNTNU School of Entrepreneurship\n[PastedGraphic-1.png]\n\nBegin forwarded message:\n\nFrom: Anders Morille <anders.morille@gmail.com>\nSubject: Hva skjer da brur\nDate: 8 October 2026 at 23:16:25 GMT+2\nTo: Anders Noel Lothe Morille <anmorill@stud.ntnu.no>\n\nHalla mann, alt bra eller?`,
      "Fwd: Hva skjer da brur",
    );
    expect(result).toEqual({
      forwarded: true,
      message: {
        source: "inline",
        confidence: "certain",
        fromEmail: "anders.morille@gmail.com",
        toEmails: ["anmorill@stud.ntnu.no"],
        ccEmails: [],
        subject: "Hva skjer da brur",
        body: "Halla mann, alt bra eller?",
        occurredAt: "2026-10-08T21:16:25.000Z",
      },
    });
  });

  it("recognizes a forwarded header block without relying on a client's marker", () => {
    const result = parseInlineForward(
      "Please log this\n\nFrom: External <external@example.org>\nSent: Thu, 8 Oct 2026 23:16:25 +0200\nTo: Teammate <teammate@example.no>\nSubject: Project\n\nOriginal message",
      "WG: Project",
    );
    expect(result.message).toMatchObject({
      confidence: "certain",
      fromEmail: "external@example.org",
      toEmails: ["teammate@example.no"],
      subject: "Project",
      body: "Original message",
    });
  });

  it("marks incomplete forwards for inbox review", () => {
    const result = parseInlineForward(
      "From: External <external@example.org>\nTo: Teammate <teammate@example.no>\nSubject: Project\n\nOriginal message",
      "Fwd: Project",
    );
    expect(result.forwarded).toBe(true);
    expect(result.message?.confidence).toBe("review");
  });

  it("keeps ordinary messages out of the forwarded path", () => {
    expect(parseInlineForward("Hello there", "Project")).toEqual({
      forwarded: false,
      message: null,
    });
  });
});
