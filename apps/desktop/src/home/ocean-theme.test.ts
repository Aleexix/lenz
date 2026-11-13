import { describe, expect, it } from "vitest";
import { FALLBACK_OCEAN_THEME, resolveOceanTheme } from "./ocean-theme";

describe("resolveOceanTheme", () => {
  it("usa las variables definidas, sin espacios", () => {
    const vars: Record<string, string> = {
      "--ocean-background": " #101010 ",
      "--ocean-shark": "rgb(1, 2, 3)",
      "--ocean-accent-2": "#abcdef",
    };
    const theme = resolveOceanTheme((name) => vars[name] ?? "");
    expect(theme.background).toBe("#101010");
    expect(theme.shark).toBe("rgb(1, 2, 3)");
    expect(theme.accents[1]).toBe("#abcdef");
  });

  it("cae a los colores de marca si una variable está vacía", () => {
    const theme = resolveOceanTheme(() => "");
    expect(theme).toEqual(FALLBACK_OCEAN_THEME);
  });
});
