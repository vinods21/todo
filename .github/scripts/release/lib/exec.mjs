// Process helpers for the CLIs (never used by the pure libraries). Binaries are injectable for tests.
import { spawnSync } from 'node:child_process'

/** Runs a command without a shell; returns { status, stdout, stderr } (status 127 if the binary is missing). */
export function run(bin, args, { cwd, env } = {}) {
  const r = spawnSync(bin, args, { cwd, env: env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) return { status: 127, stdout: '', stderr: `${bin}: ${r.error.message}` }
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

export function runOk(bin, args, opts) {
  const r = run(bin, args, opts)
  if (r.status !== 0) throw new Error(`${bin} ${args.join(' ')} failed (${r.status}): ${r.stderr.trim()}`)
  return r.stdout
}

export function fail(message, code = 1) {
  console.log(`::error::${message.replace(/\r?\n/g, ' ')}`)
  process.exit(code)
}
