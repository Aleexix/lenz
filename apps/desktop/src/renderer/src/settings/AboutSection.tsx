import { useEffect, useState } from 'react'
import type { AppInfo, DaemonStatus } from '../../../shared/app-info'
import lenzMark from '../assets/lenz-mark-white.svg'
import { SectionHeader } from './SectionHeader'

const DAEMON_LABEL: Record<DaemonStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
}

export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null)

  useEffect(() => {
    void window.lenz.getAppInfo().then(setInfo)
    void window.lenz.daemon.status().then(setDaemon)
    return window.lenz.daemon.onStatus(setDaemon)
  }, [])

  const rows: [string, string][] = [
    ['Versión', info ? info.version : '…'],
    ['lenzd', daemon ? DAEMON_LABEL[daemon] : '…'],
    ['Carpeta de datos', info?.dataDir ?? '…'],
  ]

  return (
    <>
      <SectionHeader title="Acerca de Lenz" />
      <div className="mb-5 flex items-center gap-3">
        <img src={lenzMark} alt="" className="h-10 w-auto" draggable={false} />
        <div>
          <p className="font-semibold tracking-tight">Lenz</p>
          <p className="text-sm text-electric-400">El sexto sentido de tu código.</p>
        </div>
      </div>
      <dl className="divide-y divide-navy-800 rounded-lg border border-navy-700">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            <dt className="shrink-0 text-ice/60">{label}</dt>
            <dd className="truncate font-mono text-xs text-ice/85 select-text" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ice/45">Los registros están en la carpeta de datos, dentro de logs/.</p>
    </>
  )
}
