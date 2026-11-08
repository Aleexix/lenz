# Lenz — Plan técnico

> _El sexto sentido de tu código._ ADE de escritorio para lanzar y orquestar squads de agentes de IA.

Versión 1 · 2026-11-08 · Ver también [01-analisis-referencias.md](01-analisis-referencias.md)

## Decisiones tomadas

| Tema         | Decisión                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| Plataformas  | Windows y macOS                                                                       |
| Stack        | Electron + React + TypeScript (nadie del equipo sabe Rust)                            |
| Colaboración | **No.** Lenz es una app individual; cada quien la instala en su máquina               |
| Remoto       | SSH primero. RDP queda fuera (se sigue usando a mano)                                 |
| Agentes      | Claude Code con suscripción + perfiles de proveedor con API key (z.ai, NVIDIA, otros) |

## Stack

| Capa                            | Tecnología                                             | Por qué                                        |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Monorepo                        | pnpm workspaces                                        | Igual que Orca; simple                         |
| App de escritorio               | Electron + electron-vite                               | Chromium idéntico en Windows y Mac             |
| UI                              | React 19 + TypeScript + Tailwind 4 + shadcn/ui (Radix) | Rápido de construir, design system listo       |
| Estado UI                       | Zustand                                                | Ligero; lo usa Orca                            |
| Terminal                        | xterm.js 6 + addon WebGL                               | El estándar (VS Code, Orca)                    |
| PTY                             | node-pty (ConPTY en Windows)                           | El estándar                                    |
| Estado de pantalla en el daemon | @xterm/headless                                        | Reconectar sin perder lo que había en pantalla |
| Diffs / editor                  | Monaco                                                 | Diff lado a lado y comentarios por línea       |
| SSH                             | ssh2                                                   | Sin depender del `ssh` del sistema             |
| Validación / protocolo          | zod                                                    | Tipos compartidos entre daemon, app y CLI      |
| Secretos                        | `safeStorage` de Electron (Keychain / DPAPI)           | Las API keys nunca en texto plano              |
| Empaquetado                     | electron-builder + electron-updater                    | .exe y .dmg, auto-update                       |
| Tests                           | Vitest + Playwright (Electron)                         |                                                |

## Arquitectura

Tres procesos, como Herdr y Orca:

```
┌──────────────── Lenz (Electron) ────────────────┐
│ renderer (React)  ⇄  preload  ⇄  main           │
└──────────────────────────┬──────────────────────┘
                           │ JSON-RPC (named pipe en Windows, socket Unix en Mac)
┌──────────────────────────▼──────────────────────┐
│ lenzd (daemon Node)                              │
│  • PTYs vivos aunque cierres la ventana          │
│  • estado de agentes (hooks + OSC 7501)          │
│  • git / worktrees • conexiones SSH              │
└──────────────────────────▲──────────────────────┘
                           │ mismo protocolo
                   lenz (CLI para agentes y humanos)
```

- **Cerrar la ventana no mata los agentes.** Al abrir Lenz de nuevo, se reconecta al daemon y recupera la pantalla de cada terminal.
- **El CLI y la app hablan el mismo protocolo**: todo lo que hace la app lo puede hacer un agente.

## Estructura del repo

```
lenz/
├── apps/
│   └── desktop/            Electron
│       ├── src/main/        ventana, menús, arranque del daemon, updater
│       ├── src/preload/     puente seguro main ⇄ renderer
│       └── src/renderer/    React: sidebar, tabs, panes, diffs, settings
├── packages/
│   ├── daemon/             lenzd: pty, sesiones, agentes, git, ssh
│   ├── cli/                comando `lenz`
│   ├── protocol/           esquemas zod + tipos del RPC y de eventos
│   └── ui/                 tokens de marca y componentes shadcn
├── lenz-brand/             kit de marca (ya existe)
└── docs/
```

## Modelo

```
Proyecto (un repo o carpeta, local o en una máquina SSH)
└── Espacio: el principal (la carpeta del proyecto) o una tarea (worktree + rama propia)
    └── Tabs → Panes (terminal, agente, diff)
```

**Squad** = los agentes de una tarea. Estados (de Herdr): **Trabajando · Bloqueado · Listo · Inactivo**.

## Estado de los agentes

1. **Hooks de Claude Code** (prioridad): Lenz instala hooks que avisan al daemon por HTTP local. Dan estado, prompt, herramienta en uso y el id de sesión (para reanudar).
2. **OSC 7501** (respaldo): protocolo estándar; Claude Code lo emite desde la 2.1.295. Sirve para agentes sin hooks y en máquinas remotas donde aún no se instalaron.

## Perfiles de proveedor

Un perfil = qué comando lanzar + qué variables de entorno inyectar.

| Perfil               | Cómo                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (suscripción) | `claude` tal cual, con la sesión del usuario                                                                                                                                                                                                              |
| z.ai                 | `claude` con `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` de z.ai (endpoint compatible con Anthropic)                                                                                                                                                    |
| NVIDIA               | Validado (2026-11-08): la API alojada (`integrate.api.nvidia.com`) sólo habla formato OpenAI. Opciones: un traductor local (LiteLLM, `nvd-claude-proxy`) y un perfil **Personalizado** apuntando a él, o un NIM autoalojado, que sí expone `/v1/messages` |
| Personalizado        | URL + key + modelo                                                                                                                                                                                                                                        |

## Fases

### Fase 0 — Cimientos

- Monorepo pnpm, TypeScript estricto, lint/format.
- App Electron vacía con marca: icono, colores, Geist, tema oscuro.
- Build de `.exe` (Windows) y `.dmg` (Mac) desde CI (GitHub Actions).

**Listo cuando:** cualquiera del equipo instala Lenz y abre una ventana con la marca.

✅ Hecha (2026-11-08).

### Fase 1 — Terminales que no mueren

- `lenzd`: crear/escribir/redimensionar/cerrar PTYs, guardar su pantalla.
- Proyectos, tabs, splits; xterm.js.
- Cerrar y reabrir la app sin perder terminales.

**Listo cuando:** abro 4 terminales en splits, cierro Lenz, lo reabro y siguen ahí.

✅ Hecha (2026-11-08). Notas de implementación:

- `lenzd` es el propio ejecutable de Lenz en modo Node (`ELECTRON_RUN_AS_NODE`), lanzado desacoplado. Escucha en un named pipe (Windows) o socket Unix (Mac) con JSON por líneas; protocolo en `packages/protocol`.
- Cada terminal tiene un espejo `@xterm/headless`; al reconectar, la app recibe una foto de la pantalla y luego sólo lo nuevo (números de secuencia para no duplicar).
- El layout (proyectos, tabs, splits) se guarda en `workspace.json` en la carpeta de datos de la app. Si una terminal ya no existe (reinicio del PC), el pane abre una shell nueva en su carpeta.
- `lenzd` se cierra solo tras 60 s sin terminales ni ventanas.
- Desarrollo usa su propia carpeta de datos (`Lenz Dev`) y su propio `lenzd`. `LENZ_USER_DATA` permite aislar pruebas.
- **WebGL desactivado:** `@xterm/addon-webgl` dibujaba los caracteres con una fuente por defecto en Electron 45 (con cualquier `fontFamily`). Se usa el renderizador DOM, que se ve bien. Revisar en una versión futura de xterm/Electron.
- **Actualizar la app reinicia `lenzd`** (si cambia su código) y eso cierra las terminales abiertas. Resolver en fase 7 (traspaso de terminales entre versiones del daemon).

### Fase 2 — Agentes y squads

- Botón "Nuevo agente" con perfil de proveedor.
- Hooks de Claude Code + OSC 7501 → sidebar del squad con los 4 estados.
- Notificación del sistema cuando un agente queda bloqueado o termina.
- Gestión de API keys (safeStorage).

**Listo cuando:** lanzo 3 Claude Code (uno con z.ai) y veo en el sidebar quién me necesita.

✅ Hecha (2026-11-08). Notas de implementación:

- Lenz lanza `claude --settings <archivo> --session-id <uuid> [tarea]`. El archivo (en `agents/` de la carpeta de datos) sólo trae **hooks HTTP** hacia `lenzd`; la configuración propia de Claude no se toca.
- `lenzd` tiene un servidor HTTP local (127.0.0.1, puerto aleatorio) y un token por agente. Mapea los hooks: `UserPromptSubmit`/`PreToolUse` → Trabajando; `PermissionRequest` y `Notification(permission_prompt)` → Te necesita (las preguntas de `AskUserQuestion` muestran la pregunta); `Stop` → Listo; `StopFailure` → Error.
- **OSC 7501** se lee del espejo headless de cada terminal y `lenzd` responde la pregunta `?`. En Windows, ConPTY descarta esa respuesta de entrada, así que los programas no reportan por OSC; ahí los hooks son la fuente. Los hooks mandan sobre OSC por 2 minutos.
- "Listo" pasa a "Inactivo" cuando miras el agente (ventana enfocada + panel enfocado). Notificación del sistema si un agente queda bloqueado, termina o falla mientras miras otra cosa.
- Si la terminal de un agente ya no existe (reinicio), el panel reanuda la conversación con `--resume <sessionId>`.
- Perfiles en `profiles.json`; API keys cifradas con `safeStorage` (DPAPI / Keychain) en `secrets.json`. La key sólo existe descifrada en el proceso principal y en el entorno del agente.
- Al lanzar un agente se quitan las variables que deja una sesión padre de Claude Code (`CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`…); si no, Claude no guarda transcript y no se puede reanudar.
- Verificado con Claude Code 2.1.319 real en Windows: trabajando → listo, pregunta → te necesita → listo, reanudar tras matar `lenzd`, y perfil z.ai (llega a z.ai, que rechazó una key falsa con 401).
- **Sin verificar en vivo:** el aviso de permiso de herramientas (la configuración local usa _auto mode_ y nunca pidió permiso; el mapeo está cubierto por pruebas) y todo en Mac.

### Fase 3 — Worktrees

- "Nueva tarea" → crea rama + worktree y lanza el agente ahí.
- Lista de tareas por proyecto; borrar tarea limpia la worktree.

✅ Hecha (2026-11-08). Notas de implementación:

- `workspace.json` pasa a la versión 2: cada proyecto tiene _espacios_ (el principal y uno por tarea) con sus pestañas. Los archivos v1 se migran solos al abrir.
- La rama es `lenz/<nombre-de-la-tarea>` y el worktree vive junto al repo: `<repo>-worktrees/<nombre>`. Si el nombre ya existe se agrega `-2`, `-3`…
- La barra lateral anida las tareas bajo su proyecto y muestra `●N` (archivos sin commit) y `↑N` (commits por delante de la rama base); se refresca cada 10 s y al enfocar la ventana.
- Borrar una tarea cierra sus terminales y agentes, borra el worktree y, si se elige, la rama. Por defecto la rama se conserva.
- **Confianza de carpeta de Claude Code:** cada worktree es una carpeta nueva y Claude preguntaría "¿confías en esta carpeta?", dejando la tarea detenida. Lenz copia al worktree la confianza que el repo ya tiene en `~/.claude.json` (con el mismo bloqueo de archivo que usa Claude). Si el repo no es de confianza, Claude pregunta como siempre.
- Verificado en Windows con Claude Code real: tarea con agente → el agente hizo commit en su rama → `↑1` → borrado (carpeta y rama). También la migración v1 → v2.
- Pendiente: mientras Claude muestra su pregunta de confianza (repo no confiable) el agente aparece "Inactivo", no "Te necesita", porque esa pantalla no dispara hooks.

### Fase 4 — Revisión

- Diff de la tarea contra la rama base (Monaco).
- Comentarios en líneas → se envían al agente como mensaje.
- Commit y PR asistidos (vía `gh`).

### Fase 5 — SSH

- Máquinas leídas de `~/.ssh/config` o agregadas a mano.
- Proyectos y terminales remotos.
- Persistencia remota: `lenzd` empaquetado (Node portable) que se instala en el servidor por SSH.

### Fase 6 — CLI y orquestación

- `lenz ls / status / run / send / read / wait`.
- `lenz --skill`: manual para que un agente sepa usar Lenz.
- Un agente coordinador lanza workers en sus propias tareas y recibe sus resultados.

### Fase 7 — Pulido

- Paleta de comandos, atajos editables, ajustes, auto-update, sonidos.

## Fuera de alcance (por ahora)

Colaboración en equipo, RDP, app móvil, cloud, navegador embebido, plugins, Linear/Jira.

## Pendientes a validar

- Firma de código: para Mac, sin cuenta de Apple Developer ($99/año) la app sale como "no verificada" y hay que abrirla con clic derecho → Abrir. En Windows sin certificado, SmartScreen avisa. Para uso interno se puede vivir con eso.
- ¿Repo en GitHub de quién? (para CI y releases).
- Probar la fase 1 en Mac (sólo se verificó en Windows; el CI corre las pruebas del daemon en ambos).
