import { Bot, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Field, inputClass } from '../components/ui/dialog'
import { useUi } from '../ui-store'
import { activeProject, activeTab, agentPanes, useWorkspace } from '../workspace/workspace-store'
import { useProfiles } from './profiles-store'

function nextAgentName(): string {
  const used = new Set(agentPanes(useWorkspace.getState().workspace).map(({ pane }) => pane.agent.name))
  let number = 1
  while (used.has(`Claude ${number}`)) number++
  return `Claude ${number}`
}

export function NewAgentDialog() {
  const open = useUi((state) => state.dialog === 'newAgent')
  const openDialog = useUi((state) => state.openDialog)
  const { profiles, lastUsedId, refresh, setLastUsed } = useProfiles()
  const project = useWorkspace((state) => activeProject(state.workspace))
  const hasTab = useWorkspace((state) => activeTab(state.workspace) !== null)

  const [profileId, setProfileId] = useState('')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [placement, setPlacement] = useState<'tab' | 'split'>('tab')
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    void refresh()
    setName(nextAgentName())
    setPrompt('')
    setPlacement('tab')
  }, [open, refresh])

  useEffect(() => {
    if (!open || profiles.length === 0) return
    setProfileId((current) => {
      if (profiles.some((profile) => profile.id === current)) return current
      return profiles.find((profile) => profile.id === lastUsedId)?.id ?? profiles[0]?.id ?? ''
    })
  }, [open, profiles, lastUsedId])

  const profile = profiles.find((candidate) => candidate.id === profileId)
  const missingKey = profile?.kind === 'anthropic-compatible' && !profile.hasApiKey
  const canLaunch = Boolean(project && profile && name.trim() && !missingKey)

  function launch() {
    if (!canLaunch || !profile) return
    setLastUsed(profile.id)
    useWorkspace
      .getState()
      .launchAgent(
        { name: name.trim(), profileId: profile.id, ...(prompt.trim() ? { prompt: prompt.trim() } : {}) },
        hasTab ? placement : 'tab',
      )
    openDialog(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'newAgent' : null)}
      title="Nuevo agente"
      initialFocus={promptRef}
      description={project ? `Claude Code en ${project.name}` : 'Abre un proyecto primero.'}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          launch()
        }}
        className="space-y-4"
      >
        <Field label="Proveedor">
          <div className="flex gap-2">
            <select
              className={inputClass}
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
            >
              {profiles.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <Button variant="ghost" title="Gestionar proveedores" onClick={() => openDialog('providers')}>
              <Settings2 size={16} />
            </Button>
          </div>
          {missingKey ? (
            <span className="block text-xs text-amber-300">
              Este perfil no tiene API key. Agrégala en Proveedores.
            </span>
          ) : null}
        </Field>

        <Field label="Nombre">
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="Tarea" hint="Opcional. Es el primer mensaje que recibe el agente.">
          <textarea
            ref={promptRef}
            className={`${inputClass} min-h-24 resize-y`}
            placeholder="Ej.: Revisa por qué falla el login y propón un arreglo"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) launch()
            }}
          />
        </Field>

        {hasTab ? (
          <fieldset className="flex gap-4 text-sm text-ice/80">
            <legend className="sr-only">Dónde abrirlo</legend>
            {(['tab', 'split'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="placement"
                  checked={placement === value}
                  onChange={() => setPlacement(value)}
                  className="accent-electric-600"
                />
                {value === 'tab' ? 'En una pestaña nueva' : 'Junto al panel actual'}
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => openDialog(null)}>
            Cancelar
          </Button>
          <button
            type="submit"
            disabled={!canLaunch}
            className="flex items-center gap-2 rounded-md bg-electric-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-electric-400 disabled:opacity-50 disabled:hover:bg-electric-600"
          >
            <Bot size={15} />
            Lanzar
          </button>
        </div>
      </form>
    </Dialog>
  )
}
