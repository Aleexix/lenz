import { GitBranchPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RepoInfo } from '../../../shared/git'
import { useProfiles } from '../agents/profiles-store'
import { Button, Dialog, Field, inputClass } from '../components/ui/dialog'
import { useUi } from '../ui-store'
import { useWorkspace } from '../workspace/workspace-store'

type RepoState =
  | { status: 'loading' }
  | { status: 'ready'; info: RepoInfo }
  | { status: 'error'; message: string }

export function NewTaskDialog() {
  const open = useUi((state) => state.dialog === 'newTask')
  const projectId = useUi((state) => state.taskProjectId)
  const { openDialog, openSettings } = useUi.getState()
  const project = useWorkspace((state) => state.workspace.projects.find((p) => p.id === projectId) ?? null)
  const { profiles, lastUsedId, refresh: refreshProfiles, setLastUsed } = useProfiles()

  const [repo, setRepo] = useState<RepoState>({ status: 'loading' })
  const [name, setName] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [withAgent, setWithAgent] = useState(true)
  const [profileId, setProfileId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !project) return
    setName('')
    setPrompt('')
    setError(null)
    setBusy(false)
    setRepo({ status: 'loading' })
    void refreshProfiles()
    window.lenz.git
      .repoInfo(project.path)
      .then((info) => {
        if (!info) {
          setRepo({
            status: 'error',
            message: `${project.name} no es un repositorio git. Las tareas necesitan git.`,
          })
        } else if (!info.hasCommits) {
          setRepo({
            status: 'error',
            message: 'El repositorio aún no tiene commits. Haz el primero para crear tareas.',
          })
        } else {
          setRepo({ status: 'ready', info })
          setBaseBranch(info.currentBranch ?? info.branches[0] ?? '')
        }
      })
      .catch((cause: Error) => setRepo({ status: 'error', message: cause.message }))
  }, [open, project, refreshProfiles])

  useEffect(() => {
    if (profiles.length === 0) return
    setProfileId((current) =>
      profiles.some((p) => p.id === current)
        ? current
        : (profiles.find((p) => p.id === lastUsedId)?.id ?? profiles[0]?.id ?? ''),
    )
  }, [profiles, lastUsedId])

  const profile = profiles.find((candidate) => candidate.id === profileId)
  const missingKey = withAgent && profile?.kind === 'anthropic-compatible' && !profile.hasApiKey
  const canCreate =
    repo.status === 'ready' &&
    name.trim() !== '' &&
    baseBranch !== '' &&
    !busy &&
    (!withAgent || (profile && !missingKey))

  async function create() {
    if (!canCreate || !project) return
    setBusy(true)
    setError(null)
    try {
      const taskName = name.trim()
      const created = await window.lenz.git.createTask({ repoPath: project.path, name: taskName, baseBranch })
      if (withAgent && profile) setLastUsed(profile.id)
      useWorkspace.getState().addTaskSpace(project.id, {
        name: taskName,
        path: created.path,
        branch: created.branch,
        baseBranch,
        ...(withAgent && profile
          ? {
              agent: {
                name: taskName,
                profileId: profile.id,
                ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
              },
            }
          : {}),
      })
      openDialog(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'newTask' : null)}
      title="Nueva tarea"
      description={
        project
          ? `Una rama y una carpeta propias en ${project.name}, para trabajar sin tocar la principal.`
          : undefined
      }
      initialFocus={nameRef}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        {repo.status === 'error' ? (
          <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            {repo.message}
          </p>
        ) : null}

        <Field label="Nombre de la tarea" hint="La rama se llamará lenz/<nombre>.">
          <input
            ref={nameRef}
            className={inputClass}
            placeholder="Ej.: arreglar login"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Rama base">
          <select
            className={inputClass}
            value={baseBranch}
            disabled={repo.status !== 'ready'}
            onChange={(event) => setBaseBranch(event.target.value)}
          >
            {repo.status === 'ready'
              ? repo.info.branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))
              : null}
          </select>
        </Field>

        <div className="space-y-3 rounded-lg border border-navy-700 p-3">
          <label className="flex items-center gap-2 text-sm text-ice/85">
            <input
              type="checkbox"
              checked={withAgent}
              onChange={(event) => setWithAgent(event.target.checked)}
              className="accent-electric-600"
            />
            Lanzar un agente en la tarea
          </label>
          {withAgent ? (
            <>
              <Field label="Proveedor">
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
                {missingKey ? (
                  <button
                    type="button"
                    onClick={() => openSettings('providers')}
                    className="block text-left text-xs text-amber-300 underline-offset-2 hover:underline"
                  >
                    Este perfil no tiene API key. Agrégala en Ajustes → Proveedores.
                  </button>
                ) : null}
              </Field>
              <Field label="Qué tiene que hacer" hint="Opcional. Es el primer mensaje del agente.">
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  placeholder="Ej.: El login falla con correos en mayúsculas. Encuentra la causa y arréglalo con un test."
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void create()
                  }}
                />
              </Field>
            </>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => openDialog(null)}>
            Cancelar
          </Button>
          <button
            type="submit"
            disabled={!canCreate}
            className="flex items-center gap-2 rounded-md bg-electric-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-electric-400 disabled:opacity-50 disabled:hover:bg-electric-600"
          >
            <GitBranchPlus size={15} />
            {busy ? 'Creando…' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
