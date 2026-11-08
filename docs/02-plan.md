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
└── Tarea  → worktree + rama propia (opcional: también puede ser la carpeta tal cual)
    └── Tabs → Panes (terminal, agente, diff)
```

**Squad** = los agentes de una tarea. Estados (de Herdr): **Trabajando · Bloqueado · Listo · Inactivo**.

## Estado de los agentes

1. **Hooks de Claude Code** (prioridad): Lenz instala hooks que avisan al daemon por HTTP local. Dan estado, prompt, herramienta en uso y el id de sesión (para reanudar).
2. **OSC 7501** (respaldo): protocolo estándar; Claude Code lo emite desde la 2.1.295. Sirve para agentes sin hooks y en máquinas remotas donde aún no se instalaron.

## Perfiles de proveedor

Un perfil = qué comando lanzar + qué variables de entorno inyectar.

| Perfil               | Cómo                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Claude (suscripción) | `claude` tal cual, con la sesión del usuario                                                                           |
| z.ai                 | `claude` con `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` de z.ai (endpoint compatible con Anthropic)                 |
| NVIDIA               | API compatible con OpenAI → hace falta un traductor (p. ej. LiteLLM) u otro agente que la hable. **Validar en fase 2** |
| Personalizado        | URL + key + modelo                                                                                                     |

## Fases

### Fase 0 — Cimientos

- Monorepo pnpm, TypeScript estricto, lint/format.
- App Electron vacía con marca: icono, colores, Geist, tema oscuro.
- Build de `.exe` (Windows) y `.dmg` (Mac) desde CI (GitHub Actions).

**Listo cuando:** cualquiera del equipo instala Lenz y abre una ventana con la marca.

### Fase 1 — Terminales que no mueren

- `lenzd`: crear/escribir/redimensionar/cerrar PTYs, guardar su pantalla.
- Proyectos, tabs, splits; xterm.js con WebGL.
- Cerrar y reabrir la app sin perder terminales.

**Listo cuando:** abro 4 terminales en splits, cierro Lenz, lo reabro y siguen ahí.

### Fase 2 — Agentes y squads

- Botón "Nuevo agente" con perfil de proveedor.
- Hooks de Claude Code + OSC 7501 → sidebar del squad con los 4 estados.
- Notificación del sistema cuando un agente queda bloqueado o termina.
- Gestión de API keys (safeStorage).

**Listo cuando:** lanzo 3 Claude Code (uno con z.ai) y veo en el sidebar quién me necesita.

### Fase 3 — Worktrees

- "Nueva tarea" → crea rama + worktree y lanza el agente ahí.
- Lista de tareas por proyecto; borrar tarea limpia la worktree.

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

- NVIDIA: cómo conectarlo (fase 2).
- Firma de código: para Mac, sin cuenta de Apple Developer ($99/año) la app sale como "no verificada" y hay que abrirla con clic derecho → Abrir. En Windows sin certificado, SmartScreen avisa. Para uso interno se puede vivir con eso.
- ¿Repo en GitHub de quién? (para CI y releases).
