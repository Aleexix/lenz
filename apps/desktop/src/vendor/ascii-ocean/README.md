# ASCII Ocean (Framer)

`AsciiOcean.js` es una copia **sin modificar** del componente de Framer:

- Enlace: https://framer.com/m/ASCII-Ocean-f88qXm.js@VdLalByg0sf5raKqVZTO
- Módulo: `https://framerusercontent.com/modules/pej7HKk714GH1Sh01fqW/VdLalByg0sf5raKqVZTO/AsciiOcean.js`
- SHA-256: `8dd0358e54736dd8e2e346cb9785df4f1bd38c6d9131fcb00cc7da9292973fd8`

No se edita a mano. Para actualizarlo, descarga de nuevo el módulo y reemplaza el archivo.
La configuración de Lenz (tiburones martillo, colores de la app) va por props en
`home/OceanBackground.tsx`.

- El import `framer` (`addPropertyControls`, `ControlType`) se resuelve con `../framer-shim.ts` vía un alias en `vite.config.ts`. Fuera de Framer, esas llamadas no hacen nada.
- `AsciiOcean.d.ts` da los tipos de sus props.
- Se usa en `home/OceanBackground.tsx` con los valores por defecto de los controles de Framer.

**Licencia:** el archivo no declara licencia. Antes de distribuir Lenz hay que confirmar con el autor o con los términos de Framer que se puede redistribuir.
