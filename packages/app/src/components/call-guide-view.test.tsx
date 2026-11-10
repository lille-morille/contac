import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallGuide } from "../lib/call-guides.ts";
import { CallGuidePanel } from "./call-guide-panel.tsx";
import { CallGuideView } from "./call-guide-view.tsx";

const render = (body: string) => renderToStaticMarkup(<CallGuideView body={body} />);

describe("call guide renderer", () => {
  it("renders the supported blocks and marks inside the shared prose class", () => {
    const html = render(
      [
        "# Åpning",
        "## Spørsmål",
        "### Detaljer",
        "Avsnitt med **fet** og *kursiv* tekst og en [lenke](https://example.com).",
        "- Punkt\n  - Underpunkt\n    1. Nummer",
        "1. Første\n2. Andre",
        "> Sitat",
        "---",
      ].join("\n\n"),
    );
    expect(html).toMatch(/^<div class="call-guide-prose">/);
    for (const tag of ["h1", "h2", "h3", "p", "strong", "em", "ul", "ol", "li", "blockquote"])
      expect(html).toContain(`<${tag}>`);
    expect(html).toContain("<hr/>");
    expect(html.replace(/\n/g, "")).toContain(
      "<ul><li>Punkt<ul><li>Underpunkt<ol><li>Nummer</li></ol></li></ul></li></ul>",
    );
  });

  it("opens links in a new tab with safe rel attributes and drops unsafe URLs", () => {
    const html = render("[trygg](https://example.com) og [farlig](javascript:alert(1))");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">trygg</a>',
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<span>farlig</span>");
  });

  it("never renders raw HTML from the body", () => {
    const html = render(
      'Hei <b onclick="x()">der</b>\n\n<script>alert(1)</script>\n\n<img src="x" onerror="y()">',
    );
    expect(html).not.toContain("<b");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("der");
  });

  it("maps unsupported Markdown to the supported set instead of rendering it", () => {
    const html = render(
      "#### Dyp overskrift\n\n```\nkode\n```\n\nTekst med `kode` og ![bilde](https://example.com/x.png)",
    );
    expect(html).toContain("<h3>Dyp overskrift</h3>");
    expect(html).not.toMatch(/<(h4|pre|code|img)\b/);
    expect(html).toContain("kode");
    expect(html).toContain("bilde");
  });

  it("does not render GFM task lists or tables as tickable or tabular content", () => {
    const html = render("- [ ] Spør om budsjett\n\n| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<table");
  });
});

describe("call guide panel", () => {
  const guide = (id: string, title: string, body: string, position: number): CallGuide => ({
    id,
    orgId: "team-1",
    title,
    body,
    position,
    revision: 1,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-10T10:00:00.000Z",
  });
  const guides = [
    guide("a", "Bedrift", "## Bedrift", 0),
    guide("b", "  ", "## Uten navn", 1),
    guide("c", "Offentlig", "## Offentlig", 2),
  ];
  const memory = (values: Record<string, string>) => ({
    getItem: (key: string) => values[key] ?? null,
    setItem: () => {},
    removeItem: () => {},
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows one tab per guide in team order with the remembered guide selected", () => {
    vi.stubGlobal("localStorage", memory({ "contac:call-guide:selected:user-1:team-1": "c" }));
    const html = renderToStaticMarkup(
      <CallGuidePanel teamId="team-1" userId="user-1" guides={guides} />,
    );
    const tabs = [...html.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>([^<]*)</g)];
    expect(tabs.map((tab) => [tab[2], tab[1]])).toEqual([
      ["Bedrift", "false"],
      ["Uten tittel", "false"],
      ["Offentlig", "true"],
    ]);
    expect(html).toContain("<h2>Offentlig</h2>");
    expect(html).toContain('href="/?page=call_guides&amp;guide=c"');
  });

  it("selects the first guide when the remembered guide was deleted and is read-only", () => {
    vi.stubGlobal("localStorage", memory({ "contac:call-guide:selected:user-1:team-1": "x" }));
    const html = renderToStaticMarkup(
      <CallGuidePanel teamId="team-1" userId="user-1" guides={guides} />,
    );
    expect(html).toContain("<h2>Bedrift</h2>");
    expect(html).not.toMatch(/<(input|textarea|select)\b|contenteditable/);
  });

  it("starts collapsed when the member collapsed it last time", () => {
    vi.stubGlobal("localStorage", memory({ "contac:call-guide:collapsed:user-1:team-1": "1" }));
    const html = renderToStaticMarkup(
      <CallGuidePanel teamId="team-1" userId="user-1" guides={guides} />,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<div id="[^"]*-content" hidden=""/);
  });
});
