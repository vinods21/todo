# ADR 0004 — End-to-end traceability conventions (Jira → branch → commit → test → build → CI)

- Status: Accepted — **Superseded in part by [ADR 0008](0008-ci-derived-build-identity.md)** (SCRUM-6): the
  Jira key in the build (`jira.issue` / `build.jira` / `X-Jira-Issue`, frontend `__JIRA_KEY__`) and in CI
  artifact names is no longer hard-coded per story but derived from the branch in CI; the workflow is named `CI`.
  All other conventions below remain in force.
- Date: 2026-11-17
- Jira: [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) — applies to all SCRUM-2 ACs/NFRs

## Context

The project owner requires that every change, test, build and artefact can be traced back to the Jira issue and
to individual acceptance criteria. Work is produced by a PM → Architect → Dev agent pipeline, so the role that
produced a change must also be visible.

## Decision

- **Branch:** `feature/SCRUM-<n>-<slug>`.
- **Commits:** subject `SCRUM-<n>: [ROLE] <summary>` (ROLE ∈ PM, ARCH, DEV, QA, CI); trailer `Refs: SCRUM-<n>`.
- **Requirements:** stable IDs `SCRUM-<n>-AC-xx` / `SCRUM-<n>-NFR-xx` in `docs/requirements/SCRUM-<n>.md`.
- **Tests:** JUnit 5 `@Tag("SCRUM-<n>")` on every test class; every test method's `@DisplayName` starts with the
  AC ID(s) it verifies, so Surefire XML reports themselves trace to ACs.
- **Build:** jar manifest carries `Implementation-Version`, `X-Jira-Issue`, `X-Git-Commit`, `X-Git-Branch`
  (git-commit-id-maven-plugin 9.0.1, `failOnNoGitDirectory=false`); `build-info` adds `jira=SCRUM-<n>`;
  `/actuator/info` exposes git + build info at runtime. Maven `<version>` stays semantic (`0.1.0-SNAPSHOT`).
- **CI artefacts:** `todo-backend-SCRUM-<n>-${{ github.sha }}` (jar) and `...-reports` (surefire + JaCoCo).
  _(Build and CI-artefact bullets: superseded in part by ADR 0008 — `SCRUM-<n>` is now the branch-derived
  `JIRA_KEY`, not a constant.)_
- **PR:** title `SCRUM-<n>: <story summary>`, body links the Jira issue, requirements, design, ADRs, matrix.
- **Matrix:** `docs/traceability/SCRUM-<n>.md` maps AC/NFR → code → test method → CI evidence; Dev fills it,
  CI run link added after the first green build.

## Consequences

- Any running jar or CI artefact identifies its Jira issue and exact commit.
- `grep -o 'SCRUM-2-AC-[0-9]*' target/surefire-reports/*.xml | sort -u` shows AC test coverage.
- Small per-commit discipline cost; reviewers reject commits/tests missing the conventions.
