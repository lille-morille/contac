import { describe, expect, it } from "vitest";
import { findSearchMatch } from "./search-highlight.tsx";

describe("contact search highlighting", () => {
  it("finds the query inside the actual transcript text", () => {
    const text = "Vi diskuterte kostnader og kvalitet i produksjonen.";
    const range = findSearchMatch(text, "kostnader og kvalitet", "kvalitet");
    expect(range && text.slice(...range)).toBe("kvalitet");
  });
  it("finds a semantic excerpt when query words do not occur literally", () => {
    const text = "Vi ønsker å bruke lokale leverandører i et nytt prosjekt.";
    const range = findSearchMatch(text, "lokale leverandører i et nytt prosjekt", "supply chain");
    expect(range && text.slice(...range)).toContain("lokale leverandører");
  });
  it("returns no mark for unrelated content", () => {
    expect(findSearchMatch("Annen aktivitet", "utenfor kontekst", "pris")).toBeNull();
  });
});
