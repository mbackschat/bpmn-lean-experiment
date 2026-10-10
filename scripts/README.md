# Repository scripts

This directory contains repository automation, executable policy guards, evidence tooling, and their source-adjacent tests. Start from the task tables below rather than running an unfamiliar file by name. Most non-test TypeScript files are imported libraries, not standalone commands.

Before changing a file under this directory, run:

```sh
node scripts/what-binds.ts scripts/<target>
```

The report names the required implementation detail maps, guards, this registry, and the 800-line owner headroom that constrain the target. [TESTING-SPEC.md](../docs/TESTING-SPEC.md) selects gates and [infrastructure policy](../docs/VERIFICATION-INFRASTRUCTURE-POLICY.md) owns execution and command bounds; this README only routes tasks to their existing entry points.

## Everyday repository work

| Task | Entry point | Use |
|---|---|---|
| Inspect proposed parallel MI closure capacity | [`parallel-mi-closure-capacity-experiment.ts`](parallel-mi-closure-capacity-experiment.ts) | Run the bounded control experiment described in the [proposal](../docs/capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#bounded-control-experiment); no production admission or proof claim. |
| Check local prerequisites | [`doctor.sh`](doctor.sh) | Run `./scripts/doctor.sh verify` at session start. Use its explicit `research`, `adoption`, or `all` scope only when the work needs those external inputs. |
| Run pnpm reproducibly | [`pnpm.sh`](pnpm.sh) | Use this wrapper for project pnpm commands so the pinned toolchain and workspace policy apply. |
| Run complete verification | [`verify.sh`](verify.sh) | Run the repository gate required by [TESTING-SPEC.md](../docs/TESTING-SPEC.md). Its stage arguments are CI-internal; contributors run the bare complete gate and do not compose it with a command that masks its exit status. |
| Run every selected pre-push gate | [`pre-push-selection.ts`](pre-push-selection.ts) | After committing, derive the Product 1 workflow equivalent from the shared classifier, discover every path-filtered Product 2 workflow and its exact package-script counterpart, then select them from the clean committed diff. |
| Run a focused Lean command | [`lake.sh`](lake.sh) | Lean wrapper with the repository lock, fixed environment, and target checks; agent use follows the [delegated implementation rules](../CLAUDE.md#delegated-implementation). |
| Discover change constraints | [`what-binds.ts`](what-binds.ts) | Report required implementation detail maps, executable guards, directory registries, and source-owner headroom before planning an edit; unknown implementation paths fail closed. Guards are tiered as named (exact path, basename, Lean module name, or relative import within depth two) or scanning (enumeration covering the path); ancestor-word matches are only counted, and `--mentions` lists them. [`what-binds-classification.ts`](what-binds-classification.ts) owns the tiers and [`what-binds-source-facts.ts`](what-binds-source-facts.ts) the lexical facts. |
| Preserve long-command evidence | [`run-with-receipt.sh`](run-with-receipt.sh) | Capture output and the real exit status atomically when the testing specification requires a retained receipt. |
| Assert a long-command verdict | [`assert-command-receipt.ts`](assert-command-receipt.ts) | Accept one completed receipt as green only when its exact durable exit status is zero. |
| Summarize an increment's commands | [`summarize-command-receipts.ts`](summarize-command-receipts.ts) | Report direct-child receipt span, interval union, command-family totals, and optional lane labels; expose incomplete evidence without inferring effort or agent counts. |
| Snapshot or compare delivery trackers | [`delivery-progress.ts`](delivery-progress.ts) | Produce owner-controlled JSON from existing requirement, CIB-selection, corpus/journey and maturity owners; compare stable ID/scope cohorts while separating additions, removals and changed scope. See [usage and acceptance limits](#delivery-tracker-snapshots). |
| Start PostgreSQL 18 work | [`with-postgresql-18.sh`](with-postgresql-18.sh) | Run an explicit Product 2 PostgreSQL command with the repository-owned local service boundary. |
| Prepare, restart, or inspect the live demo | [`live-demo.ts`](live-demo.ts) | Use online `demo:prepare` for one fresh clean-commit-bound Compose build and explicit native Namespace enrollment in the separate native demo project. Use `demo:start` to restart matching cached images without building, pulling, or reinitializing, `demo:status` to recheck its public origin, and `demo:stop` to preserve its volumes. |

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
| Build a neutral review packet | [`semantic-review-packet.ts`](semantic-review-packet.ts) | Derive changed Markdown sections and before/after file fallbacks; bind immutable commits, full heading-path context, gate receipts, and an optional validated migration matrix. |
| Build or check review continuity | [`semantic-review-manifest.ts`](semantic-review-manifest.ts) | Fingerprint full heading-path sections for eligible checkpoint-to-closure warm continuity. |
| Measure a capsule | [`capsule-cost.ts`](capsule-cost.ts) | Report commit-bounded nonblank code and documentation additions/removals. |
| Validate a documentation migration | [`document-migration-matrix.ts`](document-migration-matrix.ts) | Derive exactly-once claim dispositions for an invocation's declared Markdown source set, bound to immutable baseline and target trees. |
| Generate mechanism-maturity evidence | [`mechanism-maturity.ts`](mechanism-maturity.ts) | Join the live mechanism-family map with the evidence-owned invariant, Activity-occurrence, multiple-enabled, and composition classifications into an ephemeral non-conformance JSON vector. |
| Classify Activity-occurrence writers | [`activity-occurrence-writer-census.test.ts`](activity-occurrence-writer-census.test.ts) | Keep every production `activityOccurrences` assignment classified for Activity-identity issuance and body-claim preservation, with explicit evidence for each non-structural write shape. |
| Check semantic operation censuses | [`internal-commutation-census.test.ts`](internal-commutation-census.test.ts) and [`semantic-operation-consumer-census.test.ts`](semantic-operation-consumer-census.test.ts) | Keep both semantic accounts exhaustive over operation families and RuntimeState atom domains, and require every composed Activity-data analogue consumer to remain classified in its reviewed implementation matrix. |
| Validate structural implementation-status routes | [`document-control-plane.test.ts`](document-control-plane.test.ts) | Run the live documentation-universe guard. [`structural-map-routes.ts`](structural-map-routes.ts) owns the closed route grammar and [`markdown-link-lexer.ts`](markdown-link-lexer.ts) owns the shared live-link spans used by it and the local-link guard. |
| Check process-finding evidence | [`document-reviewability.test.ts`](document-reviewability.test.ts) | The escalation and UI-preflight guards share [`process-assessment-ledger.ts`](process-assessment-ledger.ts), which keeps each finding's count, disposition, and evidence in its own section. |
| Confirm a clean immutable target | [`clean-committed-head.ts`](clean-committed-head.ts) | Refuse review or release evidence when the target is not the clean committed `HEAD`. |
| Update publication statistics | [`publication-statistics.ts`](publication-statistics.ts) | Use the package commands `publication-stats:update` and `publication-stats:check`; normal verification does not require local Tokei. |
| Create or push project tags | [`project-tags.ts`](project-tags.ts) | Use `tag:create` and `tag:push` so tag identity and preconditions stay centralized; phase and release creation require every applicable successful command receipt to name the exact tagged `HEAD` and fail closed unless the maintained publication statistics are current. |
| Refresh browser walkthrough screenshots | [`refresh-browser-walkthrough-screenshots.ts`](refresh-browser-walkthrough-screenshots.ts) | Use `walkthrough:screenshots:refresh` for the isolated documentation-capture project with explicit fresh native Namespace enrollment before browser startup. |
| Update normative labels | [`update-bpmn-normative-labels.ts`](update-bpmn-normative-labels.ts) | Maintainer-only regeneration after a reviewed normative-source change. |
| Record and accept Lean memory evidence | [`lean-module-cost.ts`](lean-module-cost.ts) and [`lean-memory-acceptance.ts`](lean-memory-acceptance.ts) | Add, rename, remove, or change a conformance module's measured peak-resident-memory row in the cost record in the same increment as the module. [`lean-module-cost.test.ts`](lean-module-cost.test.ts) derives the tracked set from Git, binds each row to the exact measured source bytes, requires disclosure at or above 90% of the bound, and requires exactly one complete build and test receipt under the fixed cgroup ceiling with zero command failures and zero controlled pressure/OOM events. It loads the preceding committed receipt record independently, rejects tuple drift under an unchanged commit/output identity in dirty and clean execution, and admits a new valid tuple only under a new identity. |

## Libraries and tests

Do not execute a TypeScript module merely because it has no `.test` suffix. Contract artifact helpers, corpus loaders, CIB projectors, policy modules, parsers, and process runners are imported by the commands and tests that own their behavior. Follow imports and the `what-binds` report to the controlling test.

Tests stay beside their scripts intentionally:

- `scripts/*.test.ts` contains ordinary repository infrastructure and policy tests selected by `test:infrastructure:runtime`;
- `scripts/*.platform-test.ts` contains Product 2 policy tests selected separately by `test:platform-policy`;
- exact package commands and typecheck ownership live in [`package.json`](../package.json), while [`verify.sh`](verify.sh) composes the complete applicable infrastructure lane.

This README is a task router, not a manually maintained reachability claim. Imports, package commands, workflows, and executable tests remain the authority for whether a script is live. Add a row only when a new direct maintainer task needs a discoverable entry point; do not enumerate every internal helper or test here.

## Delivery tracker snapshots

Keep deliberate baseline/current JSON checkpoints in the repository so the same observations travel between machines. Suggested paths are `model-corpus/progress-baseline.json` and `model-corpus/progress-current.json`; replace them for a new comparison window instead of appending a diary. The command reads current owners and local content bindings without running qualification gates. It reads immutable Git objects only to verify approval bindings, never to reconstruct progress dates. Snapshots retain IDs, scope digests, stages and evidence bindings while the existing owners retain meaning.

```sh
node scripts/delivery-progress.ts snapshot > model-corpus/progress-baseline.json
node scripts/delivery-progress.ts snapshot --receipt-root /chosen/receipts > model-corpus/progress-current.json
node scripts/delivery-progress.ts compare model-corpus/progress-baseline.json model-corpus/progress-current.json
```

Comparison reports each tracker separately, with exact remaining stage IDs, added/removed IDs, changed scope under the same ID, stable-cohort stage transitions and the calendar window. `enteredStageIds` means a decided requirement disposition, selected CIB evidence or declared catalog eligibility according to that track's `basis`; it does not mean delivery closure. Optional receipt totals preserve failures and incomplete evidence and measure command cost, not engineering effort.

Version 2 adds `deliveryAcceptance.selectedCohort` from the [selected behavioral variants](../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#selected-behavioral-variants): exact accepted/open counts and per-ID missing or failed inputs. Acceptance requires the linked owner's approved Closure receipt and an exact reviewed delivery binding. Missing, malformed, pending, rejected, unreviewed or stale bindings stay open. Named journeys, registration and supported dispositions establish no closure.

The [public delivery receipt owner](../docs/BUSINESS-PROCESS-PUBLIC-DELIVERY-PROPOSAL.md#independent-cold-review-receipt) retains bindings in `### Reviewed delivery bindings`, a table with exactly `Variant ID` and `Delivery binding` columns. Each binding is a JSON code span governed by [`ReviewedDeliveryBinding`](delivery-acceptance.ts): actually qualified source/scenario/profile paths and hashes, nullable overlay identity/file, material scope sections, representative relationship, configuration files and named handler factory. `exactRepresentative` requires the corpus source identity/paths; `reviewedComposition` explicitly permits different qualified bytes without inferring XML equivalence. The row and declared inputs must belong to the approved immutable target or final required-edit audit and still match current files. Rows contain no copied status or acceptance date.

Comparison reports model-identity drift, scope/binding changes and new/removed IDs separately. Selected-cohort opened/closed IDs and net `ratePerDay` use only unchanged, previously bound IDs, model relationships, scopes and tuples. A newly introduced binding cannot become measured progress; no stable bound cohort means no rate. The elapsed window is calendar time, not effort or an exact acceptance date. Existing version 1 baselines still compare tracker stages, but their acceptance cohort is unknown and cannot supply historical acceptance deltas.

Overall Practical CIB7 accepted/remaining counts and rate stay unknown until the complete required denominator is reviewed. Selected-cohort acceptance covers only its declared scope; it supplies no combined BPMN/CIB/platform percentage or ETA.
