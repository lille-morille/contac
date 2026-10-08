type PickerKey = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
};

export function pickerDirection(event: PickerKey): -1 | 1 | null {
  if (event.isComposing || event.metaKey || event.altKey) return null;
  if (event.key === "ArrowDown") return 1;
  if (event.key === "ArrowUp") return -1;
  if (!event.ctrlKey) return null;
  const key = event.key.toLowerCase();
  return key === "j" || key === "n" ? 1 : key === "k" || key === "p" ? -1 : null;
}

export function nextPickerIndex(current: number, direction: -1 | 1, length: number) {
  if (!length) return -1;
  if (current < 0) return direction === 1 ? 0 : length - 1;
  return (current + direction + length) % length;
}
