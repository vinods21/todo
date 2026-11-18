# Rollback runbook

| Field | Value |
|---|---|
| Jira | [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) — SCRUM-8-AC-31 (with AC-15, AC-27) |
| Decision | [ADR 0013](../adr/0013-versioning-and-release-process.md) · design [§13.2](../architecture/SCRUM-8-design.md#132-docsreleaserollbackmd-ac-31) |
| Related | [RELEASE.md](RELEASE.md) · [README "Releases"](../../README.md#releases) |

The reference runtime is Docker Compose (`docker-compose.yml`, SCRUM-7); there is no other deployed environment yet.
The same principles apply to any future runtime.

## 1. Principle

**Rollback = redeploy a previous immutable version.** Use the image **digest** from that release's notes (preferred)
or its immutable tag `X.Y.Z`. Never re-tag, rebuild, re-push or move `X.Y.Z` / `X.Y.Z-<id>`, never delete a tag, a
release asset or an image. The moving tags `X.Y` and `latest` are not used for deployments or rollbacks.

## 2. Find the previous good version

```sh
gh release list --repo vinods21/todo --limit 10                # versions, newest first
gh release view v0.1.0 --repo vinods21/todo                    # notes → "Images" table (digests) + "Database migrations"
gh release download v0.1.0 --repo vinods21/todo -p 'todo-images-*.json' -O - | jq .
```

Check the **"Database migrations since …"** section of every release **newer** than the target version — see
[§4](#database-caveat) before rolling back past a release that added migrations.

## 3. Roll back with Compose

Pin both images by digest (values from the target release's notes or `todo-images-X.Y.Z.json`):

```sh
export TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend
export TODO_FRONTEND_IMAGE=ghcr.io/vinods21/todo-frontend
export TODO_BACKEND_TAG=0.1.0@sha256:<backend digest>     # per-service tag wins over TODO_IMAGE_TAG
export TODO_FRONTEND_TAG=0.1.0@sha256:<frontend digest>
docker compose --profile app pull backend frontend
docker compose --profile app up --no-build -d --wait
```

(Without digests: `export TODO_IMAGE_TAG=0.1.0` instead of the two `*_TAG` variables.) The PostgreSQL volume
`todo-pgdata` is kept — data survives (`down -v` would delete it; never use it for a rollback).

Verify the rollback:

```sh
curl -s localhost:8080/actuator/info | jq -r .build.version          # → 0.1.0
curl -s localhost:3000/build-info.json | jq -r .version                # → 0.1.0
curl -s localhost:3000/ | grep -o '<meta name="build-info"[^>]*>'     # third token → 0.1.0
docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'      # healthy, pinned refs
```

The UI footer shows `<jira> · <short commit>` (`main · <sha7>` for a release); compare the commit with the release
notes. Record the rollback (who, when, from → to, reason) in Jira.

## 4. Database caveat

Flyway migrations (`src/main/resources/db/migration/V<n>__*.sql`) are **forward-only**: rolling the application back
**does not roll back the schema**. The older application then runs against the newer schema. What happens:

- **Flyway at start-up:** the project only sets `spring.flyway.enabled`/`locations`; Flyway's default
  `ignoreMigrationPatterns` is `*:future`, so `validateOnMigrate` does **not** fail on migrations that are applied in
  the database but unknown to the older application ("future" migrations). The older application **starts**.
- **Hibernate** (`spring.jpa.hibernate.ddl-auto: validate`) then checks the entities of the older version against the
  schema: start-up fails only if the older entities need a table/column that the newer migration **removed, renamed
  or changed incompatibly**. Additive changes (new nullable or defaulted columns, new tables, new indexes) are
  tolerated.
- Data written by the newer version stays in the database; columns the older version does not know are ignored by it.

**Compatibility rule (expand / contract), enforced by review:** every migration must stay backward compatible with the
**previous release** — add nullable or defaulted columns and new tables (expand); drop or rename only in a **later**
release once no deployed version uses the old shape (contract). A release with a migration that is **not** backward
compatible is a **MAJOR** release (RELEASE.md §1), and its notes say so in the migrations section; rolling back past it
requires restoring the database.

**Data restore from a backup is outside this project's tooling** (no backup/restore automation exists for the Compose
volume). If a rollback past an incompatible migration is unavoidable, restore a database backup taken before that
release with your own tooling, then deploy the older version.

## 5. Roll forward instead (preferred for code defects)

```sh
git switch main && git pull
git switch -c feature/SCRUM-<n>-revert-<topic>
git revert <bad commit(s)>               # never rewrite main's history
# PR → CI + Release dry-run green → merge
gh workflow run release.yml --repo vinods21/todo --ref main -f bump=patch -f dry_run=false
```

The new PATCH release moves `X.Y` and `latest` forward; deploy it like any release.

## 6. Withdrawing a bad release

1. Edit the release notes with a clear warning at the top (title and notes stay editable even with immutable
   releases), e.g. `gh release edit v0.2.0 --repo vinods21/todo --notes-file notes-with-warning.md` — prefix
   "⚠ Do not use: <reason>, use v0.2.1".
2. Release the fix (§5) so that `latest` and `X.Y` move past the bad version.
3. Roll deployments back (§3) or forward.
4. **Never** delete the tag, the release, its assets or the images: other deployments, SBOM consumers and attestations
   reference them, and the version number stays burnt either way.
