type SortableContact = {
  id: string;
  updatedAt: string;
  sortUpdatedAt?: string;
};

export function compareContactUpdated(a: SortableContact, b: SortableContact) {
  return (
    (b.sortUpdatedAt ?? b.updatedAt).localeCompare(a.sortUpdatedAt ?? a.updatedAt) ||
    a.id.localeCompare(b.id)
  );
}
