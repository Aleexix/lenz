import { useEffect, useState } from "react";

/** Colores que se le pasan al océano ASCII. Salen de las variables `--ocean-*` de styles.css. */
export type OceanTheme = {
  background: string;
  grid: string;
  fish: string;
  wake: string;
  shark: string;
  accents: string[];
};

/** Valores de marca por si una variable no está definida (p. ej. en tests). */
export const FALLBACK_OCEAN_THEME: OceanTheme = {
  background: "#070e2b",
  grid: "#5b9bff",
  fish: "#eef3fd",
  wake: "#5b9bff",
  shark: "#5b9bff",
  accents: ["#5b9bff", "#2f6bf0", "#eef3fd"],
};

/** Arma el tema leyendo cada variable con `read`; las vacías usan el valor de marca. */
export function resolveOceanTheme(read: (name: string) => string): OceanTheme {
  const get = (name: string, fallback: string) => read(name).trim() || fallback;
  const f = FALLBACK_OCEAN_THEME;
  return {
    background: get("--ocean-background", f.background),
    grid: get("--ocean-grid", f.grid),
    fish: get("--ocean-fish", f.fish),
    wake: get("--ocean-wake", f.wake),
    shark: get("--ocean-shark", f.shark),
    accents: f.accents.map((fallback, i) => get(`--ocean-accent-${i + 1}`, fallback)),
  };
}

const readDocumentTheme = () => {
  const style = getComputedStyle(document.documentElement);
  return resolveOceanTheme((name) => style.getPropertyValue(name));
};

/**
 * Tema actual del océano. Se vuelve a leer si cambian la clase, el estilo o `data-theme`
 * de `<html>`, o la preferencia de color del sistema.
 */
export function useOceanTheme(): OceanTheme {
  const [theme, setTheme] = useState(readDocumentTheme);

  useEffect(() => {
    const update = () => setTheme(readDocumentTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", update);
    return () => {
      observer.disconnect();
      scheme.removeEventListener("change", update);
    };
  }, []);

  return theme;
}
