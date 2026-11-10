import { describe, expect, it } from "vitest";
import {
  normalizeCallGuideMarkdown,
  parseCallGuideMarkdown,
  serializeCallGuideMarkdown,
} from "./call-guide-markdown.ts";

/** parse → serialize → parse yields the same document, and serializing is stable. */
function expectRoundTrip(markdown: string) {
  const first = parseCallGuideMarkdown(markdown);
  const serialized = serializeCallGuideMarkdown(first);
  const second = parseCallGuideMarkdown(serialized);
  expect(second).toEqual(first);
  expect(serializeCallGuideMarkdown(second)).toBe(serialized);
  return { doc: first, serialized };
}

function types(markdown: string) {
  return (parseCallGuideMarkdown(markdown).content ?? []).map((node) => node.type);
}

describe("call guide Markdown", () => {
  it.each([
    ["heading 1", "# Åpning", "heading"],
    ["heading 2", "## Behov", "heading"],
    ["heading 3", "### Oppfølging", "heading"],
    ["paragraph", "Hei, jeg ringer fra teamet.", "paragraph"],
    ["bullet list", "- Spør om rolle\n- Spør om team", "bulletList"],
    ["numbered list", "1. Presenter deg\n2. Still spørsmål", "orderedList"],
    ["quote", "> Hva er det største problemet?", "blockquote"],
  ])("keeps a %s", (_name, markdown, type) => {
    const { doc, serialized } = expectRoundTrip(markdown);
    expect(doc.content?.[0]?.type).toBe(type);
    expect(serialized).toBe(markdown);
  });

  it("keeps heading levels", () => {
    const doc = parseCallGuideMarkdown("# En\n\n## To\n\n### Tre");
    expect(doc.content?.map((node) => node.attrs?.level)).toEqual([1, 2, 3]);
  });

  it("keeps a divider between paragraphs", () => {
    const { serialized } = expectRoundTrip("Før\n\n---\n\nEtter");
    expect(types(serialized)).toEqual(["paragraph", "horizontalRule", "paragraph"]);
  });

  it("keeps bold, italic, combined marks, and links", () => {
    const markdown =
      "Si **tydelig** hva du vil, *helt kort*, ***begge***, og vis [nettsiden](https://example.no).";
    const { doc, serialized } = expectRoundTrip(markdown);
    expect(serialized).toBe(markdown);
    const marks = doc.content?.[0]?.content?.flatMap((node) =>
      (node.marks ?? []).map((mark) => mark.type),
    );
    expect(marks).toEqual(expect.arrayContaining(["bold", "italic", "link"]));
    const link = doc.content?.[0]?.content?.find((node) =>
      node.marks?.some((mark) => mark.type === "link"),
    );
    expect(link?.marks?.find((mark) => mark.type === "link")?.attrs?.href).toBe(
      "https://example.no",
    );
  });

  it("keeps a link inside a heading and a bold link inside a list", () => {
    expectRoundTrip("## Les [rapporten](https://example.no/rapport)");
    expectRoundTrip("- Se **[prisene](https://example.no/priser)** først");
  });

  it("keeps nested lists, including mixed bullet and numbered levels", () => {
    const markdown =
      "- Åpning\n  - Navn\n  - Hvorfor vi ringer\n    - Kort\n- Avslutning\n\n" +
      "1. Behov\n   - Hva fungerer?\n   - Hva fungerer ikke?\n2. Neste steg\n   1. Avtal møte";
    const { doc, serialized } = expectRoundTrip(markdown);
    expect(serialized).toBe(markdown);
    const nested = doc.content?.[0]?.content?.[0]?.content?.[1];
    expect(nested?.type).toBe("bulletList");
  });

  it("keeps a numbered list that starts above 1", () => {
    const { serialized } = expectRoundTrip("3. Tre\n4. Fire");
    expect(serialized).toBe("3. Tre\n4. Fire");
  });

  it("keeps lists and marks inside quotes", () => {
    const markdown = "> **Merk:** spør før du noterer\n>\n> - Samtykke\n> - Formål";
    const { serialized } = expectRoundTrip(markdown);
    expect(serialized).toBe(markdown);
  });

  it("does not rewrite a guide that has already been saved by the editor", () => {
    const markdown = [
      "# Samtaleguide for leverandører",
      "Hei, jeg heter **Kari** og studerer *innovasjon*.",
      "## Spørsmål",
      "1. Hva bruker dere i dag?\n   - Hvorfor?\n2. Hva koster det?",
      "> Ikke selg, lytt.",
      "---",
      "Les mer på [nettsiden](https://example.no).",
    ].join("\n\n");
    const saved = normalizeCallGuideMarkdown(markdown);
    expect(saved).toBe(markdown);
    expect(normalizeCallGuideMarkdown(saved)).toBe(saved);
  });

  it("reads equivalent syntax from other clients and then stays stable", () => {
    const markdown = "* stjerne\n* liste\n\n__fet__ og _kursiv_\n\n***";
    const saved = normalizeCallGuideMarkdown(markdown);
    expect(saved).toBe("- stjerne\n- liste\n\n**fet** og *kursiv*\n\n---");
    expect(normalizeCallGuideMarkdown(saved)).toBe(saved);
  });

  it("keeps the text of unsupported Markdown as plain paragraphs", () => {
    const markdown = [
      "#### Dyp overskrift",
      "```\nlinje en\nlinje to\n```",
      "| Rolle | Navn |\n| --- | --- |\n| Leder | Ola |",
      "- [ ] Oppgave",
      "![Logo](https://example.no/logo.png)",
      "Bruk `kode` og ~~gammelt~~ her.",
    ].join("\n\n");
    const saved = normalizeCallGuideMarkdown(markdown);
    for (const text of [
      "Dyp overskrift",
      "linje en",
      "linje to",
      "Rolle | Navn",
      "Leder | Ola",
      "Oppgave",
      "[Logo](https://example.no/logo.png)",
      "Bruk kode og gammelt her.",
    ])
      expect(saved).toContain(text);
    expect(saved).not.toContain("```");
    expect(saved).not.toContain("[ ]");
    expect(types(saved)).not.toContain("codeBlock");
    expect(normalizeCallGuideMarkdown(saved)).toBe(saved);
  });

  it("treats an empty body as an empty document", () => {
    expect(normalizeCallGuideMarkdown("")).toBe("");
    expect(normalizeCallGuideMarkdown("\n\n")).toBe("");
  });

  it("ignores empty paragraphs at the start and end, such as the editor's trailing line", () => {
    const doc = parseCallGuideMarkdown("## Slutt\n\n- punkt");
    const withTrailing = {
      ...doc,
      content: [{ type: "paragraph" }, ...(doc.content ?? []), { type: "paragraph" }, { type: "paragraph" }],
    };
    expect(serializeCallGuideMarkdown(withTrailing)).toBe("## Slutt\n\n- punkt");
  });

  it("keeps blank lines between blocks stable", () => {
    const saved = normalizeCallGuideMarkdown("a\n\n\n\n\n\nb");
    expect(saved).toContain("a");
    expect(normalizeCallGuideMarkdown(saved)).toBe(saved);
  });
});
