// SCRUM-8-AC-03 (design §4.3, Q-07): build versions X.Y.Z-<id> for non-release builds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVersion, shaId, VersionError } from '../lib/semver.mjs'

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const DOCKER_TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/
const sha = (prefix) => prefix + 'f'.repeat(40 - prefix.length)

test('SCRUM-8-AC-03: after v1.2.0, commit a1b2c3d… → 1.2.1-a1b2c3d', () => {
  assert.equal(buildVersion(['v1.2.0'], sha('a1b2c3d')), '1.2.1-a1b2c3d')
})

test('SCRUM-8-AC-03: no release tag → 0.1.0-<sha7>', () => {
  assert.equal(buildVersion([], sha('abc1234')), '0.1.0-abc1234')
  assert.equal(buildVersion(['foo', 'v1.0.0-rc.1'], sha('abc1234')), '0.1.0-abc1234')
})

test('SCRUM-8-AC-03: highest release by SemVer precedence is the base', () => {
  assert.equal(buildVersion(['v0.9.0', 'v0.10.0'], sha('abc1234')), '0.10.1-abc1234')
})

test('SCRUM-8-AC-03: upper-case SHA is lower-cased', () => {
  assert.equal(buildVersion(['v1.2.0'], sha('A1B2C3D').toUpperCase()), '1.2.1-a1b2c3d')
})

test('SCRUM-8-AC-03 (Q-07): all-digit sha7 with a leading zero gets the g prefix (0123456… → 1.2.1-g0123456)', () => {
  assert.equal(buildVersion(['v1.2.0'], sha('0123456')), '1.2.1-g0123456')
})

test('SCRUM-8-AC-03 (Q-07): all-digit sha7 without a leading zero stays unprefixed (1234567…)', () => {
  assert.equal(buildVersion(['v1.2.0'], sha('1234567')), '1.2.1-1234567')
})

test('SCRUM-8-AC-03 (Q-07): leading zero followed by a letter stays unprefixed (0a12345…)', () => {
  assert.equal(buildVersion(['v1.2.0'], sha('0a12345')), '1.2.1-0a12345')
})

test('SCRUM-8-AC-03 (Q-07): 0000000… → g0000000', () => {
  assert.equal(shaId(sha('0000000')), 'g0000000')
  assert.equal(buildVersion([], sha('0000000')), '0.1.0-g0000000')
})

test('SCRUM-8-AC-03: invalid SHA is rejected', () => {
  for (const bad of ['abc1234', '', undefined, 'z'.repeat(40), `${'a'.repeat(39)} `]) {
    assert.throws(() => buildVersion(['v1.2.0'], bad), VersionError)
  }
})

test('SCRUM-8-AC-03: every build version is valid SemVer 2.0.0 and a valid Docker tag', () => {
  const prefixes = ['a1b2c3d', '0123456', '1234567', '0a12345', '0000000', '9999999', 'deadbee', '00000a0']
  for (const tags of [[], ['v0.1.0'], ['v12.34.56']]) {
    for (const p of prefixes) {
      const v = buildVersion(tags, sha(p))
      assert.match(v, SEMVER_RE, v)
      assert.match(v, DOCKER_TAG_RE, v)
    }
  }
})
