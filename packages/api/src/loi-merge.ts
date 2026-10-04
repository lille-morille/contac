import type { LoiSection } from "@contac/core/db";

type Editable = {
  ourSignerName: string;
  counterpartySignerName: string;
  documentDate: string;
  variables: Record<string, string>;
  sections: LoiSection[];
};

export function mergeLoiEdit(current: Editable, expected: Editable, proposed: Editable) {
  const conflicts: string[] = [];
  const choose = (path: string, now: string, before: string, next: string) => {
    if (next === before) return now;
    if (now !== before && now !== next) conflicts.push(path);
    return next;
  };
  const variables: Record<string, string> = { ...current.variables };
  for (const key of Object.keys(proposed.variables)) {
    if (key === "signatureNote") continue; // Its Yjs document owns this paragraph.
    variables[key] = choose(
      `variables.${key}`,
      current.variables[key] ?? "",
      expected.variables[key] ?? "",
      proposed.variables[key] ?? "",
    );
  }
  const ids = (sections: LoiSection[]) => sections.map((section) => section.id).join("|");
  const structuralEdit = ids(proposed.sections) !== ids(expected.sections);
  if (structuralEdit && ids(current.sections) !== ids(expected.sections))
    conflicts.push("sections.structure");
  const sourceSections = structuralEdit ? proposed.sections : current.sections;
  const sections = sourceSections.map((section) => {
    const original = expected.sections.find((item) => item.id === section.id);
    const now = current.sections.find((item) => item.id === section.id);
    const proposedSection = proposed.sections.find((item) => item.id === section.id);
    if (!original) return section; // A newly added section starts with its submitted body.
    if (!now) {
      if (proposedSection && proposedSection.title !== original.title)
        conflicts.push(`sections.${section.id}.title`);
      return section;
    }
    return {
      ...now,
      title: choose(
        `sections.${section.id}.title`,
        now.title,
        original.title,
        proposedSection?.title ?? original.title,
      ),
    };
  });
  return {
    conflicts,
    merged: {
      ourSignerName: choose(
        "ourSignerName",
        current.ourSignerName,
        expected.ourSignerName,
        proposed.ourSignerName,
      ),
      counterpartySignerName: choose(
        "counterpartySignerName",
        current.counterpartySignerName,
        expected.counterpartySignerName,
        proposed.counterpartySignerName,
      ),
      documentDate: choose(
        "documentDate",
        current.documentDate,
        expected.documentDate,
        proposed.documentDate,
      ),
      variables,
      sections,
    },
  };
}
