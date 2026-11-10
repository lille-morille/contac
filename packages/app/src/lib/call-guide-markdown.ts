import { getSchema, type AnyExtension, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Lexer, Marked, type marked } from "marked";

/**
 * The blocks and marks a call guide supports (docs/spec/10-call-guides.md B.5):
 * headings 1–3, paragraphs, bold, italic, links, bullet and numbered lists,
 * quotes, and dividers. Hard breaks are kept so a line break written by another
 * client is not lost. Everything else parses to plain paragraphs or text.
 */
export const callGuideExtensions: AnyExtension[] = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
];

export const callGuideSchema = getSchema(callGuideExtensions);

type Token = Record<string, unknown> & { type: string; raw?: string; text?: string };

function textToken(text: string): Token {
  return { type: "text", raw: text, text, escaped: false };
}

/** Inline tokens for `text`, with line breaks kept as hard breaks. */
function lineTokens(text: string): Token[] {
  return text
    .split("\n")
    .flatMap((line, index) => (index ? [{ type: "br", raw: "\n" }, textToken(line)] : [textToken(line)]))
    .filter((token) => token.type === "br" || !!token.text);
}

function paragraphToken(tokens: Token[]): Token {
  return { type: "paragraph", raw: "", text: "", tokens };
}

/**
 * Rewrites Markdown the editor has no block or mark for into supported tokens,
 * so their text is kept instead of dropped: code blocks and tables become
 * paragraphs, inline code becomes plain text, images become links, and task
 * list items become ordinary list items.
 */
function rewriteTokens(tokens: Token[]): Token[] {
  return tokens.flatMap((token): Token[] => {
    const children = (key: string) =>
      Array.isArray(token[key]) ? { [key]: rewriteTokens(token[key] as Token[]) } : {};
    switch (token.type) {
      case "code":
        return token.text ? [paragraphToken(lineTokens(token.text))] : [];
      case "table": {
        const rows = [token.header as Token[], ...((token.rows as Token[][]) ?? [])];
        return rows.map((cells) =>
          paragraphToken(
            (cells ?? []).flatMap((cell, index) => [
              ...(index ? [textToken(" | ")] : []),
              ...rewriteTokens((cell.tokens as Token[]) ?? []),
            ]),
          ),
        );
      }
      case "codespan":
        return [textToken(token.text ?? "")];
      case "image": {
        const href = String(token.href ?? "");
        const label = token.text || href;
        return [{ type: "link", raw: token.raw, href, title: null, text: label, tokens: [textToken(label)] }];
      }
      case "checkbox":
        return [];
      case "list_item":
        return [{ ...token, task: false, checked: undefined, ...children("tokens") }];
      case "list":
        return [{ ...token, ...children("items") }];
      default:
        return [{ ...token, ...children("tokens") }];
    }
  });
}

class CallGuideLexer extends Lexer {
  override lex(src: string) {
    return rewriteTokens(super.lex(src) as unknown as Token[]) as unknown as ReturnType<Lexer["lex"]>;
  }
}

/** The marked instance for call guides; pass it to the editor's Markdown extension too. */
export const callGuideMarked = Object.assign(new Marked({ gfm: true, breaks: false }), {
  Lexer: CallGuideLexer,
}) as unknown as typeof marked;

let manager: MarkdownManager | null = null;
function markdownManager() {
  manager ??= new MarkdownManager({ marked: callGuideMarked, extensions: callGuideExtensions });
  return manager;
}

/** Markdown → editor document, validated against the call guide schema. */
export function parseCallGuideMarkdown(markdown: string): JSONContent {
  const parsed = markdownManager().parse(markdown);
  return callGuideSchema.nodeFromJSON(sanitize(parsed)).toJSON() as JSONContent;
}

/** Editor document → stored Markdown. */
export function serializeCallGuideMarkdown(doc: JSONContent): string {
  // Empty paragraphs at the ends (the editor's trailing line, Enter pressed at
  // the end) are not content; ones between blocks are kept as blank lines.
  const content = [...(doc.content ?? [])];
  const empty = (node?: JSONContent) => node?.type === "paragraph" && !node.content?.length;
  while (empty(content[content.length - 1])) content.pop();
  while (empty(content[0])) content.shift();
  return markdownManager()
    .serialize({ ...doc, content })
    .replace(/\s+$/, "");
}

/** The Markdown the editor would save for `markdown` without edits. */
export function normalizeCallGuideMarkdown(markdown: string): string {
  return serializeCallGuideMarkdown(parseCallGuideMarkdown(markdown));
}

const headingLevels = new Set([1, 2, 3]);

/**
 * Turns nodes and marks outside the schema into what the schema accepts, so a
 * body written by another client never makes the editor throw: unknown blocks
 * become paragraphs of their text, unknown inline nodes become text, unknown
 * marks are dropped, and deeper headings become level 3.
 */
function sanitize(node: JSONContent): JSONContent {
  const content = node.content?.flatMap((child) => sanitizeChild(child, node.type ?? "doc"));
  return { ...node, ...(content ? { content } : {}) };
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(textOf).join(node.type === "doc" ? "\n\n" : "");
}

const inlineTypes = new Set(["text", "hardBreak"]);

function sanitizeChild(node: JSONContent, parent: string): JSONContent[] {
  const type = node.type ?? "";
  const nodeType = callGuideSchema.nodes[type];
  const parentIsTextblock = ["paragraph", "heading"].includes(parent);
  if (!nodeType) {
    const text = textOf(node);
    if (parentIsTextblock) return text ? [{ type: "text", text }] : [];
    return text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [];
  }
  if (type === "text") {
    const marks = node.marks?.filter((mark) => !!callGuideSchema.marks[mark.type]);
    return node.text ? [{ ...node, ...(marks?.length ? { marks } : { marks: undefined }) }] : [];
  }
  if (parentIsTextblock && !inlineTypes.has(type)) {
    const text = textOf(node);
    return text ? [{ type: "text", text }] : [];
  }
  if (type === "heading") {
    const level = Number(node.attrs?.level);
    const fixed = headingLevels.has(level) ? level : 3;
    return [sanitize({ ...node, attrs: { ...node.attrs, level: fixed } })];
  }
  return [sanitize(node)];
}
