import type { DisplayState } from './agent-store'
import { STATE_LABEL } from './agent-store'

const DOT_CLASS: Record<DisplayState, string> = {
  starting: 'bg-ice/30',
  working: 'bg-electric-400 animate-pulse',
  blocked: 'bg-amber-400',
  done: 'bg-emerald-400',
  idle: 'bg-ice/25',
  error: 'bg-red-400',
}

export function StateDot({ state, className = '' }: { state: DisplayState; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATE_LABEL[state]}
      title={STATE_LABEL[state]}
      className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[state]} ${className}`}
    />
  )
}
