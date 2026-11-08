import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { safeStorage } from 'electron'
import { BUILTIN_CLAUDE_PROFILE_ID, type ProfileInput, type ProviderProfile } from '../shared/profiles'

type StoredProfile = Omit<ProviderProfile, 'hasApiKey' | 'builtin'>

const BUILTIN: StoredProfile = {
  id: BUILTIN_CLAUDE_PROFILE_ID,
  name: 'Claude (suscripción)',
  kind: 'claude-subscription',
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(data, null, 2))
  renameSync(temp, file)
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * profiles.json holds the profiles; secrets.json holds API keys encrypted
 * with the OS keychain (DPAPI on Windows, Keychain on macOS) via safeStorage.
 */
export class ProfileStore {
  private readonly profilesFile: string
  private readonly secretsFile: string

  constructor(home: string) {
    this.profilesFile = join(home, 'profiles.json')
    this.secretsFile = join(home, 'secrets.json')
  }

  list(): ProviderProfile[] {
    const secrets = this.secrets()
    return [BUILTIN, ...this.custom()].map((profile) => ({
      ...profile,
      hasApiKey: profile.id in secrets,
      ...(profile.id === BUILTIN_CLAUDE_PROFILE_ID ? { builtin: true } : {}),
    }))
  }

  get(id: string): ProviderProfile | undefined {
    return this.list().find((profile) => profile.id === id)
  }

  save(input: ProfileInput): ProviderProfile {
    if (input.id === BUILTIN_CLAUDE_PROFILE_ID) throw new Error('El perfil de suscripción no se puede editar')
    const name = clean(input.name)
    if (!name) throw new Error('El perfil necesita un nombre')
    const baseUrl = clean(input.baseUrl)
    if (input.kind === 'anthropic-compatible' && !baseUrl?.match(/^https?:\/\//)) {
      throw new Error('La URL base debe empezar por http:// o https://')
    }

    const profiles = this.custom()
    const id = input.id ?? `prof_${randomUUID().slice(0, 8)}`
    const profile: StoredProfile = {
      id,
      name,
      kind: input.kind,
      ...(baseUrl ? { baseUrl } : {}),
      ...(clean(input.model) ? { model: clean(input.model) } : {}),
      ...(clean(input.fastModel) ? { fastModel: clean(input.fastModel) } : {}),
    }
    const index = profiles.findIndex((existing) => existing.id === id)
    if (index >= 0) profiles[index] = profile
    else profiles.push(profile)

    const apiKey = input.apiKey?.trim()
    if (apiKey) this.setSecret(id, apiKey)
    writeJson(this.profilesFile, profiles)

    const saved = this.get(id)
    if (!saved) throw new Error('No se pudo guardar el perfil')
    return saved
  }

  delete(id: string): void {
    if (id === BUILTIN_CLAUDE_PROFILE_ID) return
    writeJson(
      this.profilesFile,
      this.custom().filter((profile) => profile.id !== id),
    )
    const secrets = this.secrets()
    delete secrets[id]
    writeJson(this.secretsFile, secrets)
  }

  /** Decrypted key for launching an agent. Main process only. */
  apiKey(id: string): string | undefined {
    const encrypted = this.secrets()[id]
    if (!encrypted) return undefined
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }

  private custom(): StoredProfile[] {
    const stored = readJson<StoredProfile[]>(this.profilesFile, [])
    return Array.isArray(stored) ? stored.filter((profile) => profile.id !== BUILTIN_CLAUDE_PROFILE_ID) : []
  }

  private secrets(): Record<string, string> {
    return readJson<Record<string, string>>(this.secretsFile, {})
  }

  private setSecret(id: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('El sistema no ofrece almacenamiento cifrado; no se guardó la API key')
    }
    const secrets = this.secrets()
    secrets[id] = safeStorage.encryptString(value).toString('base64')
    writeJson(this.secretsFile, secrets)
  }
}
