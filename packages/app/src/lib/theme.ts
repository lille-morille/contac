import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const storageKey = "contac:theme";
const changeEvent = "contac:theme-change";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    listener();
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");
  function setTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Theme changes still work when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(changeEvent));
  }
  return { theme, setTheme };
}
