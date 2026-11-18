// SCRUM-8-AC-17, NFR-11 (design §7.3): SBOM post-processing — root component, traceability properties, no runner paths.
export const MIN_COMPONENTS = Object.freeze({
  'backend-app': 40,
  'frontend-app': 3,
  'backend-image': 40,
  'frontend-image': 15,
})
export const ROOT_NAMES = Object.freeze({
  'backend-app': 'todo-backend',
  'frontend-app': 'todo-frontend',
  'backend-image': 'ghcr.io/vinods21/todo-backend',
  'frontend-image': 'ghcr.io/vinods21/todo-frontend',
})
export const VCS_URL = 'https://github.com/vinods21/todo'
const PROP = 'com.vinods21.todo'

/** File name → kind: todo-backend-<v>.cdx.json | todo-frontend-<v>.cdx.json | todo-<x>-image-<v>.cdx.json. */
export function kindFromFileName(file) {
  const base = file.split('/').pop()
  if (/^todo-backend-image-.+\.cdx\.json$/.test(base)) return 'backend-image'
  if (/^todo-frontend-image-.+\.cdx\.json$/.test(base)) return 'frontend-image'
  if (/^todo-backend-all-scopes-.+\.cdx\.json$/.test(base)) return null // reported scan input, not a release SBOM
  if (/^todo-backend-.+\.cdx\.json$/.test(base)) return 'backend-app'
  if (/^todo-frontend-.+\.cdx\.json$/.test(base)) return 'frontend-app'
  return null
}

export function countComponents(doc) {
  let n = 0
  const walk = (list) => {
    for (const c of list ?? []) {
      n += 1
      walk(c.components)
    }
  }
  walk(doc.components)
  return n
}

/** Replaces absolute runner/workspace paths in every string value (NFR-11). */
export function stripPaths(value, workspace) {
  const ws = workspace ? workspace.replace(/\/+$/, '') : null
  const fix = (s) => {
    let out = s
    if (ws && out.includes(`${ws}/`)) out = out.split(`${ws}/`).join('')
    if (ws && out === ws) out = '.'
    out = out.replace(/\/home\/runner\/work\/[^/\s]+\/[^/\s]+\//g, '')
    out = out.replace(/\/home\/runner\/[^\s"]*\/([^/\s"]+)/g, 'runner:$1')
    return out
  }
  const walk = (v) => {
    if (typeof v === 'string') return fix(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value)
}

export class SbomError extends Error {}

/**
 * @param {object} doc parsed CycloneDX JSON
 * @param {{kind, version, sha, jira, digest?, workspace?, minimum?}} o
 */
export function finalizeSbom(doc, o) {
  if (!doc || doc.bomFormat !== 'CycloneDX') throw new SbomError(`${o.kind}: not a CycloneDX document`)
  const minimum = o.minimum ?? MIN_COMPONENTS[o.kind]
  if (minimum === undefined) throw new SbomError(`unknown SBOM kind ${o.kind}`)
  const out = stripPaths(doc, o.workspace)
  out.metadata = out.metadata ?? {}
  const root = { ...(out.metadata.component ?? { type: o.kind.endsWith('image') ? 'container' : 'application' }) }
  root.name = ROOT_NAMES[o.kind]
  root.version = o.version
  if (o.kind.endsWith('image')) delete root.group
  const refs = Array.isArray(root.externalReferences) ? [...root.externalReferences] : []
  if (!refs.some((r) => r.type === 'vcs')) refs.push({ type: 'vcs', url: VCS_URL })
  root.externalReferences = refs
  const props = (Array.isArray(root.properties) ? root.properties : []).filter((p) => !String(p.name).startsWith(`${PROP}:`))
  props.push({ name: `${PROP}:commit`, value: o.sha }, { name: `${PROP}:jira`, value: o.jira }, { name: `${PROP}:version`, value: o.version })
  if (o.digest) props.push({ name: `${PROP}:image-digest`, value: o.digest })
  root.properties = props
  out.metadata.component = root
  const count = countComponents(out)
  if (count < minimum) {
    throw new SbomError(`${o.kind}: only ${count} components (minimum ${minimum}) — SBOM generator broken?`)
  }
  return { doc: out, count }
}
