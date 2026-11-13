import type { CSSProperties, JSX } from "react";

/** Tipos del componente de Framer `AsciiOcean.js` (ver README.md). Los valores por defecto de Framer están en `home/OceanBackground.tsx`. */
export type AsciiOceanProps = {
  sharkType:
    | "classic"
    | "hammerhead"
    | "greathammer"
    | "tiger"
    | "zebra"
    | "mako"
    | "thresher"
    | "nurse"
    | "mix";
  sharkCount: number;
  sharkSize: number;
  fishCount: number;
  fishType: "mixed" | "sardine" | "anchovy" | "silverside" | "mackerel" | "goby";
  speed: number;
  autoCell: boolean;
  cellSize: number;
  background: string;
  showGrid: boolean;
  gridColor: string;
  fishColor: string;
  wakeColor: string;
  customSharkColor: boolean;
  sharkColor: string;
  accentColors: string[];
  sharkChars: string;
  fishChar: string;
  interactive: boolean;
  font?: CSSProperties;
  style?: CSSProperties;
};

export default function AsciiOcean(props: AsciiOceanProps): JSX.Element;
