# SCRUM-12 — Requirements Traceability Matrix

Jira: [SCRUM-12](https://suranagivinod.atlassian.net/browse/SCRUM-12) · Branch: `feature/SCRUM-12-openapi-contract-tests` ·
Requirements: [`docs/requirements/SCRUM-12.md`](../requirements/SCRUM-12.md) · Design: [`docs/architecture/SCRUM-12-design.md`](../architecture/SCRUM-12-design.md) ·
ADRs: [0017](../adr/0017-api-contract-openapi.md) (new), [0003](../adr/0003-error-response-format.md), [0006](../adr/0006-frontend-api-client-and-state.md), [0007](../adr/0007-frontend-testing-msw.md), [0009](../adr/0009-status-sub-resource-patch.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: template (Architect), 2026-11-22 — Dev fills every `TODO` with test names, run links and evidence.**

Evidence runs: `CI` run TODO · `Release` dry-run TODO · commit TODO.
Bootstrap iterations of `api/openapi.yaml` (design §4.7): TODO (run → what the drift diff showed → fix: annotation / accepted generator output).

## 1. Requirements

| ID | Requirement | Design | Code / doc | Verification (test / check) | CI evidence |
|---|---|---|---|---|---|
| SCRUM-12-AC-01 | OpenAPI 3.x document committed; all operations, params, bodies, statuses, ApiError | §3, App. A | `api/openapi.yaml`, controller/DTO annotations, `config/OpenApiDefinitionConfig.java` | `oasdiff validate`; `OpenApiDriftIntegrationTest` › `SCRUM-12-AC-05: …equals the committed…`; review vs Appendix A | TODO |
| SCRUM-12-AC-02 | Source-of-truth decision in an ADR | §1 | ADR 0017 | review | — |
| SCRUM-12-AC-03 | Running app's success + error responses conform to the committed document | §4.5 (2), (3) | `contract/TaskApiContractIntegrationTest`, `support/OpenApiContract` | `SCRUM-12-AC-03: <scenario>` × 25 | TODO (count passed) |
| SCRUM-12-AC-04 | Undocumented endpoint / status fails; every documented pair exercised (500 exempt) | §4.5 (1), (2) | same + `OpenApiDriftIntegrationTest` | `SCRUM-12-AC-04: every /api/** handler mapping is documented…`; `SCRUM-12-AC-04: every documented (operation, status) is exercised…`; `OpenApiContractTest` › `SCRUM-12-AC-04: …default response is rejected` | TODO |
| SCRUM-12-AC-05 | Drift generated vs committed fails with a readable diff | §4.4, §4.5 (1), §7.2 | `OpenApiDriftIntegrationTest`, `support/OpenApiDocuments`, CI step "OpenAPI drift diff" | `SCRUM-12-AC-05: …equals the committed api/openapi.yaml`; `OpenApiDocumentsTest` › `SCRUM-12-AC-05: …formatting…` | TODO (incl. a bootstrap run whose summary showed the diff) |
| SCRUM-12-AC-06 | Frontend types generated (up to date in CI); `types.ts` derived/asserted; `TASK_STATUSES` exact | §6.1–6.2, §7.3 | `frontend/src/api/schema.d.ts`, `types.ts`, `package.json` scripts | `npm run api:check`; `npm run typecheck` (`ContractChecks`); `contract.test.ts` › `SCRUM-12-AC-06: TASK_STATUSES…` | TODO |
| SCRUM-12-AC-07 | MSW handlers + fixtures validated against the document | §6.4 | `frontend/src/test/contract.ts`, `contract.test.ts`, `handlers.ts` (fidelity fixes) | `SCRUM-12-AC-07: …` (handler mapping, N handler scenarios, fixtures) | TODO; handler fixes made: TODO (e.g. `Location` on 201) |
| SCRUM-12-AC-08 | Breaking changes vs main reported; fail unless acknowledged; no base → notice | §7.4, §7.5 | `.github/scripts/api-contract.sh`, `.github/scripts/api/breaking-gate.mjs`, job `api-contract` | `breaking-gate.test.mjs` › `SCRUM-12-AC-08: …`; job log "no api/openapi.yaml at base … skipped" on this branch | TODO |
| SCRUM-12-AC-09 | Acknowledgment explicit, reviewable, push + PR, story-bound, change-specific | §7.5, ADR 0017 §6 | `api/breaking-changes.ack` | `breaking-gate.test.mjs` › `SCRUM-12-AC-09: …` | TODO |
| SCRUM-12-AC-10 | No OpenAPI document / UI in production | §4.6 | `verify-jar.sh`, `application.yml`, `OpenApiExposureIntegrationTest`, e2e test | `SCRUM-12-AC-10: GET … returns 404…` (backend, 5 paths); e2e `SCRUM-12-AC-10: no OpenAPI document or UI…`; `verify-jar.sh` | TODO (CI `build`, `e2e`; Release `backend`, `e2e-release`) |
| SCRUM-12-AC-11 | No behaviour change; existing tests/coverage/CI/Release green | §5, §9 | — | existing suites unchanged (`git diff origin/main --stat` on existing test files: none); coverage numbers | TODO: backend line coverage before → after; frontend before → after; CI + Release run links |
| SCRUM-12-AC-12 | README explains how to update the contract | §8 | `README.md` | review | — |
| SCRUM-12-AC-13 | Each gate proven to fail | §4.5 (4), §6.4, §7.5 | unit/self tests | `OpenApiContractTest`, `OpenApiDocumentsTest`, `breaking-gate.test.mjs`, `contract.test.ts` › `SCRUM-12-AC-13: …` | TODO (counts) |
| SCRUM-12-AC-14 | Traceability per ADR 0004 | — | commits; this file; job summaries | review | §3 below |
| SCRUM-12-NFR-01 | No production footprint beyond annotations | §2.1, §4.1, §4.6 | `pom.xml` scopes | `dependency:tree -Dscope=runtime` (paste); `verify-jar.sh`; Release `scan` `backend-runtime` | TODO |
| SCRUM-12-NFR-02 | Supply chain: pins + checksums + verified compat | §2, §7.1, §7.4 | `install-tools.sh`, `ci.yml`, `package.json` | workflow review | TODO (`install-tools.sh oasdiff` log line) |
| SCRUM-12-NFR-03 | Deterministic, canonical document | §4.4 | `OpenApiDocuments` | `SCRUM-12-NFR-03: api/openapi.yaml is in canonical form`; re-run update → no diff | TODO |
| SCRUM-12-NFR-04 | Readable failures | §4.5, §7.5 | messages | unit tests assert message fragments | TODO (example messages) |
| SCRUM-12-NFR-05 | Single source of truth | §6.2 | `types.ts` | review | — |
| SCRUM-12-NFR-06 | CI cost bounds | §4.5, §7.4 | — | job durations | TODO: `build` before → after; `frontend` before → after; `api-contract` duration |
| SCRUM-12-NFR-07 | Local reproducibility | §8 | README | review | — |
| SCRUM-12-NFR-08 | Minimal diff; annotations without runtime effect | §9 | — | `git diff --stat origin/main` vs design §9 | TODO |
| SCRUM-12-NFR-09 | Jackson 3 still serves the API with Jackson 2 on the test classpath | §2.1, §4.5 (1) | `OpenApiDriftIntegrationTest` | `SCRUM-12-NFR-09: …Jackson 3` | TODO |
| SCRUM-12-NFR-10 | Release mechanics unaffected (repro, SBOMs, sizes, release.yml) | §1, §7.6 | — | Release dry-run `backend` (repro), `sbom` (floors), `images` (sizes) | TODO |

## 2. Versions in effect

| Component | Version | Source of truth |
|---|---|---|
| springdoc-openapi (BOM, starter-webmvc-api, test) | 3.2.0 | `pom.xml` |
| swagger-annotations-jakarta (runtime) | 2.2.55 (springdoc BOM) | `pom.xml` / resolved tree: TODO |
| networknt json-schema-validator (test) | 3.0.9 | `pom.xml` |
| java-diff-utils (test) | 4.18 | `pom.xml` |
| Jackson 3 / Jackson 2 (test, via springdoc) | 3.1.7 / 2.21.7 (Boot 4.1.2) | resolved tree: TODO |
| openapi-typescript / ajv / ajv-formats / yaml | 7.13.0 / 8.20.0 / 3.0.1 / 2.9.1 | `frontend/package.json` |
| oasdiff | 1.39.0, SHA-256 `71a85930728f367a2086077b7ae1411319421549d18473a3e8258b6451520433` | `install-tools.sh` |

## 3. Commits

| Commit | Role | Summary |
|---|---|---|
| `28e0d60` | PM | requirements |
| (this commit) | ARCH | design, ADR 0017, this template |
| TODO | DEV | … |
