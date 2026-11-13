import { describe, expect, it } from "vitest";
import { decodeTerminalEvent } from "./terminal-events";

describe("decodeTerminalEvent", () => {
  it("decodifica salida y snapshot", () => {
    expect(decodeTerminalEvent(new Uint8Array([0, 104, 105]))).toEqual({
      kind: "output",
      data: new Uint8Array([104, 105]),
    });
    expect(decodeTerminalEvent([1, 65])).toEqual({ kind: "snapshot", data: new Uint8Array([65]) });
  });

  it("decodifica el código de salida (i32 big-endian)", () => {
    expect(decodeTerminalEvent(new Uint8Array([2, 0xff, 0xff, 0xff, 0xff]))).toEqual({
      kind: "exited",
      code: -1,
    });
    expect(decodeTerminalEvent(new Uint8Array([2]).buffer)).toEqual({ kind: "exited", code: null });
  });

  it("ignora mensajes vacíos o desconocidos", () => {
    expect(decodeTerminalEvent(new Uint8Array([]))).toBeNull();
    expect(decodeTerminalEvent(new Uint8Array([9, 1]))).toBeNull();
  });
});
