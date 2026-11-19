// Small helpers for GitHub Actions files ($GITHUB_OUTPUT, $GITHUB_STEP_SUMMARY) and CLI flags.
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/** Appends key=value (multiline-safe heredoc delimiter) to a GITHUB_OUTPUT-style file; no-op without a file. */
export function appendOutput(file, key, value) {
  if (!file) return
  const text = String(value ?? '')
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) throw new Error(`invalid output key ${key}`)
  if (text.includes('\n')) {
    const delimiter = `EOF_${randomUUID()}`
    appendFileSync(file, `${key}<<${delimiter}\n${text}\n${delimiter}\n`)
  } else {
    appendFileSync(file, `${key}=${text}\n`)
  }
}

export function appendSummary(file, markdown) {
  if (!file) return
  appendFileSync(file, markdown.endsWith('\n') ? markdown : `${markdown}\n`)
}

/**
 * Minimal flag parser: --name value, --name=value, repeated flags collected when listed in `multi`; bare flags
 * listed in `booleans` are true. Positional arguments are returned in `_`.
 */
export function parseArgs(argv, { multi = [], booleans = [] } = {}) {
  const out = { _: [] }
  for (const name of multi) out[name] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      out._.push(arg)
      continue
    }
    let name = arg.slice(2)
    let value
    const eq = name.indexOf('=')
    if (eq >= 0) {
      value = name.slice(eq + 1)
      name = name.slice(0, eq)
    } else if (booleans.includes(name)) {
      value = true
    } else {
      value = argv[i + 1]
      i += 1
      if (value === undefined) throw new Error(`flag --${name} needs a value`)
    }
    if (multi.includes(name)) out[name].push(value)
    else out[name] = value
  }
  return out
}

/** Markdown table cell: no pipes or newlines from untrusted text. */
export function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
}
