import type { ReactNode } from 'react'

interface ErrorPanelProps {
  message: string
  onRetry?: () => void
  children?: ReactNode
}

/** SCRUM-1-AC-10: user-friendly error with an optional Retry action. */
export function ErrorPanel({ message, onRetry, children }: ErrorPanelProps) {
  return (
    <div role="alert" className="error-panel">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
      {children}
    </div>
  )
}
