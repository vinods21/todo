// SCRUM-8-AC-17, NFR-11 (design §7.3): SBOM post-processing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { countComponents, finalizeSbom, kindFromFileName, SbomError } from '../lib/sbom.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const npm = () => JSON.parse(readFileSync(join(here, 'fixtures', 'sbom-npm.json'), 'utf8'))
const SHA = 'f'.repeat(40)
const opts = { kind: 'frontend-app', version: '0.1.0-abc1234', sha: SHA, jira: 'SCRUM-8', workspace: '/home/runner/work/todo/todo' }
const prop = (doc, name) => doc.metadata.component.properties.find((p) => p.name === name)?.value

test('SCRUM-8-AC-17: sets the root component name, version, VCS reference and commit/jira/version properties', () => {
  const { doc, count } = finalizeSbom(npm(), { ...opts, minimum: 3 })
  assert.equal(doc.metadata.component.name, 'todo-frontend')
  assert.equal(doc.metadata.component.version, '0.1.0-abc1234')
  assert.equal(prop(doc, 'com.vinods21.todo:commit'), SHA)
  assert.equal(prop(doc, 'com.vinods21.todo:jira'), 'SCRUM-8')
  assert.equal(prop(doc, 'com.vinods21.todo:version'), '0.1.0-abc1234')
  assert.deepEqual(doc.metadata.component.externalReferences, [{ type: 'vcs', url: 'https://github.com/vinods21/todo' }])
  assert.equal(count, 4)
})

test('SCRUM-8-AC-17: image SBOMs get the GHCR name and the digest property', () => {
  const d = npm()
  d.metadata.component = { type: 'container', name: 'images/todo-backend.oci.tar', group: 'x' }
  const { doc } = finalizeSbom(d, { ...opts, kind: 'frontend-image', minimum: 1, digest: 'sha256:' + '1'.repeat(64) })
  assert.equal(doc.metadata.component.name, 'ghcr.io/vinods21/todo-frontend')
  assert.equal(doc.metadata.component.type, 'container')
  assert.equal(doc.metadata.component.group, undefined)
  assert.equal(prop(doc, 'com.vinods21.todo:image-digest'), 'sha256:' + '1'.repeat(64))
})

test('SCRUM-8-NFR-11: strips absolute runner and workspace paths', () => {
  const { doc } = finalizeSbom(npm(), { ...opts, minimum: 3 })
  const text = JSON.stringify(doc)
  assert.doesNotMatch(text, /\/home\/runner/)
  assert.equal(prop(doc, 'cdx:npm:package:path'), 'frontend')
  assert.equal(doc.components[2].evidence.occurrences[0].location, 'node_modules/react-router')
})

test('SCRUM-8-AC-17: below the minimum component count → throws (silently broken generator fails)', () => {
  assert.throws(() => finalizeSbom(npm(), { ...opts, kind: 'backend-app' }), (e) => e instanceof SbomError && /minimum 74/.test(e.message))
  const empty = { ...npm(), components: [] }
  assert.throws(() => finalizeSbom(empty, opts), SbomError)
  const few = { ...npm(), components: npm().components.slice(0, 1) }
  assert.throws(() => finalizeSbom(few, opts), (e) => /only 1 components \(minimum 7\)/.test(e.message))
})

test('SCRUM-8-AC-17: keeps serialNumber and specVersion; rejects non-CycloneDX input', () => {
  const { doc } = finalizeSbom(npm(), { ...opts, minimum: 3 })
  assert.equal(doc.serialNumber, 'urn:uuid:00000000-0000-4000-8000-000000000001')
  assert.equal(doc.specVersion, '1.6')
  assert.throws(() => finalizeSbom({ spdxVersion: 'SPDX-2.3' }, opts), SbomError)
})

test('SCRUM-8-AC-17: idempotent — finalizing twice does not duplicate properties or references', () => {
  const once = finalizeSbom(npm(), { ...opts, minimum: 3 }).doc
  const twice = finalizeSbom(once, { ...opts, minimum: 3 }).doc
  assert.deepEqual(twice.metadata.component, once.metadata.component)
})

test('SCRUM-8-AC-17: kind from file name; nested components are counted', () => {
  assert.equal(kindFromFileName('sbom/todo-backend-0.1.0.cdx.json'), 'backend-app')
  assert.equal(kindFromFileName('todo-frontend-0.1.0-abc1234.cdx.json'), 'frontend-app')
  assert.equal(kindFromFileName('todo-backend-image-0.1.0.cdx.json'), 'backend-image')
  assert.equal(kindFromFileName('todo-frontend-image-0.1.0.cdx.json'), 'frontend-image')
  assert.equal(kindFromFileName('todo-backend-all-scopes-0.1.0.cdx.json'), null)
  assert.equal(kindFromFileName('other.json'), null)
  assert.equal(countComponents({ components: [{ components: [{}, {}] }, {}] }), 4)
})
