export function parseContactPaste(value: string) {
  const email = value.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
  const phone = value.match(/(?:\+47[\s-]?)?(?:\d[\s-]?){8,12}/)?.[0]?.trim() ?? "";
  const remainder = value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, " ")
    .replace(/(?:\+47[\s-]?)?(?:\d[\s-]?){8,12}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { email, phone, suggestion: remainder.length <= 50 ? remainder : "" };
}

export function remainingSuggestion(source: string, accepted: string) {
  const cleanedSource = source.replace(/\s+/g, " ").trim();
  const cleanedAccepted = accepted.replace(/\s+/g, " ").trim();
  if (!cleanedAccepted) return cleanedSource;
  const position = cleanedSource
    .toLocaleLowerCase("nb-NO")
    .indexOf(cleanedAccepted.toLocaleLowerCase("nb-NO"));
  if (position < 0) return cleanedSource;
  return `${cleanedSource.slice(0, position)} ${cleanedSource.slice(position + cleanedAccepted.length)}`
    .replace(/\s+/g, " ")
    .trim();
}
