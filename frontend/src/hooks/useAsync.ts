import { useCallback, useEffect, useState } from 'react'
import { isAbortError } from '../api/client'
import { ApiError, GENERIC_ERROR_MESSAGE, isApiError } from '../api/errors'

// SCRUM-1-AC-09, AC-10: load-on-mount hook with abort on unmount/change and a user-triggered reload (Retry).

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError }

type Settled<T> = Exclude<AsyncState<T>, { status: 'loading' }>

export type AsyncResult<T> = AsyncState<T> & { reload: () => void }

/**
 * Runs `fn` on mount and whenever its identity changes (callers memoise it with `useCallback`, so the
 * hook's dependencies are the callback's dependencies) or `reload()` is called. Any in-flight run is aborted
 * first, so a stale response never overwrites a newer one. The state is "loading" until the current run settles.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>): AsyncResult<T> {
  const [nonce, setNonce] = useState(0)
  const [settled, setSettled] = useState<{ fn: typeof fn; nonce: number; state: Settled<T> } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fn(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ fn, nonce, state: { status: 'success', data } })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        const apiError = isApiError(error) ? error : new ApiError('server', 0, GENERIC_ERROR_MESSAGE)
        setSettled({ fn, nonce, state: { status: 'error', error: apiError } })
      },
    )
    return () => controller.abort()
  }, [fn, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const state: AsyncState<T> =
    settled !== null && settled.fn === fn && settled.nonce === nonce ? settled.state : { status: 'loading' }
  return { ...state, reload }
}
