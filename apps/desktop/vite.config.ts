import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Configuración recomendada por Tauri: puerto fijo y sin observar src-tauri.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Componentes copiados de Framer importan `framer`; ver src/vendor/ascii-ocean/README.md.
      framer: fileURLToPath(new URL("./src/vendor/framer-shim.ts", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebView2 (Windows) y WKWebView (macOS 12+).
    target: ["chrome105", "safari15"],
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
