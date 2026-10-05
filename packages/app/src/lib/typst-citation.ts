export function typstQuoteSnippet(input: {
  quote: string;
  contactNumbers: number[];
  contactId: string;
  activityId: string | null;
  libraryId: string;
}): string {
  const numbers = [...new Set(input.contactNumbers)].filter(
    (number) => Number.isSafeInteger(number) && number > 0,
  );
  if (!numbers.length) throw new Error("Sitatet mangler kontaktnummer.");
  const source = input.activityId
    ? `aktivitet ${input.activityId}`
    : `notat for kontakt ${input.contactId}`;
  return `// Contac-kilde: ${source}; sitat ${input.libraryId}\n#quote(block: true, attribution: [#cite-contact(${numbers.join(", ")})])[#text(${JSON.stringify(input.quote)})]`;
}
