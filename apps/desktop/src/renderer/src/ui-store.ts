import { create } from 'zustand'

export type OpenDialog = 'newAgent' | 'providers' | null

interface UiState {
  dialog: OpenDialog
  openDialog(dialog: OpenDialog): void
}

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
}))
