import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { HomeScreen } from "@/home/HomeScreen";
import { getAppVersion, hasBackend, onDaemonDisconnected } from "@/lib/ipc";
import { useCanvasStore } from "@/stores/canvas-store";
import { TitleBar } from "./TitleBar";

/**
 * Por ahora la app es solo la pantalla de inicio. Las vistas Terminales y Lienzo
 * se van armando paso a paso.
 */
export function App() {
  const backend = hasBackend();
  const [version, setVersion] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const loadSessions = useCanvasStore((s) => s.loadSessions);

  useEffect(() => {
    if (!backend) return;
    getAppVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
    // Para el estado del daemon que muestra el inicio (conectado y terminales vivas).
    void loadSessions();

    const unlisten = onDaemonDisconnected(() => setDisconnected(true));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [backend, loadSessions]);

  const reconnect = () => {
    setDisconnected(false);
    void loadSessions();
  };

  return (
    <div className="relative h-full">
      {/* El inicio ocupa toda la ventana; la barra de título flota encima, transparente. */}
      <main className="relative h-full">
        <HomeScreen version={version} />

        {disconnected && (
          <div className="absolute inset-x-0 top-11 z-10 flex items-center justify-center gap-3 bg-navy-800/90 px-4 py-2 font-mono text-xs">
            <span>Se perdió la conexión con lenz-daemon.</span>
            <Button variant="ghost" onClick={reconnect}>
              Reconectar
            </Button>
          </div>
        )}
      </main>
      <TitleBar />
    </div>
  );
}
