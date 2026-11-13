import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { appWindow } from "@/lib/ipc";

/**
 * Minimizar, maximizar/restaurar y cerrar, para Windows (la ventana no tiene barra nativa).
 * Con el estilo de la app: una cápsula translúcida sobre el fondo, como los botones del inicio.
 * En macOS no se usa: ahí quedan los semáforos nativos.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      void appWindow
        .isMaximized()
        .then((value) => active && setMaximized(value))
        .catch(() => {});
    refresh();
    const unlisten = appWindow.onResized(refresh);
    return () => {
      active = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="mt-2.5 mr-3 flex h-8 items-center gap-0.5 rounded-[10px] border border-electric-400/20 bg-navy-900/60 p-0.5 backdrop-blur-sm">
      <ControlButton label="Minimizar" onClick={() => void appWindow.minimize()}>
        <path d="M3 8h10" />
      </ControlButton>
      <ControlButton
        label={maximized ? "Restaurar" : "Maximizar"}
        onClick={() => void appWindow.toggleMaximize()}
      >
        {maximized ? (
          <>
            <rect x="3" y="5.5" width="7.5" height="7.5" rx="1.75" />
            <path d="M6 3.5h4.75A1.75 1.75 0 0 1 12.5 5.25V10" />
          </>
        ) : (
          <rect x="3.5" y="3.5" width="9" height="9" rx="2" />
        )}
      </ControlButton>
      <ControlButton
        label="Cerrar"
        title="Cerrar (las terminales siguen vivas en el daemon)"
        onClick={() => void appWindow.close()}
        danger
      >
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
      </ControlButton>
    </div>
  );
}

type ControlButtonProps = {
  label: string;
  title?: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
};

function ControlButton({ label, title, onClick, danger = false, children }: ControlButtonProps) {
  const hover = danger
    ? "hover:bg-red-500/85 hover:text-white"
    : "hover:bg-electric-600/25 hover:text-white";
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-lg text-ice/65 transition-colors focus-visible:outline-2 focus-visible:outline-electric-400 motion-reduce:transition-none ${hover}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
