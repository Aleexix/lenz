import { hasBackend } from "@/lib/ipc";
import { isMac } from "@/lib/platform";
import { WindowControls } from "./WindowControls";

/**
 * Barra de título transparente que flota sobre el contenido: solo sirve para arrastrar
 * la ventana y, en Windows, trae los controles de la ventana. En macOS los semáforos
 * nativos quedan encima (tauri.macos.conf.json). Sin fondo ni logo: el inicio ya los tiene.
 */
export function TitleBar() {
  const desktop = hasBackend();
  if (!desktop) return null;

  return (
    <header
      data-tauri-drag-region
      className="absolute inset-x-0 top-0 z-20 flex h-11 select-none items-start justify-end"
    >
      {!isMac && <WindowControls />}
    </header>
  );
}
