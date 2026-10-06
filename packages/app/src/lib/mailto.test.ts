import { expect, test } from "vitest";
import { buildMailtoUrl } from "./mailto.ts";

test("mailto fields use percent-encoded spaces and preserve literal plus signs", () => {
  const url = buildMailtoUrl({
    toEmails: ["ola@example.com"],
    ccEmails: ["anne@example.com"],
    bccEmails: [],
    subject: "Hei Ola + Anne",
    body: "Første linje\nNeste linje + mer",
  });

  expect(url).toBe(
    "mailto:ola%40example.com?cc=anne%40example.com&subject=Hei%20Ola%20%2B%20Anne&body=F%C3%B8rste%20linje%0ANeste%20linje%20%2B%20mer",
  );
  expect(url).not.toContain("+");
});
