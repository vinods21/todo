// SCRUM-8-AC-01, AC-02 (design §4.1, §4.2): next release version.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { highestRelease, nextVersion, VersionError } from '../lib/semver.mjs'

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

for (const bump of ['patch', 'minor', 'major']) {
  test(`SCRUM-8-AC-02: no release tag → 0.1.0 for bump=${bump}`, () => {
    assert.equal(nextVersion([], { bump }), '0.1.0')
    assert.equal(nextVersion(['foo', 'v1.0.0-rc.1'], { bump }), '0.1.0')
  })
}

test('SCRUM-8-AC-02: v0.1.0 + patch/minor/major → 0.1.1 / 0.2.0 / 1.0.0', () => {
  assert.equal(nextVersion(['v0.1.0'], { bump: 'patch' }), '0.1.1')
  assert.equal(nextVersion(['v0.1.0'], { bump: 'minor' }), '0.2.0')
  assert.equal(nextVersion(['v0.1.0'], { bump: 'major' }), '1.0.0')
})

test('SCRUM-8-AC-02: default bump is patch', () => {
  assert.equal(nextVersion(['v1.2.3']), '1.2.4')
  assert.equal(nextVersion(['v1.2.3'], {}), '1.2.4')
})

test('SCRUM-8-AC-02: highest tag by SemVer precedence, not lexical order (v0.10.0 > v0.9.0)', () => {
  assert.deepEqual(highestRelease(['v0.9.0', 'v0.10.0', 'v0.2.0']), { tag: 'v0.10.0', version: '0.10.0' })
  assert.equal(nextVersion(['v0.9.0', 'v0.10.0'], { bump: 'patch' }), '0.10.1')
  assert.equal(nextVersion(['v1.9.9', 'v1.10.0', 'v1.2.30'], { bump: 'minor' }), '1.11.0')
})

test('SCRUM-8-AC-02: non-release tags are ignored (v1.0.0-rc.1, foo, 1.0.0, v01.0.0, v1.0)', () => {
  const tags = ['v0.1.0', 'v1.0.0-rc.1', 'foo', '1.0.0', 'v01.0.0', 'v1.0', 'v2.0.0+build', 'release-3.0.0']
  assert.deepEqual(highestRelease(tags), { tag: 'v0.1.0', version: '0.1.0' })
  assert.equal(nextVersion(tags, { bump: 'patch' }), '0.1.1')
})

test('SCRUM-8-AC-02: explicit version greater than the highest release is accepted', () => {
  assert.equal(nextVersion(['v0.1.0'], { explicit: '1.0.0' }), '1.0.0')
  assert.equal(nextVersion(['v0.1.0'], { explicit: '0.1.1', bump: 'major' }), '0.1.1')
})

test('SCRUM-8-AC-02: explicit version honoured when no release tag exists', () => {
  assert.equal(nextVersion([], { explicit: '2.3.4' }), '2.3.4')
  assert.equal(nextVersion([], { explicit: '0.0.1' }), '0.0.1')
})

test('SCRUM-8-AC-02: explicit version lower than or equal to the highest release is rejected with a message', () => {
  assert.throws(() => nextVersion(['v1.2.0'], { explicit: '1.1.9' }), (e) => e instanceof VersionError && /strictly greater/.test(e.message) && /v1\.2\.0/.test(e.message))
  assert.throws(() => nextVersion(['v1.2.0'], { explicit: '1.2.0' }), /strictly greater/)
})

for (const bad of ['1.2', 'v1.2.3', '1.02.0', '01.2.3', '1.2.3-rc.1', '1.2.3+b', ' 1.2.3', '1.2.3 ', 'latest']) {
  test(`SCRUM-8-AC-01, SCRUM-8-AC-02: invalid explicit version ${JSON.stringify(bad)} is rejected`, () => {
    assert.throws(() => nextVersion(['v0.1.0'], { explicit: bad }), (e) => e instanceof VersionError && e.message.includes(JSON.stringify(bad)))
    assert.throws(() => nextVersion([], { explicit: bad }), VersionError)
  })
}

test('SCRUM-8-AC-02: invalid bump type is rejected', () => {
  assert.throws(() => nextVersion(['v0.1.0'], { bump: 'huge' }), (e) => e instanceof VersionError && /major\|minor\|patch/.test(e.message))
  assert.throws(() => nextVersion([], { bump: 'PATCH' }), VersionError)
})

test('SCRUM-8-AC-02, SCRUM-8-NFR-08: shuffled tag order yields the same result', () => {
  const tags = ['v0.1.0', 'v0.10.0', 'v0.9.3', 'v0.2.0', 'foo', 'v1.0.0-rc.1']
  const expected = nextVersion(tags, { bump: 'minor' })
  for (let i = 0; i < 20; i += 1) {
    const shuffled = [...tags].sort(() => Math.random() - 0.5)
    assert.equal(nextVersion(shuffled, { bump: 'minor' }), expected)
  }
  assert.equal(expected, '0.11.0')
})

test('SCRUM-8-AC-01: every computed release version is plain MAJOR.MINOR.PATCH SemVer', () => {
  for (const v of [nextVersion([]), nextVersion(['v9.99.999'], { bump: 'patch' }), nextVersion(['v9.99.999'], { bump: 'major' })]) {
    assert.match(v, SEMVER_RE)
    assert.match(v, /^\d+\.\d+\.\d+$/)
  }
})
