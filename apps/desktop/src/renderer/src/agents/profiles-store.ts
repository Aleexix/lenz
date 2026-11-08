import { create } from 'zustand'
import type { ProviderProfile } from '../../../shared/profiles'

interface ProfilesState {
  profiles: ProviderProfile[]
  /** Profile picked last time, preselected in "Nuevo agente". */
  lastUsedId: string | null
  refresh(): Promise<void>
  setLastUsed(id: string): void
}

const LAST_USED_KEY = 'lenz.lastProfile'

export const useProfiles = create<ProfilesState>()((set) => ({
  profiles: [],
  lastUsedId: localStorage.getItem(LAST_USED_KEY),
  refresh: async () => set({ profiles: await window.lenz.profiles.list() }),
  setLastUsed: (id) => {
    localStorage.setItem(LAST_USED_KEY, id)
    set({ lastUsedId: id })
  },
}))
