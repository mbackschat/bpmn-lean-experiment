# Repository scripts

This directory contains repository automation, executable policy guards, evidence tooling, and their source-adjacent tests. Start from the task tables below rather than running an unfamiliar file by name. Most non-test TypeScript files are imported libraries, not standalone commands.

Before changing a file under this directory, run:

```sh
node scripts/what-binds.ts scripts/<target>
```

The report names the required implementation detail maps, guards, this registry, and the 800-line owner headroom that constrain the target. Stable gate definitions and command bounds remain in [TESTING-SPEC.md](../docs/TESTING-SPEC.md); this README only routes tasks to their existing entry points.

## Everyday repository work

| Task | Entry point | Use |
|---|---|---|
| Check local prerequisites | [`doctor.sh`](doctor.sh) | Run `./scripts/doctor.sh verify` at session start. Use its explicit `research`, `adoption`, or `all` scope only when the work needs those external inputs. |
| Run pnpm reproducibly | [`pnpm.sh`](pnpm.sh) | Use this wrapper for project pnpm commands so the pinned toolchain and workspace policy apply. |
| Run complete verification | [`verify.sh`](verify.sh) | Run the repository gate required by [TESTING-SPEC.md](../docs/TESTING-SPEC.md). Its stage arguments are CI-internal; contributors run the bare complete gate and do not compose it with a command that masks its exit status. |
| Run a focused Lean command | [`lake.sh`](lake.sh) | Root-integrator-only Lean wrapper with the repository lock, fixed environment, and target checks. |
| Discover change constraints | [`what-binds.ts`](what-binds.ts) | Report required implementation detail maps, executable guards, directory registries, and source-owner headroom before planning an edit; unknown implementation paths fail closed. |
| Preserve long-command evidence | [`run-with-receipt.sh`](run-with-receipt.sh) | Capture output and the real exit status atomically when the testing specification requires a retained receipt. |
| Assert a long-command verdict | [`assert-command-receipt.ts`](assert-command-receipt.ts) | Accept one completed receipt as green only when its exact durable exit status is zero. |
| Start PostgreSQL 18 work | [`with-postgresql-18.sh`](with-postgresql-18.sh) | Run an explicit Product 2 PostgreSQL command with the repository-owned local service boundary. |
| Prepare, restart, or inspect the live demo | [`live-demo.ts`](live-demo.ts) | Use online `demo:prepare` for one fresh clean-commit-bound Compose build. Use `demo:start` to restart only matching cached images with building and pulling disabled, `demo:status` to recheck its public origin, and `demo:stop` to stop it without deleting its demo-only volumes. |

## External sources, corpora, and comparison

| Task | Entry point | Use |
|---|---|---|
| Provision registered external inputs | [`setup-external-sources.sh`](setup-external-sources.sh) | Clone or update the exact inputs declared by [`external-sources.lock`](external-sources.lock). |
| Verify registered external inputs | [`check-external-sources.sh`](check-external-sources.sh) | Read-only revision, remote, submodule, and scope verification used by the doctor. |
| Fetch the normative BPMN corpus | [`fetch-bpmn-corpus.sh`](fetch-bpmn-corpus.sh) | Fetch the official source into the controlled external location. |
| Verify the normative BPMN corpus | [`verify-bpmn-corpus.sh`](verify-bpmn-corpus.sh) | Check the fixed manifest and exact source hashes without weakening the offline boundary. |
| Validate BPMN XML | [`validate-bpmn-xml.sh`](validate-bpmn-xml.sh) | Run the project XML admission validator against explicit files. |
| Run the differential or model-corpus pipeline | [`test-pipeline.ts`](test-pipeline.ts) | Use `./scripts/pnpm.sh run test:pipeline` or `test:model-corpus`; do not call its imported pipeline libraries directly. |
| Run the selected CIB oracle | [`test-cibseven-oracle.sh`](test-cibseven-oracle.sh) | Build and run the pinned CIB evidence lane through its Maven budget and Java resolution helpers. |
| Replace retained CIB evidence | [`replace-cibseven-evidence.ts`](replace-cibseven-evidence.ts) | Explicit evidence replacement only, after the owning capsule authorizes it. |
| Run optional A12 adoption evidence | [`test-a12-adoption.sh`](test-a12-adoption.sh) | Execute the separately scoped, non-distributable adoption lane. |
| Replace retained A12 evidence | [`replace-a12-adoption-evidence.ts`](replace-a12-adoption-evidence.ts) | Explicit optional-adoption replacement only, never part of the complete MIT engine gate. |

## Review, documentation, and maintenance

| Task | Entry point | Use |
|---|---|---|
| Build a neutral review packet | [`semantic-review-packet.ts`](semantic-review-packet.ts) | Bind an immutable baseline, target, routed sections, gate receipts, and optional validated migration matrix for cold review. |
| Build or check review continuity | [`semantic-review-manifest.ts`](semantic-review-manifest.ts) | Create the hash-bound checkpoint-to-closure manifest required for eligible warm continuity. |
| Measure a capsule | [`capsule-cost.ts`](capsule-cost.ts) | Report commit-bounded nonblank code and documentation additions/removals. |
| Validate a documentation migration | [`document-migration-matrix.ts`](document-migration-matrix.ts) | Derive and validate claim-granular baseline-to-target routing for a bounded documentation migration. |
| Classify Activity-occurrence writers | [`activity-occurrence-writer-census.test.ts`](activity-occurrence-writer-census.test.ts) | Keep every production `activityOccurrences` assignment classified as an initializer, issuer, identity-preserving rewrite, or identity-removing rewrite, with evidence for every issuer. |
| Validate structural implementation-status routes | [`document-control-plane.test.ts`](document-control-plane.test.ts) | Run the live documentation-universe guard. [`structural-map-routes.ts`](structural-map-routes.ts) owns the closed route grammar and [`markdown-link-lexer.ts`](markdown-link-lexer.ts) owns the shared live-link spans used by it and the local-link guard. |
| Confirm a clean immutable target | [`clean-committed-head.ts`](clean-committed-head.ts) | Refuse review or release evidence when the target is not the clean committed `HEAD`. |
| Update publication statistics | [`publication-statistics.ts`](publication-statistics.ts) | Use the package commands `publication-stats:update` and `publication-stats:check`; normal verification does not require local Tokei. |
| Create or push project tags | [`project-tags.ts`](project-tags.ts) | Use `tag:create` and `tag:push` so tag identity and preconditions stay centralized. |
| Refresh browser walkthrough screenshots | [`refresh-browser-walkthrough-screenshots.ts`](refresh-browser-walkthrough-screenshots.ts) | Use `walkthrough:screenshots:refresh` for the controlled documentation-capture project. |
| Update normative labels | [`update-bpmn-normative-labels.ts`](update-bpmn-normative-labels.ts) | Maintainer-only regeneration after a reviewed normative-source change. |
| Record per-module Lean cost | [`lean-module-cost.ts`](lean-module-cost.ts) | Add, rename, or remove a conformance module's measured peak-resident-memory row here in the same change as the module. [`lean-module-cost.test.ts`](lean-module-cost.test.ts) derives the tracked set from Git, ratchets each recorded peak against its measurement commit, and requires every module at or above 90% of the measured bound to be disclosed explicitly. |

## Libraries and tests

Do not execute a TypeScript module merely because it has no `.test` suffix. Contract artifact helpers, corpus loaders, CIB projectors, policy modules, parsers, and process runners are imported by the commands and tests that own their behavior. Follow imports and the `what-binds` report to the controlling test.

Tests stay beside their scripts intentionally:

- `scripts/*.test.ts` contains ordinary repository infrastructure and policy tests selected by `test:infrastructure:runtime`;
- `scripts/*.platform-test.ts` contains Product 2 policy tests selected separately by `test:platform-policy`;
- exact package commands and typecheck ownership live in [`package.json`](../package.json), while [`verify.sh`](verify.sh) composes the complete applicable infrastructure lane.

This README is a task router, not a manually maintained reachability claim. Imports, package commands, workflows, and executable tests remain the authority for whether a script is live. Add a row only when a new direct maintainer task needs a discoverable entry point; do not enumerate every internal helper or test here.
