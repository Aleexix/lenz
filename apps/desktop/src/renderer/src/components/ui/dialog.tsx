import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Tailwind width class. */
  width?: string
  /** Element to focus when the dialog opens; defaults to the first field. */
  initialFocus?: RefObject<HTMLElement | null>
}

/** Lenz-styled modal on Radix Dialog (focus trap, Escape, screen-reader labels). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 'max-w-lg',
  initialFocus,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-navy-950/70 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            if (!initialFocus?.current) return
            event.preventDefault()
            initialFocus.current.focus()
          }}
          className={`fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] ${width} -translate-x-1/2 -translate-y-1/2 rounded-xl border border-navy-700 bg-navy-900 p-5 text-ice shadow-2xl shadow-black/40 outline-none`}
        >
          <div className="mb-4 pr-8">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-ice/55">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
          </div>
          {children}
          <DialogPrimitive.Close
            className="absolute top-4 right-4 rounded p-1 text-ice/50 outline-none hover:bg-navy-800 hover:text-ice focus-visible:ring-2 focus-visible:ring-electric-600"
            aria-label="Cerrar"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ice/80">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ice/45">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-ice placeholder:text-ice/30 outline-none focus:border-electric-600 focus:ring-2 focus:ring-electric-600/30'

export function Button({
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary:
      'bg-electric-600 text-white hover:bg-electric-400 disabled:opacity-50 disabled:hover:bg-electric-600',
    ghost: 'text-ice/70 hover:bg-navy-800 hover:text-ice',
    danger: 'text-red-300 hover:bg-red-500/10',
  }[variant]
  return (
    <button
      type="button"
      {...props}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${styles} ${props.className ?? ''}`}
    />
  )
}
