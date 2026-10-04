type DepartmentOption = { id: string; companyId: string; name: string };

const normalize = (value: string) =>
  value.trim().normalize("NFKC").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");

export function resolveDepartmentProposal(
  proposedId: unknown,
  proposedName: unknown,
  companyId: string,
  currentId: string | null,
  departments: DepartmentOption[],
) {
  const available = departments.filter((department) => department.companyId === companyId);
  const byId = available.find((department) => department.id === proposedId);
  const name = typeof proposedName === "string" ? proposedName.trim().slice(0, 200) : "";
  const byName = name
    ? available.find((department) => normalize(department.name) === normalize(name))
    : null;
  const match = byId ?? byName;
  if (match)
    return { departmentId: match.id === currentId ? null : match.id, departmentName: null };
  return { departmentId: null, departmentName: name || null };
}
