import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { resetForbidden } from '../auth/session'
import { installFakeTokenSource } from './auth'
import { resetStore } from './handlers'
import { server } from './server'

// ADR 0007: a request without a handler must fail the test (proves "no request sent").
// MSW 3's onUnhandledFrame: 'error' logs and makes fetch reject, which the app would render as a network
// error; recording unhandled requests and failing in afterEach makes the test itself fail.
const unhandled: string[] = []

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
  server.events.on('request:unhandled', ({ request }) => {
    unhandled.push(`${request.method} ${request.url}`)
  })
})

// SCRUM-13-AC-17: every test starts authenticated (fake token source, token test-access-token).
beforeEach(() => {
  installFakeTokenSource()
  resetForbidden()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetStore()
  const stray = unhandled.splice(0)
  if (stray.length > 0) throw new Error(`Unhandled request(s) in test: ${stray.join(', ')}`)
})

afterAll(() => server.close())
