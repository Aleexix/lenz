import type { ReactNode } from "react";
import { AsciiArt } from "@/ascii/AsciiArt";
import art from "@/ascii/art/empty-canvas.txt?raw";

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
};

/** Mensaje centrado sobre el lienzo, con arte ASCII. */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex flex-col items-center gap-4 text-center">
        <AsciiArt art={art} className="text-xs leading-tight text-electric-400/70" />
        <p className="font-mono text-sm text-ice/80">{title}</p>
        {children}
      </div>
    </div>
  );
}
