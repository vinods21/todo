// SCRUM-1-AC-13: the backend base URL comes from VITE_API_BASE_URL (inlined by Vite at dev-start/build time).

export const DEFAULT_API_BASE_URL = 'http://localhost:8080'

export function resolveApiBaseUrl(raw: string | undefined): string {
  const value = raw?.trim()
  return (value ? value : DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
