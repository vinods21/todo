# Release runbook

| Field | Value |
|---|---|
| Jira | [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) — SCRUM-8-AC-01..AC-33 |
| Decisions | [ADR 0013](../adr/0013-versioning-and-release-process.md) (versioning, release process), [ADR 0014](../adr/0014-vulnerability-scanning-policy.md) (SBOM, scanning, attestations) |
| Design | [SCRUM-8 design](../architecture/SCRUM-8-design.md) |
| Workflow | [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (name **Release**) |
| Related | [ROLLBACK.md](ROLLBACK.md) · [vulnerability-policy.md](vulnerability-policy.md) |

> **Known issue — `v1.0.0`:** do not run the Compose stack with `todo-frontend` images built by the `Release` pipeline
> at `v1.0.0`; cut **`v1.0.1`** after the SCRUM-9 merge. Details: [§10](#10-known-issues).

## 1. Versioning (SCRUM-8-AC-01..AC-03, AC-05)

**One product version** `MAJOR.MINOR.PATCH` ([SemVer 2.0.0](https://semver.org)) for the backend jar, the frontend
bundle and both images. The **Git tag `vX.Y.Z` is the only source of truth**; everywhere else the version is written
without `v` (artefact names, image tags, labels, `/actuator/info`, `/build-info.json`). The first release is `0.1.0`
(initial development, SemVer §4 — the public API is not yet declared stable; `1.0.0` is a deliberate later decision).

What the numbers mean for this product:

| Bump | When | Examples |
|---|---|---|
| **MAJOR** | a breaking REST API change, **or** a database migration that is not backward compatible with the previous release (see [ROLLBACK.md](ROLLBACK.md#database-caveat)) | removing/renaming a field or endpoint, changing an error contract, dropping a column the previous release still reads |
| **MINOR** | a new backward-compatible feature | new endpoint, new optional field, new UI page, additive migration |
| **PATCH** | fixes, dependency and base-image updates, docs | bug fix, CVE fix, Spring Boot / nginx / Temurin patch bump |

**Next release version** — computed by `.github/scripts/release/version.mjs` from the **highest** tag matching
`^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` (SemVer precedence, so `v0.10.0` > `v0.9.0`; every other tag such as
`v1.0.0-rc.1` or `1.0.0` is ignored):

| Input | No release tag yet | Highest tag `vM.m.p` |
|---|---|---|
| `bump=patch` (default) | `0.1.0` | `M.m.(p+1)` |
| `bump=minor` | `0.1.0` | `M.(m+1).0` |
| `bump=major` | `0.1.0` | `(M+1).0.0` |
| `version=X.Y.Z` | `X.Y.Z` | `X.Y.Z` if strictly greater, else **rejected** |

Invalid input (`1.2`, `v1.2.3`, `01.2.3`, `1.2.3-rc.1`, leading/trailing spaces, unknown bump) is rejected before
any build work.

**Build versions** (every build that is not a release: `CI` jobs, dry-runs): `X.Y.Z-<id>` where `X.Y.Z` is the next
**patch** after the highest release (`0.1.0` before the first one) and `<id>` is the 7-character lower-case commit
SHA — e.g. after `v1.2.0`, commit `a1b2c3d…` builds as `1.2.1-a1b2c3d`. Build versions are SemVer pre-releases: they
sort above the last release and below the next one, and they are valid Docker tags (no `+`).
**Q-07 rule:** if `<sha7>` is all digits with a leading zero (e.g. `0123456`, invalid as a SemVer numeric identifier),
`<id>` is `g<sha7>` (`1.2.1-g0123456`, the `git describe` convention); in every other case it is `<sha7>` unchanged
(including all-digit SHAs without a leading zero such as `1234567`).

**Local builds** (no CI, no tags) say **`0.0.0-SNAPSHOT`** — `pom.xml` (`<revision>`), `frontend/package.json`, Vite
default, Dockerfile `ARG VERSION`, Compose `TODO_VERSION`. These are inert placeholders: **never edit them to make a
release**. The pipeline never commits or pushes to any branch; the only write to Git is creating the release tag.

## 2. Cutting a release (SCRUM-8-AC-06)

Prerequisites: the change is merged to `main`, the `CI` workflow and the `Release` dry-run on that `main` commit are
green, and the [repository settings](#9-first-release-and-repository-settings-ac-29-ac-33) are in place.

**Actions UI:** *Actions → Release → Run workflow* → branch **`main`** → `bump` (`patch` / `minor` / `major`),
optionally `version` (explicit `X.Y.Z`, overrides `bump`), `dry_run` unticked → *Run workflow*.

**CLI:**

```sh
gh workflow run release.yml --repo vinods21/todo --ref main -f bump=patch -f dry_run=false   # next patch
gh workflow run release.yml --repo vinods21/todo --ref main -f bump=minor -f dry_run=false   # next minor
gh workflow run release.yml --repo vinods21/todo --ref main -f version=1.0.0 -f dry_run=false # explicit
gh workflow run release.yml --repo vinods21/todo --ref main -f dry_run=true                  # dry-run on demand
gh run watch --repo vinods21/todo "$(gh run list --repo vinods21/todo --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Guard rails (job `version`, refuses with `::error::` before any build): the ref must be `refs/heads/main` (any other
ref → "re-run with dry_run=true"); the checked-out commit must equal the dispatched `github.sha` (all jobs check out
that SHA, not a moving `main`); the commit must not already carry a release tag (no second version per commit).
Only one release runs at a time (concurrency group `release-publish`; a running release is never cancelled, but
GitHub keeps only the newest *pending* run per group — a second dispatch queued behind a running release replaces an
older pending one, which is then cancelled before it builds or publishes anything). Who may dispatch is governed by
repository write access; `publish` additionally runs in the GitHub Environment **`release`** whose deployment branch
policy allows `main` only.

What each job does:

| Job | What | Mode |
|---|---|---|
| `version` | mode, release version (or would-be), build version, image tag plan, guard, read-only pre-existence table | both |
| `tooling` | shellcheck, release tooling unit tests (junit), allow-list check, Compose override check | both |
| `backend` | `./mvnw verify` (all tests + JaCoCo gate) stamped with the version and commit time; `verify-jar.sh`; Maven SBOMs (runtime, all scopes); jar reproducibility check (report only) | both |
| `frontend` | `npm ci`, lint, typecheck, `test:coverage`, build stamped with version and `SOURCE_DATE_EPOCH`; identity check; deterministic tarball; reproducibility check (report only); npm production SBOM | both |
| `images` | builds both images **once** from the tested jar / bundle (Dockerfile `prebuilt` mode) into OCI archives; asserts digests; verifies labels and that the payload is byte-identical to the tested artefacts | both |
| `sbom` | Trivy image SBOMs from the OCI archives; finalizes all four SBOMs; CycloneDX schema validation; minimum component counts | both |
| `scan` | Trivy DB update (fails closed), 6 scan targets, live gate self-test, **vulnerability gate** | both |
| `code-scanning` | SARIF → Security tab (not for fork PRs; reporting only) | both |
| `e2e-release` | **pre-release e2e gate** (SCRUM-9, ADR 0015): loads the two OCI archives into the runner's Docker (digest-checked; no rebuild, no pull, no login), asserts that the running containers are exactly those images (digest chain, image store recorded), Compose stack, full Playwright compose suite + `@critical` guard (≥ 12, all passed), image + lifecycle checks; report artifact; always `down -v` | both |
| `release-gate` | **single aggregation point**: every gate incl. `e2e-release` must be `success`; assembles the release-candidate bundle (`SHA256SUMS`, notes) | both |
| `publish` | pre-existence (authoritative) → push immutable tags → attestations → annotated tag → draft release → publish → move `X.Y`/`latest` | **release only** |
| `verify` | post-publish verification from the outside (AC-28) | **release only** |

A full release is expected to take ≈ 15–20 minutes (NFR-04 target ≤ 30).

## 3. Dry-run (SCRUM-8-AC-11)

The same workflow runs as a **dry run** on every `pull_request`, on every push to `feature/**` and `main`, and on
`workflow_dispatch` with `dry_run=true`. It performs everything up to and including `release-gate` — with artefacts
stamped with the **build version** and images built under their final GHCR names — but creates **no tag, no image
push, no release and no attestation**: `publish` and `verify` are skipped by their `if:` and every dry-run job has a
read-only token (`contents: read`; `code-scanning` additionally `security-events: write`), so publication is
impossible, not merely skipped. A gate failure fails the dry-run.

Outputs of a dry run (workflow artifacts, ADR 0008 naming):

| Artifact | Content |
|---|---|
| `todo-release-candidate-<KEY>-<sha>` | the would-be release: `assets/` (jar, tarball, 4 SBOMs, scan reports, image list, `SHA256SUMS`), `release-notes.md` (DRY RUN banner), `plan.json` — 30 days |
| `todo-release-scan-<KEY>-<sha>` | Trivy JSON + SARIF per target, `verdict.json`, `summary.md`, DB metadata, live self-test log |
| `todo-release-sbom-<KEY>-<sha>` | the four finalized SBOMs + component counts |
| `todo-release-images-<KEY>-<sha>` | the two OCI archives (consumed by `sbom`, `scan`, `e2e-release` and `publish`) — 7 days |
| `todo-release-e2e-<KEY>-<sha>-reports` | pre-release e2e (SCRUM-9-AC-12): Playwright `compose/` HTML, JUnit, JSON, traces/screenshots/videos of failed or retried tests; `release-images.json` (digest chain); `compose-ps.txt`, `compose-logs.txt`, `compose-logs-before-down.txt` (lifecycle) — always uploaded, 30 days |
| `todo-release-backend-…`, `todo-release-frontend-…` (+ `-reports`), `todo-release-tooling-…-reports` | jar/tarball/app SBOMs, test and coverage reports |

Reading the run summary: `version` shows **DRY RUN**, the would-be release version, the build version, the tag plan,
the guard result and the pre-existence table (GHCR rows are `unknown` before the first release: anonymous reads of a
package that does not exist yet answer 403 — re-checked authoritatively in `publish`); `scan` shows the gate tables;
`release-gate` shows the asset table with SHA-256s, image digests (local), SBOM counts, gate verdict and
reproducibility results; `e2e-release` shows the candidate-image table (digests, image IDs, store), the image
checks, the e2e counts, the `@critical` verdict and flaky tests, and the lifecycle results.

### 3.1 Pre-release e2e (SCRUM-9, ADR 0015)

`e2e-release` (`needs: [version, images]`, parallel to `sbom`/`scan`, both modes) tests **the bytes that `publish`
pushes**, not a rebuild:

1. Downloads `todo-release-images-<KEY>-<sha>` and, per archive, asserts that its manifest digest equals the `images`
   output (the digest scanned, SBOM'd and pushed), then `docker load`s it and tags it `ghcr.io/vinods21/todo-<svc>:<version>`
   (`.github/scripts/release/e2e-images.sh load`).
2. Starts `docker-compose.yml` with `TODO_BACKEND_IMAGE`/`TODO_FRONTEND_IMAGE`/`TODO_IMAGE_TAG=<version>` via
   `up -d --no-build --pull never --wait --wait-timeout 240` (only `postgres:16-alpine` is pulled, in its own step).
3. Asserts the digest chain (`e2e-images.sh assert-running`, after `up` and again after the lifecycle restarts):
   running container `.Image` = local image ID = archive **config** digest (classic image store) or **manifest**
   digest (containerd image store); archive manifest digest = published digest. The store is detected and recorded;
   any other store fails the job (never guessed).
4. Runs `verify-images.sh`, the **full** compose Playwright suite (`empty-state`, `http`, `ui`) with the candidate's
   identity on a fresh volume, the `@critical` guard (`e2e-gate.mjs --tag critical --min 12`: ≥ 12 executed, all
   passed, skipped counts as failure; passed-on-retry tests are named and raise a warning), `verify-lifecycle.sh`.
5. Always: summary, diagnostics on failure, Compose logs, `docker compose down -v --remove-orphans`, artifact
   `todo-release-e2e-<KEY>-<sha>-reports`.

`release-gate` needs `e2e-release`; any result other than `success` (failure, cancelled, skipped) fails the gate, so
`publish`/`verify` cannot run. Marking more tests `@critical` (or removing a tag) requires adjusting `--min` in
`release.yml`.

**Reproduce a pre-release e2e run locally** against the candidate archives (Docker ≥ 25, Node from
`frontend/.nvmrc`, `gh` logged in; values from the run's `e2e-release` summary or `release-images.json`):

```sh
RUN=<run id>; KEY=<jira key>; SHA=<full sha>          # from the Release run
git checkout "$SHA"
gh run download "$RUN" --repo vinods21/todo -n "todo-release-images-$KEY-$SHA" -D images
export IMAGE_BACKEND=ghcr.io/vinods21/todo-backend IMAGE_FRONTEND=ghcr.io/vinods21/todo-frontend
export VERSION=<stamped version> BACKEND_DIGEST=<sha256:…> FRONTEND_DIGEST=<sha256:…>
.github/scripts/release/e2e-images.sh load images
export TODO_BACKEND_IMAGE=$IMAGE_BACKEND TODO_FRONTEND_IMAGE=$IMAGE_FRONTEND TODO_IMAGE_TAG=$VERSION
export COMPOSE_PROFILES=app COMPOSE_PROJECT_NAME=todo-release-e2e
docker compose pull postgres && docker compose up -d --no-build --pull never --wait
.github/scripts/release/e2e-images.sh assert-running
(cd e2e && npm ci && npx playwright install --with-deps --only-shell chromium \
  && E2E_EXPECT_EMPTY_DB=1 E2E_JIRA_KEY=$KEY E2E_GIT_SHA=$SHA E2E_VERSION=$VERSION npx playwright test)
node .github/scripts/release/e2e-gate.mjs --results e2e/reports/compose/results.json --tag critical --min 12
docker compose down -v --remove-orphans
```

(Locally `retries` is 0; set `CI=1` to get the CI retry policy.)

## 4. What a release produces (SCRUM-8-AC-10, AC-13, AC-18, AC-26)

**GitHub Release `vX.Y.Z`** (not draft, not pre-release, marked latest) for the annotated tag `vX.Y.Z` (message:
version, full commit SHA, run URL), with assets:

| Asset | Content |
|---|---|
| `todo-backend-X.Y.Z.jar` | the tested Spring Boot jar |
| `todo-frontend-X.Y.Z.tar.gz` | the tested `dist/` bundle incl. `build-info.json` (deterministic tar) |
| `todo-backend-X.Y.Z.cdx.json`, `todo-frontend-X.Y.Z.cdx.json` | application SBOMs (Maven runtime, npm production) |
| `todo-backend-image-X.Y.Z.cdx.json`, `todo-frontend-image-X.Y.Z.cdx.json` | image SBOMs (OS + language packages) |
| `todo-scan-reports-X.Y.Z.tar.gz` | Trivy JSON + SARIF per target, `verdict.json`, `summary.md`, DB metadata |
| `todo-images-X.Y.Z.json` | image names, digests and tags |
| `SHA256SUMS` | SHA-256 of every other asset (`sha256sum -c` format) |

**Release notes** (generated, `release-notes.mjs`): version, commit, previous release, both images **by digest** and
tag, verify commands, changes since the previous release grouped by Jira key, **database migrations added since the
previous release** (rollback information), vulnerability summary (verdict, counts, unfixed CRITICAL/HIGH, allow-list
entries in effect with expiry).

**Images** `ghcr.io/vinods21/todo-backend` and `ghcr.io/vinods21/todo-frontend` (linux/amd64), all tags of one image
pointing to **the digest that was scanned and SBOM'd**:

| Tag | Kind | Use |
|---|---|---|
| `X.Y.Z` | **immutable** (never re-pushed) | deploy, roll back |
| `X.Y.Z-<id>` | **immutable** alias — shows the commit in the tag list | trace |
| `X.Y` | moving — follows the latest patch of the line | convenience only |
| `latest` | moving — the latest release | convenience only |

Deploy and roll back by **digest** (from the release notes) or by `X.Y.Z` — never by `X.Y` or `latest`. GHCR has no
native tag immutability: the pre-existence check (`publish` step 4) is the enforcement.

**Attestations** (Sigstore keyless, GitHub OIDC): SLSA build provenance for every release asset and both image digests,
CycloneDX SBOM attestations for both image digests (pushed to GHCR next to the images).

## 5. Verify a release (SCRUM-8-AC-16, AC-26, AC-27)

```sh
V=0.1.0
gh release download "v$V" --repo vinods21/todo -D "todo-$V" && cd "todo-$V"
sha256sum -c SHA256SUMS                                                           # every asset
gh attestation verify "todo-backend-$V.jar" --repo vinods21/todo                   # provenance of files
gh attestation verify "todo-frontend-$V.tar.gz" --repo vinods21/todo
gh attestation verify "oci://ghcr.io/vinods21/todo-backend:$V" --repo vinods21/todo
gh attestation verify "oci://ghcr.io/vinods21/todo-frontend:$V" --repo vinods21/todo
gh attestation verify "oci://ghcr.io/vinods21/todo-backend:$V" --repo vinods21/todo --predicate-type https://cyclonedx.org/bom
gh release verify "v$V" --repo vinods21/todo                                      # once immutable releases are on
jq '.components | length, .metadata.component' "todo-backend-image-$V.cdx.json"   # SBOM content, version, commit
skopeo inspect --config "docker://ghcr.io/vinods21/todo-backend:$V" | jq .config.Labels   # or: docker inspect
```

Running stack (Compose, [§6 of the README](../../README.md#releases)):

```sh
curl -s localhost:8080/actuator/info | jq '.build | {version, "git-commit"}'   # backend version + commit
curl -s localhost:3000/build-info.json | jq '{version, commit, jira}'          # frontend version + commit
curl -s localhost:3000/ | grep -o '<meta name="build-info"[^>]*>'             # "<jira> <commit> <version>"
```

## 6. Traceability chain (SCRUM-8-AC-27)

From any artefact to the commit and from the commit to the Jira stories, without external records:

| Start | Command | Leads to |
|---|---|---|
| running backend | `curl -s localhost:8080/actuator/info \| jq .build` | `version`, `git-commit` |
| jar | `unzip -p todo-backend-$V.jar META-INF/MANIFEST.MF` (`Implementation-Version`, `X-Git-Commit`); `unzip -p … BOOT-INF/classes/META-INF/build-info.properties` | version, commit |
| running frontend / tarball | `curl -s localhost:3000/build-info.json` / `tar -xOzf todo-frontend-$V.tar.gz ./build-info.json` | `version`, `commit` |
| image | tag `X.Y.Z-<sha7>`; labels `org.opencontainers.image.version` / `.revision`; `gh attestation verify oci://…` (shows the workflow run and commit) | version, commit, run |
| version | `git ls-remote --tags https://github.com/vinods21/todo 'refs/tags/v0.1.0^{}'` | commit |
| commit / release | `gh release view v$V --repo vinods21/todo` → notes "Changes since …" grouped by Jira key; `git log v<prev>..v$V --format='%h %s'` (subjects start with `SCRUM-<n>:`, ADR 0004) | Jira stories |

## 7. Vulnerability policy (summary)

The gate **fails** when a **shipped** component (backend runtime dependencies, npm production dependencies, either
image's OS or language packages) has a **CRITICAL or HIGH vulnerability with an available fix**, or when an image
contains **any secret** — after applying valid allow-list entries. Unfixed CRITICAL/HIGH, MEDIUM/LOW, and test/dev-only
findings are reported, not blocking. The gate fails closed (DB download failure, scanner error, missing report, DB
older than 72 h). The policy is identical for releases and dry-runs.

Exceptions: one entry per finding in `.github/security/vulnerability-allowlist.json` — exact ID, package and
targets, justification, owner, `added`, and `expires` at most 90 days later; changed by PR only; expired or incomplete
entries suppress nothing. Full rules, the fix order and an example: [vulnerability-policy.md](vulnerability-policy.md).

## 8. Failure recovery (SCRUM-8-NFR-05)

**Rule: a version number with any published artefact is burnt.** The fix is always the *next* version, dispatched
explicitly (`-f version=X.Y.(Z+1)`); never overwrite, delete or move a `v*` tag, a release asset or an immutable
image tag. Re-running a failed `publish` never resumes: its pre-existence check refuses as soon as anything of that
version exists.

| Failed at (job `publish` step) | State that may exist | What to do |
|---|---|---|
| any job before `publish` (incl. `e2e-release`, `release-gate`) | **nothing** published | fix the cause (or wait for the DB mirror), re-run or re-dispatch — same version. **e2e failed → nothing published:** a real e2e failure is a product bug — fix forward and re-dispatch; a flake (Docker Hub, runner) — re-run the failed jobs (`gh run rerun <id> --failed`): `e2e-release` and `release-gate` re-test the same digests from the run's images artifact (7 days) |
| 1–4 (download, re-verify, login, pre-existence) | nothing published | fix and re-dispatch — same version (unless step 4 found an existing item: then that version is burnt) |
| 5 push immutable tags | some of `X.Y.Z`, `X.Y.Z-<id>` in GHCR; no tag, no release | version **burnt** → dispatch `version=X.Y.(Z+1)`; leave the pushed images (they are private until made public) |
| 6–7 attestations | immutable image tags (+ some attestations) | burnt → next patch |
| 8 annotated tag | tag `vX.Y.Z` may exist, no release | burnt → next patch; **do not delete the tag** (ruleset blocks it anyway) |
| 9 draft release | tag + **draft** release (not public) | the owner may delete the **draft** only; version burnt → next patch |
| 10 publish | tag + draft with all assets | publish the draft manually (`gh release edit vX.Y.Z --draft=false --latest`) if every asset is present, else as row 9 |
| 11 moving tags | release public; `X.Y` / `latest` may lag | point only the moving tags manually (below) or release the next patch |
| `verify` | everything published; one AC-28 check failed | investigate the failed row; if an artefact is wrong, warn in the notes ([ROLLBACK.md §6](ROLLBACK.md#6-withdrawing-a-bad-release)) and release a fix |

Fixing lagging moving tags (the only tags that may ever be re-pointed), from the release's images artifact or by
digest copy:

```sh
skopeo login ghcr.io -u <owner>   # token with write:packages
for img in todo-backend todo-frontend; do
  d=$(jq -r --arg n "ghcr.io/vinods21/$img" '.images[] | select(.name == $n) | .digest' todo-images-$V.json)
  for t in "${V%.*}" latest; do skopeo copy --preserve-digests "docker://ghcr.io/vinods21/$img@$d" "docker://ghcr.io/vinods21/$img:$t"; done
done
```

## 9. First release and repository settings (SCRUM-8-AC-29, AC-33)

Done once by the repository owner (or by the Dev agent with owner approval) after the SCRUM-8 PR is merged:

1. **Environment `release`** — *Settings → Environments → New environment* `release` → *Deployment branches and tags*:
   *Selected branches and tags* → add `main`. No required reviewer (single maintainer; can be added later without a
   code change). API:
   ```sh
   gh api -X PUT repos/vinods21/todo/environments/release \
     -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
   gh api -X POST repos/vinods21/todo/environments/release/deployment-branch-policies -f name=main -f type=branch
   ```
2. **Tag ruleset `release-tags`** — *Settings → Rules → Rulesets → New tag ruleset*: target `refs/tags/v*`,
   *Restrict updates* + *Restrict deletions*, enforcement *Active*, no bypass. (*Restrict creations* stays off: the
   workflow creates the tag; creation is guarded by the pipeline and the environment.) API:
   ```sh
   gh api -X POST repos/vinods21/todo/rulesets --input - <<'JSON'
   {"name":"release-tags","target":"tag","enforcement":"active",
    "conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},
    "rules":[{"type":"update"},{"type":"deletion"}]}
   JSON
   ```
3. **Immutable releases** — *Settings → General → Releases → Enable release immutability*; API
   `gh api -X PUT repos/vinods21/todo/immutable-releases`; check `gh api repos/vinods21/todo/immutable-releases` →
   `{"enabled":true,…}`. Once published, the tag and assets of a release are locked and GitHub adds a release
   attestation; that is why `publish` creates the release as a **draft**, uploads every asset, and only then
   publishes. Title and notes stay editable (used to withdraw a bad release).
4. Sanity dry-run on `main`: `gh workflow run release.yml --ref main -f dry_run=true` → green.
5. Release: `gh workflow run release.yml --ref main -f bump=patch -f dry_run=false` → **`v0.1.0`**; `verify` green.
   Before the first release the GHCR packages do not exist; the authoritative pre-existence check accepts GHCR's
   403/denied answer as "absent" **only** when the repository has no release tag and no release at all (design R3).
6. **GHCR visibility** (Q-09): packages pushed by a workflow start **private**. For each of `todo-backend`,
   `todo-frontend`: *Your profile → Packages → <package> → Package settings → Change visibility → Public*; confirm
   "Connected to repository vinods21/todo" (from the `org.opencontainers.image.source` label). Then check anonymously:
   `docker logout ghcr.io; docker pull ghcr.io/vinods21/todo-backend:0.1.0`.
7. Record the evidence in [`docs/traceability/SCRUM-8.md`](../traceability/SCRUM-8.md) ("First release" line): run
   id, commit SHA, tag, release URL, both image digests, `gh attestation verify` and `sha256sum -c` output, settings
   applied — in a follow-up commit (or a Jira comment on SCRUM-8 if direct commits to `main` are not allowed).

## 10. Known issues

### `v1.0.0` — prebuilt frontend bundle calls `http://localhost:8080` (found by SCRUM-9)

**Defect.** Up to and including `v1.0.0` (`8beb5aa`), the `Release` job `frontend` ran `npm run build` without
`VITE_API_BASE_URL=/`, which the Dockerfile `source` stage sets (ADR 0011, SCRUM-7-AC-17). Vite therefore inlined the
dev default `http://localhost:8080`, and the `todo-frontend` image packaged from that bundle (`DIST_SOURCE=prebuilt`)
cannot reach the API: its own CSP (`connect-src 'self'`) blocks every `/api` call, so the task list never loads. The
first `e2e-release` run ([44595056165](https://github.com/vinods21/todo/actions/runs/44595056165)) caught it; fixed in
`69180b4` (SCRUM-9). The backend image and images built from source (`docker build frontend`, CI, local Compose) are
not affected.

**State of `v1.0.0`** (checked 2026-11-20 via the REST API): tag `v1.0.0` → `8beb5aa` (lightweight), GitHub Release
`v1.0.0` published 2026-11-19T18:46Z as a **pre-release with no assets** and auto-generated notes; the `Release`
workflow has no `workflow_dispatch` run, so `publish` never pushed `1.0.0` images, SBOMs or attestations. Any
`todo-frontend` image or `todo-frontend-1.0.0*.tar.gz` built by the `Release` pipeline at that commit (e.g. dry-run
`todo-release-images-*` artifacts), or pushed by hand as `1.0.0` / `1.0` / `latest`, carries the defect.

**Remedy.**

1. **Do not use `v1.0.0` pipeline-built frontend images for the Compose stack.** To run `v1.0.0`, build from source
   (`git checkout v1.0.0 && docker compose --profile app up --build`) — or use `v1.0.1` once released.
2. After the SCRUM-9 PR is merged, cut **`v1.0.1`** (`gh workflow run release.yml --ref main -f bump=patch
   -f dry_run=false`); `e2e-release` now proves the UI works against the exact images before anything is published.
   Do **not** touch the `v1.0.0` tag or release (§8: never delete or move a `v*` tag); optionally prefix the `v1.0.0`
   notes with "⚠ Do not use the prebuilt frontend image, use v1.0.1" ([ROLLBACK.md §6](ROLLBACK.md#6-withdrawing-a-bad-release)).
3. **Watch the pre-existence check of the `v1.0.1` run.** Because a `v*` tag and a release now exist, step 4 of
   `publish` no longer treats a GHCR `403/denied` answer as "absent" (that exception applies only before the first
   release, §9 step 5). If the GHCR packages do not exist yet and the check refuses with `unknown … denied`, nothing has
   been published (the version is not burnt): create the packages / fix access, then re-dispatch the same version.
