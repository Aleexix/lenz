import { SHORTCUT_LABELS, type ShortcutAction } from '../workspace/shortcuts'
import { SectionHeader } from './SectionHeader'

const isMac = navigator.userAgent.includes('Mac')

const ACTION_LABELS: Record<ShortcutAction, string> = {
  newTab: 'Nueva pestaña',
  newAgent: 'Nuevo agente',
  newTask: 'Nueva tarea',
  openReview: 'Ver cambios',
  closePane: 'Cerrar panel',
  splitRight: 'Dividir a la derecha',
  splitDown: 'Dividir hacia abajo',
  nextTab: 'Pestaña siguiente',
  prevTab: 'Pestaña anterior',
  openSettings: 'Ajustes',
}

const CLIPBOARD_ROWS: [string, string][] = isMac
  ? [
      ['Copiar', '⌘C'],
      ['Pegar', '⌘V'],
    ]
  : [
      ['Copiar', 'Ctrl+C con texto seleccionado, o Ctrl+Shift+C'],
      ['Pegar', 'Ctrl+V o Ctrl+Shift+V'],
    ]

export function ShortcutsSection() {
  const rows: [string, string][] = [
    ...(Object.keys(ACTION_LABELS) as ShortcutAction[]).map((action): [string, string] => [
      ACTION_LABELS[action],
      SHORTCUT_LABELS[action],
    ]),
    ...CLIPBOARD_ROWS,
  ]
  return (
    <>
      <SectionHeader title="Atajos de teclado" description="Por ahora no se pueden cambiar." />
      <dl className="divide-y divide-navy-800 rounded-lg border border-navy-700">
        {rows.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            <dt className="text-ice/80">{label}</dt>
            <dd>
              <kbd className="rounded border border-navy-700 bg-navy-950 px-1.5 py-0.5 font-mono text-xs text-ice/80">
                {keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}
