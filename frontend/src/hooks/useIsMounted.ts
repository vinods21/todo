import { useCallback, useEffect, useRef } from 'react'

/**
 * SCRUM-1-AC-04, AC-06: lets a page skip work after an awaited mutation (e.g. navigating back to the list) when the
 * user has already left the page while the request was in flight.
 */
export function useIsMounted(): () => boolean {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return useCallback(() => mounted.current, [])
}
