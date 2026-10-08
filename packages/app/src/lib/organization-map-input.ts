export type MapInputMode = "mouse" | "trackpad";
export function readMapInputMode(): MapInputMode {
  try {
    return localStorage.getItem("contac:map-input-mode") === "mouse" ? "mouse" : "trackpad";
  } catch {
    return "trackpad";
  }
}
export function mapWheelAction(
  mode: MapInputMode,
  deltaX: number,
  deltaY: number,
  ctrlKey: boolean,
  unit = 1,
) {
  return mode === "mouse" || ctrlKey
    ? { kind: "zoom" as const, factor: Math.exp(-deltaY * unit * 0.006) }
    : { kind: "pan" as const, offset: [-deltaX * unit, -deltaY * unit] as [number, number] };
}
