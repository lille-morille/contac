import { expect, test } from "vitest";
import { typstQuoteSnippet } from "./typst-citation.ts";

test("quote snippet cites team contact numbers and preserves source", () => {
  const snippet = typstQuoteSnippet({
    quote: 'Hun sa "ja" [med forbehold] #1',
    contactNumbers: [2, 1, 2],
    contactId: "contact-id",
    activityId: "activity-id",
    libraryId: "quote-id",
  });
  expect(snippet).toContain("#cite-contact(2, 1)");
  expect(snippet).toContain('Hun sa \\"ja\\" [med forbehold] #1');
  expect(snippet).toContain("aktivitet activity-id; sitat quote-id");
});
