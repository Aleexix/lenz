import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

function findOnPath(executable: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, executable)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** PowerShell 7 if installed, else Windows PowerShell; the user's login shell elsewhere. */
export function defaultShell(): string[] {
  if (process.platform === 'win32') {
    return [findOnPath('pwsh.exe') ?? 'powershell.exe', '-NoLogo']
  }
  return [process.env.SHELL || '/bin/zsh', '-l']
}
