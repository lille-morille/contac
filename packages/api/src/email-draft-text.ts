/** The mail client supplies the sender's signature when the draft is opened. */
export function withoutGeneratedSignature(text: string): string {
  const lines = text.trim().split("\n");
  const firstPossibleSignoff = Math.max(0, lines.length - 6);
  for (let index = firstPossibleSignoff; index < lines.length; index++) {
    if (
      !/^(?:med vennlig hilsen|vennlig hilsen|mvh\.?|hilsen|best regards|kind regards|regards)[,!\s]*$/i.test(
        lines[index]!.trim(),
      )
    )
      continue;
    if (index > 0 && lines[index - 1]!.trim() !== "") continue;
    return lines.slice(0, index).join("\n").trimEnd();
  }
  return text.trim();
}
