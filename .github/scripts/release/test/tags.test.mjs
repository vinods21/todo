// SCRUM-8-AC-13 (design §4.5): image tag plan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageTags, VersionError } from '../lib/semver.mjs'

const sha = 'a1b2c3d' + 'e'.repeat(33)

test("SCRUM-8-AC-13: imageTags('1.2.0', sha) → immutable 1.2.0-a1b2c3d, 1.2.0 first, then moving 1.2, latest", () => {
  const t = imageTags('1.2.0', sha)
  assert.deepEqual(t.immutable, ['1.2.0-a1b2c3d', '1.2.0'])
  assert.deepEqual(t.moving, ['1.2', 'latest'])
  assert.deepEqual([...t.immutable, ...t.moving], ['1.2.0-a1b2c3d', '1.2.0', '1.2', 'latest'])
})

test('SCRUM-8-AC-13 (Q-07): the alias tag uses the same g-prefix rule', () => {
  assert.deepEqual(imageTags('0.1.0', '0123456' + 'a'.repeat(33)).immutable, ['0.1.0-g0123456', '0.1.0'])
})

test('SCRUM-8-AC-13: an invalid release version is rejected', () => {
  assert.throws(() => imageTags('1.2', sha), VersionError)
  assert.throws(() => imageTags('1.2.0-a1b2c3d', sha), VersionError)
})
