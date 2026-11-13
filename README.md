# Lenz

> **El sexto sentido de tu código.**
> App de escritorio para lanzar y orquestar squads de agentes de IA sobre un lienzo infinito.

Hecha con Tauri 2, React, React Flow, xterm.js y un daemon en Rust que mantiene vivas las terminales aunque cierres la app.

- Arquitectura y stack: [`ARQUITECTURA.md`](ARQUITECTURA.md)
- Guía para agentes de IA y mapa del repo: [`CLAUDE.md`](CLAUDE.md)
- Marca: [`lenz-brand/BRAND.md`](lenz-brand/BRAND.md)

## Requisitos

- [Rust](https://rustup.rs/) estable
- Node.js 22+ y pnpm (`corepack enable`)
- **Windows:** Visual Studio Build Tools con "Desarrollo para el escritorio con C++"
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)

## Empezar

```sh
pnpm install
pnpm dev
```

## Estructura

```
apps/desktop/          App Tauri: frontend React (src/) y backend Rust (src-tauri/)
crates/lenz-daemon/    Sidecar: PTYs, estado de pantallas, SQLite, git, hooks
crates/lenz-protocol/  Mensajes compartidos app ↔ daemon
lenz-brand/            Assets de marca
docs/adr/              Decisiones de arquitectura
```

## Instalar una release sin firmar

Las primeras versiones no están firmadas con certificados de pago.

- **Windows:** si aparece SmartScreen, haz clic en "Más información" → "Ejecutar de todas formas".
- **macOS:** después de arrastrar Lenz a Aplicaciones, ejecuta una vez:

  ```sh
  xattr -cr /Applications/Lenz.app
  ```

  o ve a Ajustes del Sistema → Privacidad y seguridad → "Abrir de todas formas".
