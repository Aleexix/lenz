/** `true` en macOS (Cmd); en Windows el modificador es Ctrl. */
export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** ¿El evento trae el modificador `Mod` (Cmd en macOS, Ctrl en Windows)? */
export const hasMod = (e: KeyboardEvent): boolean => (isMac ? e.metaKey : e.ctrlKey);

/** Etiqueta visible de un atajo con `Mod`, p. ej. `⌘1` o `Ctrl 1`. */
export const modLabel = (key: string): string => (isMac ? `⌘${key}` : `Ctrl ${key}`);
