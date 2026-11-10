import Markdown, { type Components, type Options } from "react-markdown";
import { cn } from "../lib/utils.ts";

/**
 * Elements a call guide renders (docs/spec/10-call-guides.md B.5): headings 1–3,
 * paragraphs, bold, italic, links, bullet and numbered lists (nested), quotes,
 * and dividers. `br` keeps a hard line break written by the editor or another
 * client. Anything else is unwrapped to its text, and raw HTML is dropped.
 */
export const callGuideElements = [
  "h1",
  "h2",
  "h3",
  "p",
  "br",
  "strong",
  "em",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
] as const;

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Maps blocks outside the supported set to their closest supported form, as the
 * editor does: deeper headings become level 3, code blocks become paragraphs,
 * and an image becomes its alt text. Remaining unsupported elements are
 * unwrapped by `unwrapDisallowed`.
 */
function rehypeCallGuideBlocks() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type !== "element") return child;
        if (child.tagName === "h4" || child.tagName === "h5" || child.tagName === "h6")
          child.tagName = "h3";
        else if (child.tagName === "pre") child.tagName = "p";
        else if (child.tagName === "img") {
          const alt = child.properties?.alt;
          return { type: "text", value: typeof alt === "string" ? alt : "" };
        }
        return child;
      });
      node.children.forEach(visit);
    };
    visit(tree);
  };
}

const rehypePlugins: Options["rehypePlugins"] = [rehypeCallGuideBlocks];

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

/** Read-only call guide body. Uses the `.call-guide-prose` typography shared with the editor. */
export function CallGuideView({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("call-guide-prose", className)}>
      <Markdown
        allowedElements={callGuideElements}
        unwrapDisallowed
        skipHtml
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {body}
      </Markdown>
    </div>
  );
}
