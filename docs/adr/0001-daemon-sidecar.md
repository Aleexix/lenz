# ADR 0001 — Las terminales viven en un daemon sidecar

- **Estado:** aceptada
- **Fecha:** 2026-11-12

## Contexto

Los agentes deben seguir corriendo aunque el usuario cierre Lenz, y al reabrir la app cada terminal tiene que verse tal como estaba. Si los PTYs viven dentro del proceso de Tauri, mueren con la app.

## Decisión

Un binario Rust aparte, `lenz-daemon`, empaquetado como sidecar de Tauri, es dueño de los PTYs (`portable-pty`), del estado de pantalla (emulador) y de la persistencia (SQLite). La app se conecta por named pipe (Windows) o socket Unix (macOS) usando los mensajes de `lenz-protocol` serializados en MessagePack.

## Consecuencias

- Las sesiones sobreviven al cierre y a los crashes de la UI.
- Hay que manejar el ciclo de vida del daemon (lanzarlo, reconectar, versionar el protocolo, cerrarlo por inactividad).
- Se agrega un salto de IPC más entre la UI y el PTY, que se mitiga agrupando la salida.

---

Plantilla para nuevos ADRs: copia este archivo como `NNNN-titulo-corto.md` con las secciones Contexto, Decisión y Consecuencias.
