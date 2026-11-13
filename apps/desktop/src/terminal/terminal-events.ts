/**
 * Eventos de una terminal tal como llegan por el Channel binario de Tauri:
 * `[tag, ...payload]` con tag 0 = salida, 1 = snapshot, 2 = terminado (+ código i32 big-endian opcional).
 * Debe coincidir con `apps/desktop/src-tauri/src/daemon_client.rs`.
 */
export type TerminalEvent =
  | { kind: "output"; data: Uint8Array }
  | { kind: "snapshot"; data: Uint8Array }
  | { kind: "exited"; code: number | null };

const TAG_OUTPUT = 0;
const TAG_SNAPSHOT = 1;
const TAG_EXITED = 2;

export function decodeTerminalEvent(
  raw: ArrayBuffer | Uint8Array | number[],
): TerminalEvent | null {
  const bytes =
    raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : Uint8Array.from(raw);
  if (bytes.length === 0) return null;

  const body = bytes.subarray(1);
  switch (bytes[0]) {
    case TAG_OUTPUT:
      return { kind: "output", data: body };
    case TAG_SNAPSHOT:
      return { kind: "snapshot", data: body };
    case TAG_EXITED: {
      const code =
        body.length >= 4 ? new DataView(body.buffer, body.byteOffset, 4).getInt32(0) : null;
      return { kind: "exited", code };
    }
    default:
      return null;
  }
}
