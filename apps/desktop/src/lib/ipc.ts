import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { decodeTerminalEvent, type TerminalEvent } from "@/terminal/terminal-events";

/**
 * Único punto de entrada de la UI hacia Tauri.
 * TODO: reemplazar por los bindings generados con tauri-specta (`src/bindings.ts`).
 */

/** Espejo de `lenz_protocol::SessionInfo`. */
export type SessionInfo = {
  id: string;
  title: string;
  cwd: string;
  cols: number;
  rows: number;
  exited: boolean;
  exitCode: number | null;
};

/** `false` en `pnpm dev:web` (navegador sin Tauri). */
export const hasBackend = (): boolean => isTauri();

export const getAppVersion = () => invoke<string>("app_version");

export const listSessions = () => invoke<SessionInfo[]>("list_sessions");

export const createSession = (cols: number, rows: number) =>
  invoke<SessionInfo>("create_session", { cols, rows });

export const closeSession = (sessionId: string) => invoke<void>("close_session", { sessionId });

export const writeInput = (sessionId: string, data: string) =>
  invoke<void>("write_input", { sessionId, data });

export const resizeSession = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("resize_session", { sessionId, cols, rows });

/**
 * Se suscribe a la salida de una sesión. El primer evento siempre es un snapshot.
 * Devuelve la función para desuscribirse.
 */
export async function attachSession(
  sessionId: string,
  onEvent: (event: TerminalEvent) => void,
): Promise<() => Promise<void>> {
  const channel = new Channel<ArrayBuffer | number[]>();
  channel.onmessage = (raw) => {
    const event = decodeTerminalEvent(raw);
    if (event) onEvent(event);
  };
  const token = await invoke<number>("attach_session", { sessionId, onEvent: channel });
  return () => invoke<void>("detach_session", { sessionId, token });
}

/**
 * Controles de la ventana principal, para la barra de título propia
 * (en Windows la ventana va sin decoraciones nativas: `tauri.windows.conf.json`).
 */
export const appWindow = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  /** Avisa cada vez que cambia el tamaño (maximizar/restaurar incluidos). */
  onResized: (callback: () => void): Promise<UnlistenFn> =>
    getCurrentWindow().onResized(() => callback()),
};

/** Se dispara cuando se pierde la conexión con lenz-daemon. */
export const onDaemonDisconnected = (callback: () => void): Promise<UnlistenFn> =>
  listen("daemon-disconnected", callback);
