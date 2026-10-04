import { describe, expect, it } from "vitest";
import { withoutGeneratedSignature } from "./email-draft-text.ts";

describe("AI email draft signature removal", () => {
  it("removes a trailing Norwegian sign-off and sender name", () => {
    expect(
      withoutGeneratedSignature(
        "Hei!\n\nKan vi møtes på tirsdag?\n\nMed vennlig hilsen\nOla Olsen",
      ),
    ).toBe("Hei!\n\nKan vi møtes på tirsdag?");
  });

  it("keeps greetings in the message body", () => {
    expect(withoutGeneratedSignature("Vi skrev 'hilsen' i malen.\nTakk for praten.")).toBe(
      "Vi skrev 'hilsen' i malen.\nTakk for praten.",
    );
  });
});
