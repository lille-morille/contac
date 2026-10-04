import type { ReactNode } from "react";

function normalized(value: string) {
  let text = "";
  const positions: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const part = value[index]!;
    const next = /\s/.test(part) ? " " : part.normalize("NFKC").toLocaleLowerCase("nb-NO");
    if (next === " " && text.endsWith(" ")) continue;
    for (const char of next) {
      text += char;
      positions.push(index);
    }
  }
  return { text, positions };
}

export function findSearchMatch(
  text: string,
  passage: string,
  query = "",
): [number, number] | null {
  if (!text || (!passage && !query)) return null;
  const source = normalized(text);
  const search = normalized(query.trim()).text;
  const excerpt = normalized(passage.trim()).text;
  const candidates = [search];
  if (excerpt) {
    for (let offset = 0; offset < excerpt.length; offset += 60)
      candidates.push(excerpt.slice(offset, offset + 120).trim());
  }
  candidates.push(
    ...search
      .split(/\s+/)
      .filter((word) => word.length >= 3)
      .sort((a, b) => b.length - a.length),
  );
  for (const candidate of candidates) {
    if (!candidate || candidate.length < 3) continue;
    const start = source.text.indexOf(candidate);
    if (start < 0) continue;
    return [source.positions[start]!, source.positions[start + candidate.length - 1]! + 1];
  }
  return null;
}

export function HighlightedText({
  text,
  passage,
  query,
}: {
  text: string;
  passage?: string | null;
  query?: string | null;
}): ReactNode {
  const range = findSearchMatch(text, passage ?? "", query ?? "");
  if (!range) return text;
  return (
    <>
      {text.slice(0, range[0])}
      <mark data-search-match className="rounded bg-primary/30 px-0.5 text-inherit">
        {text.slice(range[0], range[1])}
      </mark>
      {text.slice(range[1])}
    </>
  );
}
