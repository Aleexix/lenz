/**
 * Provider profiles: which account or API an agent uses. Claude Code always
 * runs; a profile only changes the environment it starts with.
 */

/** `claude-subscription`: the person's own `claude` login. `anthropic-compatible`: any API that speaks Anthropic's Messages format. */
export type ProfileKind = 'claude-subscription' | 'anthropic-compatible'

export interface ProviderProfile {
  id: string
  name: string
  kind: ProfileKind
  baseUrl?: string
  /** Model for Opus/Sonnet slots; empty keeps Claude Code's default. */
  model?: string
  /** Model for the Haiku slot (quick background work). */
  fastModel?: string
  /** True when an encrypted API key is stored; the key never leaves the main process. */
  hasApiKey: boolean
  builtin?: boolean
}

export interface ProfileInput {
  id?: string
  name: string
  kind: ProfileKind
  baseUrl?: string
  model?: string
  fastModel?: string
  /** New key; undefined keeps the stored one. */
  apiKey?: string
}

export interface ProfilePreset {
  label: string
  name: string
  baseUrl: string
  model: string
  fastModel: string
  help: string
}

export const BUILTIN_CLAUDE_PROFILE_ID = 'claude'

export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    label: 'z.ai (GLM)',
    name: 'z.ai',
    baseUrl: 'https://api.z.ai/api/anthropic',
    model: '',
    fastModel: '',
    help: 'Usa la API key de tu plan de z.ai. Deja los modelos vacíos para que z.ai elija los de GLM.',
  },
  {
    label: 'Personalizado',
    name: '',
    baseUrl: '',
    model: '',
    fastModel: '',
    help: 'Cualquier API compatible con Anthropic (/v1/messages). Para NVIDIA, apunta a un traductor local como LiteLLM.',
  },
]

export interface LaunchAgentRequest {
  profileId: string
  name: string
  cwd: string
  cols: number
  rows: number
  /** First message for the agent. */
  prompt?: string
  /** Resume this Claude Code session instead of starting a new one. */
  resumeSessionId?: string
}
