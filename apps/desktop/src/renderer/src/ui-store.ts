import { create } from 'zustand'

export type OpenDialog = 'newAgent' | 'settings' | null
export type SettingsSection = 'providers' | 'shortcuts' | 'about'

interface UiState {
  dialog: OpenDialog
  settingsSection: SettingsSection
  openDialog(dialog: OpenDialog): void
  openSettings(section?: SettingsSection): void
}

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  settingsSection: 'providers',
  openDialog: (dialog) => set({ dialog }),
  openSettings: (section) =>
    set((state) => ({ dialog: 'settings', settingsSection: section ?? state.settingsSection })),
}))
