import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PROFILE_PRESETS, type ProfileInput, type ProviderProfile } from '../../../shared/profiles'
import { Button, Dialog, Field, inputClass } from '../components/ui/dialog'
import { useUi } from '../ui-store'
import { useProfiles } from './profiles-store'

type Draft = ProfileInput & { help?: string }

function draftFrom(profile: ProviderProfile): Draft {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    baseUrl: profile.baseUrl ?? '',
    model: profile.model ?? '',
    fastModel: profile.fastModel ?? '',
    apiKey: '',
  }
}

export function ProvidersDialog() {
  const open = useUi((state) => state.dialog === 'providers')
  const openDialog = useUi((state) => state.openDialog)
  const { profiles, refresh } = useProfiles()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    void refresh()
    setDraft(null)
    setError(null)
  }, [open, refresh])

  const editing = draft?.id ? profiles.find((profile) => profile.id === draft.id) : undefined

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const { help: _help, ...input } = draft
      await window.lenz.profiles.save(input)
      await refresh()
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function remove(profile: ProviderProfile) {
    const ok = await window.lenz.dialog.confirm(
      `¿Borrar el perfil "${profile.name}"?`,
      'También se borra su API key. Los agentes que ya están corriendo no se detienen.',
      'Borrar',
    )
    if (!ok) return
    await window.lenz.profiles.delete(profile.id)
    await refresh()
    setDraft(null)
  }

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'providers' : null)}
      title="Proveedores"
      description="Con qué cuenta o API corre cada agente. Las API keys se guardan cifradas por el sistema operativo."
      width="max-w-2xl"
    >
      <div className="grid grid-cols-[200px_1fr] gap-4">
        <div className="space-y-1">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => {
                setError(null)
                setDraft(profile.builtin ? null : draftFrom(profile))
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                draft?.id === profile.id ? 'bg-navy-800 text-ice' : 'text-ice/75 hover:bg-navy-800/60'
              }`}
            >
              <span className="flex-1 truncate">{profile.name}</span>
              {profile.kind === 'anthropic-compatible' ? (
                <KeyRound size={13} className={profile.hasApiKey ? 'text-emerald-400' : 'text-amber-400'} />
              ) : null}
            </button>
          ))}
          <div className="border-t border-navy-700 pt-2">
            <p className="px-2 pb-1 text-[11px] tracking-wider text-ice/40 uppercase">Agregar</p>
            {PROFILE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setError(null)
                  setDraft({
                    name: preset.name,
                    kind: 'anthropic-compatible',
                    baseUrl: preset.baseUrl,
                    model: preset.model,
                    fastModel: preset.fastModel,
                    apiKey: '',
                    help: preset.help,
                  })
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-electric-400 hover:bg-navy-800/60"
              >
                <Plus size={13} />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-64 rounded-lg border border-navy-700 bg-navy-950/40 p-4">
          {draft ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              {draft.help ? <p className="text-xs text-ice/55">{draft.help}</p> : null}
              <Field label="Nombre">
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="URL base" hint="Endpoint compatible con la API de Anthropic.">
                <input
                  className={inputClass}
                  placeholder="https://…"
                  value={draft.baseUrl}
                  onChange={(e) => update({ baseUrl: e.target.value })}
                />
              </Field>
              <Field
                label="API key"
                hint={
                  editing?.hasApiKey ? 'Guardada. Escribe una nueva solo si quieres reemplazarla.' : undefined
                }
              >
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="off"
                  placeholder={editing?.hasApiKey ? '••••••••' : 'Pega tu API key'}
                  value={draft.apiKey}
                  onChange={(e) => update({ apiKey: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Modelo principal" hint="Vacío: el del proveedor.">
                  <input
                    className={inputClass}
                    value={draft.model}
                    onChange={(e) => update({ model: e.target.value })}
                  />
                </Field>
                <Field label="Modelo rápido" hint="Para tareas cortas.">
                  <input
                    className={inputClass}
                    value={draft.fastModel}
                    onChange={(e) => update({ fastModel: e.target.value })}
                  />
                </Field>
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <div className="flex items-center justify-between pt-1">
                {editing ? (
                  <Button variant="danger" onClick={() => void remove(editing)}>
                    <span className="flex items-center gap-1.5">
                      <Trash2 size={14} />
                      Borrar
                    </span>
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    Cancelar
                  </Button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-electric-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-electric-400 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-2 text-sm text-ice/60">
              <p>
                <strong className="text-ice">Claude (suscripción)</strong> usa la sesión con la que entraste a{' '}
                <code className="font-mono text-electric-400">claude</code> en esta máquina. No necesita
                configuración.
              </p>
              <p>Para usar otra API, agrega un perfil a la izquierda.</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
