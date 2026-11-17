/** SCRUM-1-AC-09: loading indicator announced to assistive tech. */
export function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="loading">
      {label}
    </p>
  )
}
