interface PagerProps {
  /** 0-based page from the API. */
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

/** SCRUM-1-AC-02: hidden when there is at most one page; Previous/Next disabled at the bounds. */
export function Pager({ page, totalPages, onPageChange }: PagerProps) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label="Pagination" className="pager">
      <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span aria-live="polite">
        Page {page + 1} of {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  )
}
