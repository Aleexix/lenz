# Lenz — Análisis de referencias (Herdr y Orca)

Fecha: 2026-11-07. Repos revisados: `herdrdev/herdr-app`, `herdrdev/herdr-core` (su daemon), `stablyai/orca`.

## Herdr (herdr-app + herdr-core)

| Aspecto                    | Detalle                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Licencia                   | Apache-2.0                                                                                                                                   |
| Stack                      | Rust 2024, GPUI (el framework UI de Zed, render por GPU), Ghostty como motor de terminal (vía Zig), QuickJS para mods en JS                  |
| Tamaño                     | ~25k líneas Rust en la app; el core es aparte                                                                                                |
| Arquitectura               | **Dos procesos**: `herdr-core` (`hc`) corre los terminales y los mantiene vivos; `herdr-app` sólo los dibuja. Cerrar la ventana no mata nada |
| Modelo                     | Space (una máquina/repo) → Tabs → Panes (splits)                                                                                             |
| Estado de agentes          | Working / Blocked / Done / Idle. Sale **sólo** del protocolo OSC 7501 (el agente lo emite en su salida). No adivina leyendo pantalla         |
| Agentes que lanzan agentes | `hc run --bg`, `hc send`, `hc wait --children`; jerarquía padre/hijo                                                                         |
| Remoto                     | Máquinas SSH; el core remoto mantiene los terminales vivos                                                                                   |
| Extensibilidad             | Núcleo pequeño, todo lo demás son "mods" JS + layouts JSON con hot-reload                                                                    |
| CLI para agentes           | `herdr-app --skill` / `hc --skill` imprime un manual para que el agente controle la app                                                      |

**Lo mejor de Herdr:** separación core/UI, núcleo mínimo, estados de agente claros, protocolo estándar (OSC 7501), CLI pensada para agentes, rendimiento.
**Lo malo para nosotros:** Rust+GPUI+Zig+Ghostty vendorizados = curva enorme y build pesado en Windows. Sin diffs, sin git review, sin worktrees de primera clase.

## Orca

| Aspecto           | Detalle                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Licencia          | MIT                                                                                                                                                             |
| Stack             | Electron 43, React 19, TypeScript, Vite (electron-vite), Tailwind 4 + shadcn/Radix, Zustand, xterm.js 6 (WebGL), node-pty, Monaco, Shiki, TipTap, ssh2, i18next |
| Tamaño            | ~30k archivos TS; ~140 módulos en `src/main`. Soporta ~30 agentes distintos, app móvil, cloud, browser embebido, Linear/Jira/GitLab…                            |
| Arquitectura      | `main` (Electron) + `preload` + `renderer` (React) + **daemon de PTY** separado (`src/main/daemon`, `orcad`) + `cli` (`orca …`)                                 |
| Modelo            | Repo → Worktree por tarea (cada agente aislado en su propia rama) → Tabs → Panes                                                                                |
| Estado de agentes | Hooks gestionados por agente (Claude Code, Codex, etc. hacen POST a un servidor local) **+** OSC 7501 como respaldo. Hooks ganan                                |
| Review            | Diff de la worktree, notas en líneas concretas que se mandan al agente, commit/PR generados                                                                     |
| Otros             | Browser embebido con "design mode", orquestación coordinador→workers, plugins, notificaciones                                                                   |

**Lo mejor de Orca:** worktree por tarea, review de diffs con feedback al agente, integración git/GitHub, hooks ricos por agente, stack web productivo.
**Lo malo para nosotros:** gigantesco y con montones de features que no necesitamos; copiarlo tal cual es inmantenible para un equipo pequeño.

## Síntesis: qué tomar de cada uno

| De Herdr                                                     | De Orca                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Daemon de terminales separado (sobreviven al cerrar la app)  | Stack Electron + React + TS + xterm.js + node-pty                  |
| Spaces → Tabs → Panes + sidebar de agentes con 4 estados     | Worktree por tarea/agente                                          |
| OSC 7501 como protocolo base de estado                       | Hooks de Claude Code/Codex para estado rico (prompt, tool, sesión) |
| CLI `lenz` + `--skill` para que los agentes controlen la app | Vista de diff + comentarios por línea → enviar al agente           |
| Núcleo pequeño, disciplina de alcance                        | Commit/PR asistido, shadcn/Tailwind como design system             |
