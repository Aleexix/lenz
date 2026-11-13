import AsciiOcean, { type AsciiOceanProps } from "@/vendor/ascii-ocean/AsciiOcean.js";
import { useOceanTheme } from "./ocean-theme";

/** Valores por defecto de los controles del componente en Framer: se usa tal cual. */
const FRAMER_DEFAULTS: AsciiOceanProps = {
  sharkType: "classic",
  sharkCount: 4,
  sharkSize: 1,
  fishCount: 180,
  fishType: "mixed",
  speed: 1,
  autoCell: true,
  cellSize: 11,
  background: "#000000",
  showGrid: true,
  gridColor: "#ffffff",
  fishColor: "#e6eeff",
  wakeColor: "#6ee6ff",
  customSharkColor: false,
  sharkColor: "#78a0dc",
  accentColors: ["#e0892c", "#e03a32", "#b44ae0", "#33c8cc", "#3cb54a", "#3150e8", "#d9c14a"],
  sharkChars: ":;t%SX8#@",
  fishChar: "-",
  interactive: true,
};

/**
 * Fondo de la pantalla de inicio: el océano ASCII de Framer, sin modificar, con los
 * colores de la app (variables `--ocean-*` de styles.css) en lugar del negro original.
 */
export function OceanBackground() {
  const theme = useOceanTheme();
  return (
    <AsciiOcean
      {...FRAMER_DEFAULTS}
      // Lenz viene del tiburón martillo: todos los tiburones del inicio son martillo.
      sharkType="hammerhead"
      background={theme.background}
      gridColor={theme.grid}
      fishColor={theme.fish}
      wakeColor={theme.wake}
      customSharkColor
      sharkColor={theme.shark}
      accentColors={theme.accents}
    />
  );
}
