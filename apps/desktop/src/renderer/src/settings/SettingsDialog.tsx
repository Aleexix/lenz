import { Info, Keyboard, KeyRound } from 'lucide-react'
import type { ComponentType } from 'react'
import { Dialog } from '../components/ui/dialog'
import { type SettingsSection, useUi } from '../ui-store'
import { AboutSection } from './AboutSection'
import { ProvidersSection } from './ProvidersSection'
import { ShortcutsSection } from './ShortcutsSection'

const SECTIONS: {
  id: SettingsSection
  label: string
  icon: ComponentType<{ size?: number }>
  view: ComponentType
}[] = [
  { id: 'providers', label: 'Proveedores', icon: KeyRound, view: ProvidersSection },
  { id: 'shortcuts', label: 'Atajos', icon: Keyboard, view: ShortcutsSection },
  { id: 'about', label: 'Acerca de', icon: Info, view: AboutSection },
]

export function SettingsDialog() {
  const open = useUi((state) => state.dialog === 'settings')
  const section = useUi((state) => state.settingsSection)
  const { openDialog, openSettings } = useUi.getState()
  const current = SECTIONS.find((candidate) => candidate.id === section) ?? SECTIONS[0]
  const View = current?.view ?? ProvidersSection

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? openSettings(section) : openDialog(null))}
      title="Ajustes"
      width="max-w-4xl"
    >
      <div className="grid min-h-[28rem] grid-cols-[170px_1fr] gap-5">
        <nav className="space-y-0.5 border-r border-navy-800 pr-3">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={id === current?.id ? 'page' : undefined}
              onClick={() => openSettings(id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                id === current?.id
                  ? 'bg-navy-800 text-ice'
                  : 'text-ice/65 hover:bg-navy-800/60 hover:text-ice'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          <View />
        </div>
      </div>
    </Dialog>
  )
}
