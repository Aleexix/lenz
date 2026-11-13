/**
 * Sustituto mínimo del paquete `framer` para componentes copiados de Framer
 * (ver `vendor/ascii-ocean/README.md`). Fuera del editor de Framer los controles
 * de propiedades no se usan, así que estas exportaciones no hacen nada.
 */

export const ControlType = {
  Array: "array",
  Boolean: "boolean",
  Color: "color",
  Enum: "enum",
  Font: "font",
  Number: "number",
  String: "string",
} as const;

export function addPropertyControls(_component: unknown, _controls: unknown): void {}
