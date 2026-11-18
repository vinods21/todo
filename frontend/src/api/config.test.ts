import { API_BASE_URL, DEFAULT_API_BASE_URL, resolveApiBaseUrl } from './config'

describe('SCRUM-1 API configuration', () => {
  it('SCRUM-1-AC-13: defaults to http://localhost:8080 when VITE_API_BASE_URL is not set', () => {
    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:8080')
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:8080')
    // Tests run without VITE_API_BASE_URL, so the app uses the default.
    expect(API_BASE_URL).toBe('http://localhost:8080')
  })

  it('SCRUM-1-AC-13: uses VITE_API_BASE_URL when set', () => {
    expect(resolveApiBaseUrl('https://api.example.test:8443')).toBe('https://api.example.test:8443')
  })

  it('SCRUM-1-AC-13: trims whitespace and trailing slashes; blank falls back to the default', () => {
    expect(resolveApiBaseUrl('  http://host:8081//  ')).toBe('http://host:8081')
    expect(resolveApiBaseUrl('   ')).toBe('http://localhost:8080')
    expect(resolveApiBaseUrl('')).toBe('http://localhost:8080')
  })
})

describe('SCRUM-7 same-origin API base', () => {
  it("SCRUM-7-AC-17: '/' (only slashes, optionally padded) means same-origin and resolves to ''", () => {
    expect(resolveApiBaseUrl('/')).toBe('')
    expect(resolveApiBaseUrl('//')).toBe('')
    expect(resolveApiBaseUrl(' / ')).toBe('')
  })

  it('SCRUM-7-AC-17: blank/unset still default to http://localhost:8080; absolute URLs and trailing slashes unchanged', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:8080')
    expect(resolveApiBaseUrl('  ')).toBe('http://localhost:8080')
    expect(resolveApiBaseUrl('https://api.example.test/')).toBe('https://api.example.test')
    expect(resolveApiBaseUrl('http://host:8081')).toBe('http://host:8081')
  })
})
