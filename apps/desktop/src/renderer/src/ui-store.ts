import { create } from 'zustand'

export type OpenDialog = 'newAgent' | 'newTask' | 'settings' | null
export type SettingsSection = 'providers' | 'shortcuts' | 'about'

interface UiState {
  dialog: OpenDialog
  settingsSection: SettingsSection
  /** Project the "Nueva tarea" dialog creates the task in. */
  taskProjectId: string | null
  openDialog(dialog: OpenDialog): void
  openSettings(section?: SettingsSection): void
  openNewTask(projectId: string): void
}

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  settingsSection: 'providers',
  taskProjectId: null,
  openDialog: (dialog) => set({ dialog }),
  openSettings: (section) =>
    set((state) => ({ dialog: 'settings', settingsSection: section ?? state.settingsSection })),
  openNewTask: (projectId) => set({ dialog: 'newTask', taskProjectId: projectId }),
}))
