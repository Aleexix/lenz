export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description ? <p className="mt-1 text-sm text-ice/55">{description}</p> : null}
    </div>
  )
}
