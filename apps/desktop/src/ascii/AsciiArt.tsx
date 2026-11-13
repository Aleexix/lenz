type AsciiArtProps = {
  /** Contenido de un archivo de `ascii/art/`, importado con `?raw`. */
  art: string;
  className?: string;
  /** Texto para lectores de pantalla cuando el arte aporta significado. */
  label?: string;
};

/** Renderiza arte ASCII con fuente monoespaciada fija. Decorativo por defecto. */
export function AsciiArt({ art, className = "", label }: AsciiArtProps) {
  const pre = (
    <pre className={`m-0 select-none whitespace-pre font-mono ${className}`} aria-hidden>
      {art.replace(/\n$/, "")}
    </pre>
  );

  if (!label) return pre;

  return (
    <div role="img" aria-label={label}>
      {pre}
    </div>
  );
}
