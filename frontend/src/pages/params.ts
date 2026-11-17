import { isTaskStatus, type TaskStatus } from '../api/types'

// URL parameter helpers for the pages (SCRUM-1-AC-02, AC-11, AC-12; SCRUM-6-AC-13, AC-15).

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

/** SCRUM-6-AC-13: list URL state. */
export interface ListParams {
  /** 1-based, as in the URL. */
  page: number
  status?: TaskStatus
}

/** SCRUM-6-AC-13: exact, case-sensitive enum name; anything else (incl. null/'') → undefined = "All". */
export function parseStatusParam(raw: string | null): TaskStatus | undefined {
  return raw !== null && isTaskStatus(raw) ? raw : undefined
}

/** SCRUM-6-AC-13: page and status from the list URL; invalid values fall back to page 1 / All. */
export function parseListParams(searchParams: URLSearchParams): ListParams {
  const page = parsePageParam(searchParams.get('page'))
  const status = parseStatusParam(searchParams.get('status'))
  return status === undefined ? { page } : { page, status }
}

/** SCRUM-6-AC-13: status first, page only when > 1 — `{ page: 2, status: 'DONE' }` → `status=DONE&page=2`. */
export function listSearchParams({ page, status }: ListParams): URLSearchParams {
  const params = new URLSearchParams()
  if (status !== undefined) params.set('status', status)
  if (page > 1) params.set('page', String(page))
  return params
}

/** SCRUM-6-AC-13, AC-15: list path for links and `returnTo` — `/`, `/?page=2`, `/?status=DONE&page=2`. */
export function listPath(params: ListParams): string {
  const query = listSearchParams(params).toString()
  return query === '' ? '/' : `/?${query}`
}
