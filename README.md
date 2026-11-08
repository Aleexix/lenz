<p align="center">
  <img src="lenz-brand/lockup/png/lenz-lockup-on-dark.png" alt="Lenz" width="240" />
</p>

<p align="center"><strong>El sexto sentido de tu código.</strong><br/>ADE de escritorio para lanzar y orquestar squads de agentes de IA.</p>

## Requisitos

- Node.js 22 o superior
- pnpm (`npm install -g pnpm`)
- Windows 10+ o macOS

## Desarrollo

```sh
pnpm install
pnpm dev          # abre Lenz con recarga en caliente
```

| Comando                                | Qué hace                                     |
| -------------------------------------- | -------------------------------------------- |
| `pnpm lint`                            | Lint y formato (Biome)                       |
| `pnpm format`                          | Formatea todo                                |
| `pnpm typecheck`                       | Revisa tipos                                 |
| `pnpm build`                           | Compila a `apps/desktop/out`                 |
| `pnpm --filter @lenz/desktop dist:win` | Instalador `.exe` en `apps/desktop/release/` |
| `pnpm --filter @lenz/desktop dist:mac` | `.dmg` (hay que correrlo en una Mac)         |

El CI (GitHub Actions) genera el `.exe` y el `.dmg` en cada push a `main`; se descargan desde los _artifacts_ del workflow.

> **Mac:** la app no está firmada. La primera vez ábrela con clic derecho → Abrir.
> **Windows:** SmartScreen avisa porque no hay certificado; "Más información" → "Ejecutar de todas formas".

## Estructura

```
apps/desktop/   App Electron (main, preload, renderer React)
packages/       daemon, CLI y protocolo (llegan en las siguientes fases)
lenz-brand/     Kit de marca
docs/           Análisis y plan
```

Plan y fases: [docs/02-plan.md](docs/02-plan.md).
