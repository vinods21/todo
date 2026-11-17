// URL parameter helpers for the pages (SCRUM-1-AC-02, AC-11, AC-12).

/** Largest 1-based page whose 0-based API value still fits the backend's Java `int page` parameter. */
export const MAX_PAGE_PARAM = 2 ** 31

/** `?page=N` is 1-based for humans; missing/invalid/< 1/beyond the backend's int range → 1. */
export function parsePageParam(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 1
  const page = Number(raw)
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_PAGE_PARAM ? page : 1
}

/** Positive safe integer, else undefined (non-numeric id → "Task not found" without a request). */
export function parseTaskId(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return undefined
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : undefined
}

/** Return target from router location state; only same-app paths are accepted. */
export function returnTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'returnTo' in state) {
    const { returnTo } = state
    if (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) return returnTo
  }
  return '/'
}
