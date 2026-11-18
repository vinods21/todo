# ADR 0008 — Build identity (Jira key) derived from the branch in CI, not hard-coded per story

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6) — SCRUM-6-NFR-07, open question Q-03
- Supersedes in part: [ADR 0004](0004-traceability-conventions.md) — the **Build** and **CI artefacts** bullets
  (hard-coded `jira=SCRUM-<n>` / `X-Jira-Issue` and artifact names). All other ADR 0004 conventions stand.
- **Amended by [ADR 0013](0013-versioning-and-release-process.md)** (SCRUM-8): the derivation (same regex, same
  outputs) moves from inline YAML into `.github/scripts/release/version.mjs identity`, which `identity` and the
  `Release` workflow both call; job `identity` additionally outputs `build_version`. Release builds use key `main`.
- Related: [SCRUM-1 design §13 follow-up](../architecture/SCRUM-1-design.md) (workflow/artifact naming)

## Context

ADR 0004 made every build carry its Jira key, but the key is a constant written by the story that introduced
each part of the build:

| Where | Value today |
|---|---|
| `pom.xml` `<jira.issue>` → `build-info` `build.jira` (`/actuator/info`) and manifest `X-Jira-Issue` | `SCRUM-2` |
| `.github/workflows/ci.yml` workflow name; backend artifacts | `SCRUM-2 CI`; `todo-backend-SCRUM-2-<sha>`(`-reports`) |
| `frontend/vite.config.ts` default `__JIRA_KEY__` → footer, `<meta name="build-info">`, `dist/build-info.json` | `SCRUM-1` |
| frontend artifacts | `todo-frontend-SCRUM-1-<sha>`(`-reports`) |
| tests | `TodoApplicationIntegrationTest` asserts `build.jira == "SCRUM-2"`; `BuildInfo.test.tsx` and `routes.test.tsx` assert `SCRUM-1` |

A SCRUM-6 build therefore claims to be SCRUM-2 (backend) and SCRUM-1 (frontend) — the identity is wrong for
every story after the first, which defeats ADR 0004's purpose. Bumping the constants per story (Q-03 option 1)
would make every story edit build files and tests unrelated to its scope and would still mislabel `main`
builds that contain several stories.

## Decision

1. **Single derivation point.** A first CI job, `identity`, derives `JIRA_KEY` from the branch
   (`github.head_ref` for pull requests, else `github.ref_name`), passed to the script via `env` (never
   interpolated into the script body):
   - `^feature/(SCRUM-[0-9]+)(-|$)` → the captured key (e.g. `SCRUM-6`);
   - `main` → `main`;
   - anything else → `NONE`.
   It exposes `jira_key` as a job output and writes it to the run summary. Jobs `build` and `frontend` declare
   `needs: identity` and `env: JIRA_KEY: ${{ needs.identity.outputs.jira_key }}`.
2. **Backend:** `pom.xml` keeps the existing `jira.issue` property (already used by `build-info` and the
   manifest) with default **`UNKNOWN`**; CI runs `./mvnw -B -ntp verify "-Djira.issue=${JIRA_KEY}"`. Surefire
   passes `build.jira.expected=${jira.issue}` to tests so the integration test can assert that
   `/actuator/info` `build.jira` equals the configured key.
3. **Frontend:** `vite.config.ts` reads env `JIRA_KEY` (unchanged mechanism) with default **`UNKNOWN`**
   (instead of `SCRUM-1`). No branch parsing in Vite.
4. **CI naming:** workflow `name: CI`; artifacts `todo-backend-${JIRA_KEY}-${{ github.sha }}`,
   `todo-backend-${JIRA_KEY}-${{ github.sha }}-reports`, `todo-frontend-${JIRA_KEY}-${{ github.sha }}`,
   `todo-frontend-${JIRA_KEY}-${{ github.sha }}-reports`. Job ids `build` and `frontend` are unchanged.
5. **Verification in CI:** after building, each job asserts the identity actually landed in the artefact:
   backend — jar manifest line `X-Jira-Issue: ${JIRA_KEY}` and `META-INF/build-info.properties` line
   `build.jira=${JIRA_KEY}` (in the Spring Boot 4 jar this file sits at the jar root `META-INF/`, not under
   `BOOT-INF/classes/`; the CI step locates it with `unzip -Z1` rather than hard-coding the path); frontend —
   `dist/build-info.json` `jira === JIRA_KEY`.
6. **Tests** no longer assert a specific story key: they assert the value matches
   `SCRUM-\d+|main|NONE|UNKNOWN` and (backend) equals the configured `build.jira.expected`.
7. Coverage/AC summaries in the run summary list all `SCRUM-<n>-AC-<m>` IDs found, headed with `JIRA_KEY`.

## Alternatives considered

- **Bump the constants to SCRUM-6 now** (Q-03 option 1): wrong again for the next story; touches build files
  in every story; `main` stays mislabelled. Rejected.
- **Leave as-is until SCRUM-7** (Q-03 default): every SCRUM-6 artefact would carry a wrong key. Rejected.
- **Derive in Maven** (`build-helper-maven-plugin:regex-property` on `${git.branch}`): new plugin that cannot
  be resolved/verified in the authoring workspace; PR builds are detached HEADs (git-commit-id takes the branch
  from `GITHUB_HEAD_REF`, but only in CI). A second derivation would also have to be duplicated in Vite.
  Rejected in favour of one derivation in CI.
- **Duplicate the 6-line derivation step in both jobs** instead of an `identity` job: avoids the extra job
  start-up (~10–20 s) but duplicates logic that must stay identical. Rejected; acceptable to revisit.
- **Use the PR number or commit message** as the key source: not available for plain pushes / not reliable.

## Consequences

- Builds of `feature/SCRUM-6-…` (push and PR) are labelled `SCRUM-6` everywhere: `/actuator/info`, jar manifest,
  `build-info.json`, `<meta name="build-info">`, footer, artifact names. Future stories need no build-file
  changes for identity.
- `main` builds are labelled `main` (they may contain several stories); local builds say `UNKNOWN` unless
  `-Djira.issue=…` / `JIRA_KEY=…` is passed.
- Historical artifacts keep their old names; SCRUM-1/-2 matrices are not rewritten. README traceability
  paragraphs are updated (SCRUM-6-NFR-09).
- Branch naming per ADR 0004 (`feature/SCRUM-<n>-<slug>`) becomes load-bearing: a misnamed branch builds as
  `NONE`, which is visible in the run summary and artifact name.
- Fork-PR safety: the branch name is untrusted input; it only flows through `env` and a regex, and the job
  output is either a regex-matched key or a literal.
