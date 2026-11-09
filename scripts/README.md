# Repository scripts

This directory contains repository automation, executable guards, evidence tooling and their source-adjacent tests. Start from the task tables below rather than running an unfamiliar file by name; most non-test TypeScript files are imported libraries, not standalone commands.

The [engineering rules](../docs/kernel/ENGINEERING-POLICY.md#verification) own which gate runs where and its bounds; this README only routes tasks to their entry points.

## Everyday repository work

| Task | Entry point | Use |
|---|---|---|
| Check local prerequisites | [`doctor.sh`](doctor.sh) | Run `./scripts/doctor.sh verify` at session start. Use its explicit `research`, `adoption` or `all` scope only when the work needs those external inputs. |
| Run pnpm reproducibly | [`pnpm.sh`](pnpm.sh) | Use this wrapper for project pnpm commands so the pinned toolchain and workspace policy apply. |
| Run complete verification | [`verify.sh`](verify.sh) | The complete repository gate; it runs in hosted CI. Its stage arguments are CI-internal; never compose it with a command that masks its exit status. |
| Run every selected pre-push gate | [`pre-push-selection.ts`](pre-push-selection.ts) | After committing, derive the Product 1 workflow equivalent from the shared classifier and select every path-filtered Product 2 workflow's package-script counterpart from the clean committed diff. |
| Run a focused Lean command | [`lake.sh`](lake.sh) | The only way to run Lean: it holds the repository lock across checkouts, pins the thread count, runs the [memory brake](lean-memory-brake.sh) and refuses a full-library build unless `LEAN_FULL_GATE=<gate>` names its gate. |
| Run the kernel guards | [`kernel-guards.test.ts`](kernel-guards.test.ts) | The [guardrails](../docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation) in the fast suite; [`kernel-dispatch.lean`](kernel-dispatch.lean) and [`kernel-effects.lean`](kernel-effects.lean) are their environment scans in the build lane, and [`kernel-build-budget.ts`](kernel-build-budget.ts) the hosted build-time bounds. |
| Reject Lean proof escapes | [`lean-proof-escapes.test.ts`](lean-proof-escapes.test.ts) | Fail on `sorry`, `admit` or a project `axiom` in maintained Lean. |
| Preserve long-command evidence | [`run-with-receipt.sh`](run-with-receipt.sh) | Capture output and the real exit status atomically; [`assert-command-receipt.ts`](assert-command-receipt.ts) accepts one completed receipt as green only when its exit status is zero, and [`summarize-command-receipts.ts`](summarize-command-receipts.ts) reports a set of receipts. |
| Start PostgreSQL 18 work | [`with-postgresql-18.sh`](with-postgresql-18.sh) | Run an explicit Product 2 PostgreSQL command with the repository-owned local service boundary. |
| Prepare, restart or inspect the live demo | [`live-demo.ts`](live-demo.ts) | `demo:prepare` builds one fresh clean-commit-bound Compose stack; `demo:start` restarts matching cached images, `demo:status` rechecks its public origin and `demo:stop` preserves its volumes. |

## External sources, corpora and comparison

| Task | Entry point | Use |
|---|---|---|
| Provision registered external inputs | [`setup-external-sources.sh`](setup-external-sources.sh) | Clone or update the exact inputs declared by [`external-sources.lock`](external-sources.lock). |
| Verify registered external inputs | [`check-external-sources.sh`](check-external-sources.sh) | Read-only revision, remote, submodule and scope verification used by the doctor. |
| Fetch the normative BPMN corpus | [`fetch-bpmn-corpus.sh`](fetch-bpmn-corpus.sh) | Fetch the official source into the controlled external location. |
| Verify the normative BPMN corpus | [`verify-bpmn-corpus.sh`](verify-bpmn-corpus.sh) | Check the fixed manifest and exact source hashes without weakening the offline boundary. |
| Validate BPMN XML | [`validate-bpmn-xml.sh`](validate-bpmn-xml.sh) | Validate explicit files against the registered `BPMN20.xsd`. |
| Run the differential or model-corpus pipeline | [`test-pipeline.ts`](test-pipeline.ts) | Use `./scripts/pnpm.sh run test:pipeline` or `test:model-corpus` (hosted lanes); do not call its imported libraries directly. |
| Run the CIB oracle | [`test-cibseven-oracle.sh`](test-cibseven-oracle.sh) | Build and run the pinned CIB evidence lane through its Maven budget and Java resolution helpers; locally only a compile or a single-scenario probe under a timeout. |
| Replace retained CIB evidence | [`replace-cibseven-evidence.ts`](replace-cibseven-evidence.ts) | Explicit evidence replacement only. |

## Maintenance

| Task | Entry point | Use |
|---|---|---|
| Confirm a clean immutable target | [`clean-committed-head.ts`](clean-committed-head.ts) | Refuse review or release evidence when the target is not the clean committed `HEAD`. |
| Update publication statistics | [`publication-statistics.ts`](publication-statistics.ts) | Use `publication-stats:update` and `publication-stats:check`; normal verification does not require local Tokei. |
| Create or push project tags | [`project-tags.ts`](project-tags.ts) | Use `tag:create` and `tag:push`, only on explicit owner request; creation requires every applicable successful command receipt to name the exact tagged `HEAD` and current publication statistics. |
| Refresh browser walkthrough screenshots | [`refresh-browser-walkthrough-screenshots.ts`](refresh-browser-walkthrough-screenshots.ts) | Use `walkthrough:screenshots:refresh` for the isolated documentation-capture project. |
| Update normative labels | [`update-bpmn-normative-labels.ts`](update-bpmn-normative-labels.ts) | Maintainer-only regeneration after a reviewed normative-source change. |

## Libraries and tests

Do not execute a TypeScript module merely because it has no `.test` suffix. Contract artifact helpers, corpus loaders, CIB projectors, policy modules, parsers and process runners are imported by the commands and tests that own their behavior; follow imports to the controlling test. Tests stay beside their scripts:

- `scripts/*.test.ts` holds repository infrastructure and guard tests, selected by `test:infrastructure:runtime`;
- `scripts/*.platform-test.ts` holds Product 2 policy tests, selected separately by `test:platform-policy`;
- exact package commands live in [`package.json`](../package.json), and [`verify.sh`](verify.sh) composes the complete infrastructure lane.

Imports, package commands, workflows and executable tests are the authority for whether a script is live; add a row here only when a new maintainer task needs a discoverable entry point.
