# Lenz — Brand kit

> **El sexto sentido de tu código.**
> ADE de escritorio para lanzar y orquestar squads de agentes de IA.

## El nombre

**Lenz** viene de las *ampollas de Lorenzini*: los electrorreceptores con los que el tiburón martillo detecta señales invisibles, incluso presas enterradas en la arena. El martillo tiene más que ningún otro tiburón, repartidos a lo largo de su cabeza ancha, y barre el fondo como un detector.

Los agentes de Lenz hacen lo mismo con tu repo: perciben lo que está oculto (bugs, dependencias, contexto) y recorren el codebase completo.

Eslóganes:
- *El sexto sentido de tu código.*
- *Siente tu código.*
- *Agentes que ven lo que tú no ves.*

Vocabulario en la app: un **squad** es un equipo de agentes. "Nuevo squad", "Tu squad está trabajando".

## Estructura

```
lenz-brand/
├── icon/       Icono de la app (tile redondeado)
│   ├── lenz-icon-navy.svg / .ico / .icns      ← principal
│   ├── lenz-icon-electric.svg / .ico / .icns  ← alternativo
│   └── png/    16, 24, 32, 48, 64, 128, 256, 512, 1024 px
├── mark/       Solo el tiburón, fondo transparente
│   ├── lenz-mark-white.svg       sobre fondos oscuros
│   ├── lenz-mark-navy.svg        sobre fondos claros
│   ├── lenz-mark-electric.svg
│   ├── lenz-mark-mono-white.svg  un solo color (sellos, grabados)
│   └── lenz-mark-mono-black.svg
├── wordmark/   "Lenz" en Geist SemiBold, convertido a trazos
└── lockup/     Icono + wordmark
    ├── lenz-lockup-on-dark.svg   texto blanco
    ├── lenz-lockup-on-light.svg  texto navy
    └── lenz-lockup-electric-on-light.svg
```

## Dónde usar cada archivo

| Uso | Archivo |
|---|---|
| Electron / Tauri (Windows) | `icon/lenz-icon-navy.ico` |
| Electron / Tauri (macOS) | `icon/lenz-icon-navy.icns` |
| Linux / Tauri `icons/` | `icon/png/lenz-icon-navy-{32,128,256,512}.png` |
| Favicon de docs/web | `icon/png/lenz-icon-navy-32.png` o el SVG |
| README de GitHub | `lockup/png/lenz-lockup-on-dark.png` |
| Splash / sidebar de la app | `mark/lenz-mark-white.svg` |
| Avatar de GitHub / redes | `icon/png/lenz-icon-navy-512.png` |

## Colores

| Token | Hex | Uso |
|---|---|---|
| Navy 950 | `#070E2B` | Fondo más profundo, texto sobre claro |
| Navy 800 | `#1A2F6E` | Fondo del icono, superficies |
| Electric 600 | `#2F6BF0` | Acento, acciones primarias |
| Electric 400 | `#5B9BFF` | Hover, enlaces, resaltados |
| Ice | `#EEF3FD` | Fondo claro, sombreado del tiburón |
| White | `#FFFFFF` | Tiburón, texto sobre oscuro |

Gradiente del icono navy: `#1A2F6E → #070E2B` (diagonal, arriba-izquierda a abajo-derecha).
Gradiente del icono electric: `#5B9BFF → #2F6BF0`.

## Tipografía

- **Geist** (SemiBold 600) para el wordmark y los títulos. Letter-spacing −0.035em en el wordmark.
- **Geist Mono** para código, etiquetas y la terminal.
- Las dos son libres (SIL OFL): `npm i geist` o Google Fonts.

## Reglas rápidas

- Deja aire alrededor del logo: como mínimo, la mitad del ancho de la aleta dorsal.
- No deformes, rotes ni cambies los colores del tiburón fuera de las variantes incluidas.
- Tamaño mínimo del icono: 16 px. Del lockup: 96 px de ancho.
- Sobre fotos o fondos con mucho ruido, usa el icono con tile en vez del mark suelto.
