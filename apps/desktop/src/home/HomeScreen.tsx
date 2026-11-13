import { type ReactNode, useEffect, useRef } from "react";
import mark from "@/assets/brand/lenz-mark-white.svg";
import { CanvasIcon, TerminalIcon } from "@/components/ui/icons";
import { hasBackend } from "@/lib/ipc";
import { modLabel } from "@/lib/platform";
import { useCanvasStore } from "@/stores/canvas-store";
import { OceanBackground } from "./OceanBackground";

type HomeScreenProps = {
  version: string | null;
};

/**
 * Pantalla de inicio: el océano ASCII de fondo y la elección entre Terminales y Lienzo.
 * TODO: las vistas Terminales y Lienzo se rehacen paso a paso; por ahora los botones no navegan.
 */
export function HomeScreen({ version }: HomeScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // El océano escucha `pointerdown` en todo el documento para salpicar. Lo cortamos aquí
  // para quitar el efecto de clic sin tocar el componente (los peces siguen huyendo del cursor).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stop = (e: PointerEvent) => e.stopPropagation();
    root.addEventListener("pointerdown", stop);
    return () => root.removeEventListener("pointerdown", stop);
  }, []);

  return (
    <div ref={rootRef} className="relative h-full overflow-hidden bg-(--ocean-background)">
      <div className="absolute inset-0">
        <OceanBackground />
      </div>
      {/* Oscurece el centro con el color de fondo para que el texto se lea sobre el agua. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_46%_52%_at_50%_50%,color-mix(in_srgb,var(--ocean-background)_86%,transparent)_0%,color-mix(in_srgb,var(--ocean-background)_55%,transparent)_55%,transparent_100%)]"
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-4 text-center">
        <DaemonStatus />
        <div className="flex flex-col items-center gap-3.5">
          <img src={mark} alt="" className="w-24" />
          <h1 className="m-0 font-semibold text-[clamp(64px,8vw,120px)] text-white leading-[0.9] tracking-[-0.055em]">
            Lenz
          </h1>
          <p className="m-0 text-ice/70 text-lg">
            El sexto sentido de tu código. ¿Cómo quieres trabajar hoy?
          </p>
        </div>

        <fieldset className="pointer-events-auto m-0 flex flex-wrap justify-center gap-3 border-0 p-0">
          <legend className="sr-only">Elegir vista</legend>
          <ViewChoice
            icon={<TerminalIcon />}
            title="Terminales"
            description="Pestañas y paneles divididos"
            shortcut={modLabel("1")}
          />
          <ViewChoice
            icon={<CanvasIcon />}
            title="Lienzo"
            description="Tus terminales como nodos"
            shortcut={modLabel("2")}
          />
        </fieldset>
      </div>

      <p className="pointer-events-none absolute bottom-3.5 left-4.5 m-0 font-mono text-[11px] text-ice/35">
        mueve el cursor sobre el agua
      </p>
      {version && (
        <p className="pointer-events-none absolute right-4.5 bottom-3.5 m-0 font-mono text-[11px] text-ice/35">
          v{version}
        </p>
      )}
    </div>
  );
}

type ViewChoiceProps = {
  icon: ReactNode;
  title: string;
  description: string;
  shortcut: string;
  onClick?: () => void;
};

function ViewChoice({ icon, title, description, shortcut, onClick }: ViewChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-64 max-w-full items-center gap-3.5 rounded-[14px] border border-electric-400/20 bg-navy-900/70 px-3.5 py-3 text-left transition-colors hover:border-electric-400/60 hover:bg-navy-900/90 focus-visible:outline-2 focus-visible:outline-electric-400 motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-electric-400/30 bg-electric-600/15 text-electric-400 transition-colors group-hover:border-electric-600 group-hover:bg-electric-600 group-hover:text-white motion-reduce:transition-none"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-[15px] text-white tracking-[-0.01em]">{title}</span>
          <span className="ml-auto font-mono text-[10.5px] text-ice/35">{shortcut}</span>
        </span>
        <span className="text-[12.5px] text-ice/60">{description}</span>
      </span>
    </button>
  );
}

/** Píldora con el estado de la conexión al daemon. */
function DaemonStatus() {
  const status = useCanvasStore((s) => s.status);
  const count = useCanvasStore((s) => s.nodes.filter((n) => !n.data.exited).length);

  let dot = "bg-ice/40";
  let text = "modo web · sin daemon";
  if (hasBackend()) {
    if (status === "ready") {
      dot = "bg-emerald-400";
      text = `daemon conectado · ${count} ${count === 1 ? "terminal viva" : "terminales vivas"}`;
    } else if (status === "error") {
      dot = "bg-red-400";
      text = "sin conexión con el daemon";
    } else {
      dot = "bg-amber-400";
      text = "conectando con el daemon…";
    }
  }

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-electric-400/35 bg-(--ocean-background)/75 px-3.5 py-1.5 font-mono text-[11px] text-electric-400 uppercase tracking-[0.12em]">
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {text}
    </div>
  );
}
