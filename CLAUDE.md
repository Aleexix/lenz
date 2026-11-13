# CLAUDE.md — Guía para agentes que trabajan en Lenz

Lenz es una app de escritorio (Tauri 2 + React) para orquestar agentes de IA de CLI sobre un lienzo infinito. Las terminales viven en un **daemon** aparte y sobreviven al cierre de la app.

- Arquitectura completa y el porqué de cada decisión: [`ARQUITECTURA.md`](ARQUITECTURA.md). Léelo antes de cambios grandes.
- Plataformas: **Windows y macOS**. Todo cambio debe funcionar en ambas.
- Fase actual: **1 completada (daemon + terminal)**; sigue la **2 (lienzo)**. Ver la hoja de ruta en `ARQUITECTURA.md` §18.

---

## Mapa: ¿dónde va cada cosa?

| Si vas a tocar…                                            | Va en…                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Procesos, PTYs, sesiones de terminal, scrollback           | `crates/lenz-daemon/src/pty.rs`, `session.rs`                         |
| Estado de pantalla exacto (emulador, fase 2)               | `crates/lenz-daemon/src/emulator.rs`                                  |
| Base de datos, migraciones                                 | `crates/lenz-daemon/src/storage.rs`, `crates/lenz-daemon/migrations/` |
| Git, worktrees, diffs                                      | `crates/lenz-daemon/src/git.rs`                                       |
| Hooks / eventos de agentes (Claude Code, etc.)             | `crates/lenz-daemon/src/hooks.rs`                                     |
| Servidor del pipe/socket del daemon                        | `crates/lenz-daemon/src/ipc.rs`                                       |
| **Mensajes app ↔ daemon** (`Request`, `Response`, `Event`) | `crates/lenz-protocol/src/lib.rs`                                     |
| Frames, conexión cliente, rutas y nombre del pipe/socket   | `crates/lenz-protocol/src/frame.rs`, `transport.rs`, `paths.rs`       |
| Test de punta a punta del daemon                           | `crates/lenz-daemon/tests/e2e.rs`                                     |
| Formato binario de eventos de terminal hacia la UI         | `daemon_client.rs` (Rust) ↔ `src/terminal/terminal-events.ts` (TS)    |
| Empaquetado del daemon como sidecar (release)              | `scripts/prepare-sidecar.mjs`, `src-tauri/tauri.release.conf.json`    |
| Comandos Tauri que llama la UI                             | `apps/desktop/src-tauri/src/commands.rs`                              |
| Conexión, arranque y reconexión al daemon                  | `apps/desktop/src-tauri/src/daemon_client.rs`                         |
| Ventanas, permisos, bundle, íconos                         | `apps/desktop/src-tauri/tauri.conf.json`, `capabilities/`             |
| Lienzo, tipos de nodo                                      | `apps/desktop/src/canvas/`                                            |
| Wrapper de xterm.js, vista previa de terminal              | `apps/desktop/src/terminal/`                                          |
| Agentes, estados, squads (UI)                              | `apps/desktop/src/agents/`                                            |
| Revisión de cambios / diffs (UI)                           | `apps/desktop/src/review/`                                            |
| Ajustes y proveedores (UI)                                 | `apps/desktop/src/settings/`                                          |
| Arte ASCII                                                 | `apps/desktop/src/ascii/` (arte en `ascii/art/*.txt`)                 |
| Componentes base (shadcn/ui)                               | `apps/desktop/src/components/ui/`                                     |
| Stores Zustand                                             | `apps/desktop/src/stores/`                                            |
| Llamadas a Tauri desde la UI                               | `apps/desktop/src/lib/ipc.ts`                                         |
| Colores, fuentes, tokens de diseño                         | `apps/desktop/src/styles.css` (`@theme`)                              |
| Logos y assets de marca (fuente original)                  | `lenz-brand/` (no se edita; se copia desde aquí)                      |
| CI y releases                                              | `.github/workflows/`                                                  |
| Decisiones de arquitectura                                 | `docs/adr/NNNN-titulo.md`                                             |

---

## Reglas de arquitectura (no negociables)

1. **El daemon es la fuente de la verdad.** Procesos, pantallas, layout del lienzo y datos persistentes viven en `lenz-daemon`. La UI y el backend de Tauri **nunca** crean PTYs ni escriben en SQLite directamente.
2. **El backend de Tauri es un traductor delgado.** Recibe comandos de la UI y los reenvía al daemon. No mete lógica de negocio.
3. **La UI no llama `invoke` suelto.** Toda llamada pasa por `src/lib/ipc.ts` (y luego por `src/bindings.ts`, generado con tauri-specta).
4. **Zustand es una copia.** Guarda estado de UI (selección, zoom, foco) y un reflejo del estado del daemon actualizado por eventos. Nunca lo trates como fuente de la verdad del dominio.
5. **Salida de terminal = binario por `tauri::ipc::Channel`**, agrupada cada ~16 ms. Nunca uses eventos JSON genéricos para eso.
6. **Estado de agentes por hooks o salida estructurada.** No parsees la salida de la terminal con regex salvo como último recurso documentado.
7. **Git por CLI.** Invoca `git` desde el daemon; no agregues `git2`/`libgit2`.
8. **Rendimiento del lienzo:** xterm.js con WebGL solo en nodos visibles y con zoom suficiente (pool de ~8). El resto muestra una vista previa en `<pre>`. Dentro de una terminal usa las clases `nodrag nowheel nopan`.

### Cambiar el contrato app ↔ daemon

`crates/lenz-protocol` es el contrato entre el frente Rust y el frente UI:

- Si cambias un mensaje, **sube `PROTOCOL_VERSION`**.
- Actualiza a la vez el daemon (`ipc.rs`) y el cliente (`daemon_client.rs`).
- Regenera los bindings (`pnpm bindings`, cuando exista).
- Menciónalo explícitamente en el PR.

---

## Comandos

Desde la raíz:

| Comando            | Qué hace                                     |
| ------------------ | -------------------------------------------- |
| `pnpm install`     | Instala dependencias JS                      |
| `pnpm dev`         | Compila el daemon y levanta la app Tauri     |
| `pnpm dev:web`     | Solo el frontend en el navegador (sin Tauri) |
| `pnpm daemon:stop` | Apaga el daemon que esté corriendo           |
| `pnpm build`       | Build de producción (con el daemon sidecar)  |
| `pnpm lint`        | Biome + clippy                               |
| `pnpm format`      | Biome + rustfmt                              |
| `pnpm typecheck`   | TypeScript                                   |
| `pnpm test`        | Vitest + `cargo test`                        |

Antes de dar una tarea por terminada, corre `pnpm lint`, `pnpm typecheck` y `pnpm test`.

Requisitos locales: Rust estable, Node 22+, pnpm (vía `corepack enable`). En Windows, Visual Studio Build Tools (C++).

---

## Convenciones

- **Idioma:** el código (identificadores, nombres de archivo) va en inglés. Los textos visibles al usuario y la documentación van en español. Los commits van en español con Conventional Commits (`feat: …`, `fix: …`, `chore: …`).
- **Vocabulario de producto:** un _squad_ es un equipo de agentes. Ver `lenz-brand/BRAND.md`.
- **TypeScript:** `strict`, sin `any`. Componentes en `PascalCase.tsx` y utilidades en `kebab-case.ts`. Organización por _feature_, no por tipo de archivo.
- **Rust:** `thiserror` en librerías, `anyhow` en binarios, `tracing` para logs (nunca `println!`). `cargo clippy -- -D warnings` debe pasar.
- **Atajos de teclado:** usa `Mod` (Cmd en macOS, Ctrl en Windows), nunca `Ctrl` fijo.
- **Rutas del sistema:** nada de rutas hardcodeadas con `/` o `\`. Usa `std::path` / `dirs` en Rust.
- **Dependencias nuevas:** justifícalas en el PR. Si es una decisión de arquitectura, agrega un ADR en `docs/adr/`.

### Arte ASCII

- Guárdalo en `apps/desktop/src/ascii/art/*.txt` e impórtalo con `?raw`. Nunca como strings dentro del código.
- Renderízalo con el componente `AsciiArt` (`<pre>`, fuente Geist Mono, `aria-hidden`).
- Usa solo caracteres que Geist Mono soporte: caja `┌─┐│└┘╭╮╯╰`, bloques `░▒▓█▀▄`.
- Respeta `prefers-reduced-motion` en animaciones.

---

## Archivos que NO se editan a mano

- `apps/desktop/src/bindings.ts`: generado por tauri-specta.
- `apps/desktop/src-tauri/gen/`: generado por Tauri.
- `apps/desktop/src-tauri/binaries/`: binario del daemon copiado en el build.
- `lenz-brand/`: assets de marca originales.
- `pnpm-lock.yaml`, `Cargo.lock`: solo cambian con el gestor de paquetes.

---

## Cómo funciona el daemon en desarrollo

- La app busca `lenz-daemon(.exe)` **al lado de su propio ejecutable** (`target/debug/` en dev, dentro del bundle en release). Por eso `pnpm dev` compila el daemon primero.
- En Windows la app ejecuta una **copia** del daemon (`target/debug/daemon-run/` en dev, `%LOCALAPPDATA%\Lenz\daemon\` en release), así `cargo build` nunca choca con un daemon corriendo.
- Si el daemon corriendo es de otro build (`build_id` = tamaño + fecha del binario) o de otro `PROTOCOL_VERSION`, la app lo apaga y lanza el nuevo. **Recompilar el daemon cierra las sesiones abiertas.**
- Dev y release no se pisan: en dev el pipe es `lenz-daemon-<usuario>-dev` y los datos van a `Lenz-dev/`.
- Log del daemon: `%LOCALAPPDATA%\Lenz-dev\daemon.log` (Windows) o `~/Library/Application Support/Lenz-dev/daemon.log` (macOS). Nivel con `RUST_LOG`.
- Para probar que una sesión sobrevive, cierra la ventana normalmente. No uses `kill` de Git Bash sobre la app: en Windows puede matar también al daemon.
- ConPTY pide la posición del cursor (`ESC[6n`) al arrancar y bloquea el proceso hasta recibir respuesta: la contesta el daemon (`session.rs`). Las consultas `ESC[6n` no se guardan en el scrollback.

## Pendientes conocidos

- Fase 1 reproduce el **scrollback crudo** (últimos 2 MB) al reconectar; el emulador (`emulator.rs`) dará la pantalla exacta en la fase 2.
- El layout del lienzo todavía no se guarda: al reabrir, las terminales se acomodan en grilla.
- `tauri-specta` aún no está integrado; por ahora `src/lib/ipc.ts` usa `invoke` tipado a mano.
- shadcn/ui, Motion, cmdk y Sonner se agregan cuando se use la primera pieza de cada uno.
