# Verification infrastructure policy

## Status

Implemented mandatory procedure for verification infrastructure, resource control and command evidence. Use [the testing entry point](TESTING-SPEC.md) to select a gate; this owner defines how its execution remains reproducible and recoverable.

## Prerequisites and structural guards

Run `./scripts/doctor.sh verify` before the default gate. Missing inputs, wrong revisions, dirty evidence checkouts and unavailable tools are infrastructure failures, not semantic outcomes. [Contributor setup](CONTRIBUTOR-SETUP-GUIDE.md) owns installation, dependency pins, cache scopes and host tools; [SOURCES.md](SOURCES.md) owns source provenance. `verify` requires the hash-bound OMG corpus and never fetches or reads A12. Select `research` for registered research checkouts and `adoption` explicitly for optional exact A12 evidence. Selected CMOF, MIWG, CIB inventory and A12 lanes may not silently skip missing inputs or weaken their claims.

Default gates must work without optional caches. The normative-reference guard uses [the tracked label digest](reference/bpmn-2.0.2/NORMATIVE-LABELS.digest) and compares the optional Markdown conversion only when present; contributor-setup tests derive empty-cache probes from [the cache lock](../scripts/workspace-cache.lock). The corpus fetcher installs PDF search exclusions without exempting PDFs from hash verification; use text first and inspect PDF only for a normative gap. Fetching exact official artifacts is explicit provisioning, never a network fallback during semantic verification.

BPMN XML validation uses [validate-bpmn-xml.sh](../scripts/validate-bpmn-xml.sh), which preflights and reports `xmllint` and refuses a missing registered `BPMN20.xsd`; well-formedness cannot replace schema conformance. Diagnostic overrides are `BPMN_XSD_PATH`, `BPMN_CMOF_PATH` and `BPMN_SEMANTIC_XSD_PATH`. The [metamodel checker](../scripts/check-bpmn-semantic-process-metamodel.ts) requires both CMOF and XSD sources for its bounded facts. A new host tool must have a supported Ubuntu package or a pinned action/wrapper supplying it.

[Documentation discipline](DOC-DISCIPLINE.md) owns registry membership, roles, status, receipt requirements, map atoms, reviewability budgets and maintained PLAN shape. The infrastructure gate checks those contracts and local Markdown file/anchor resolution over tracked and pending maintained material. It derives capability/profile completeness and canonical capsule assurance lanes from their typed sources; prose is not a second implementation inventory. The [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions: every closed slice's cited requirement must be decided, and every capsule-cited requirement must exist. A new proposal records an unimplemented requirement as unsupported until closure; a CIB extension or representation capsule need not manufacture a BPMN requirement. Neither check requires every supported row to be cited back from a map.

[Code hygiene](CODE-STYLE-GUIDE.md#code-hygiene-and-module-boundaries) owns module cohesion; [CLAUDE.md](../CLAUDE.md#code-hygiene-and-module-boundaries) owns the approved size limits. Source guards include pending files, keep Lean umbrellas import-only, reject handwritten JavaScript and project build-output imports in source-mapped harnesses, and derive every public package export's source mapping. `SOURCE_HEADROOM` is a planning warning, not a failure or a substitute for responsibility review; agents cannot create their own size exceptions.

The [Lean source contracts](../scripts/lean-source-contracts.test.ts) require module documentation after imports and before declarations, named maintained conformance theorems instead of anonymous top-level examples, independent declarative transition relations, and safe occurrence construction. Shared literal-aware analysis distinguishes comments, strings, characters and identifier primes; no comment-density or prose-quality quota applies. [Lean import boundaries](../scripts/lean-import-boundaries.test.ts) reject aggregate SemanticProcess imports from leaves so unrelated proof owners do not force broad rebuilds. Source contracts and their adversarial fixtures, not a prose file inventory, own exact checks.

The [A12 boundary guard](../scripts/a12-boundary.test.ts) enforces the external-source/MIT distribution separation over tracked and pending material. Research may describe A12/EUPL; it may not introduce A12 code, coordinates, exact external model bytes, linked checkout content or downstream bean assumptions into the engine. Project-authored fixtures retain distinct hash-bound provenance. [Publication statistics](../scripts/publication-statistics.ts) are maintainer-only: tags require current README blocks and Tokei; ordinary setup, builds, tests, pre-push and CI do not depend on Tokei.

pnpm 11's implicit virtual-store layout depends on `CI`. [pnpm-workspace.yaml](../pnpm-workspace.yaml) therefore pins `enableGlobalVirtualStore: false`: ordinary developer and `CI=true` commands share the repository-local projection while the content-addressable store stays shared. [The configuration guard](../scripts/pnpm-project-config.test.ts) removes overrides, checks the effective setting with and without CI, and runs bare `check:source-hygiene`; a purge or reinstall attempt fails. This is installation consistency, not a reason to delete shared caches.

## Lean execution and resource evidence

The package-level `leanOptions` in [lakefile.toml](../lakefile.toml) select synchronous theorem elaboration for every repository library and executable module build and the Lake-managed language server. This removes the repeated theorem-task accumulation measured in [the resource correction](lean-resource-costs/ELABORATION-AND-FIXTURES-LEDGER.md#package-wide-theorem-elaboration-memory-correction); the thread pin alone does not remove those retained tasks. Every theorem and `decide +kernel` obligation remains kernel-checked. The existing verification-entrypoint guard rejects a missing, enabled, or library-only setting. This package default is separate from the wrapper's process-tree limit and does not configure a raw `env lean` invocation. Resource acceptance for this correction requires a cold full-library result under the unchanged 3 GiB ceiling with zero controlled memory events and zero pressure totals; warm outputs alone cannot close a reproduced cold-build pressure failure.

Lake passes `-M2048` to every Lean process ([lakefile.toml](../lakefile.toml)), so a module whose elaboration or kernel check exceeds 2 GiB fails the build instead of exhausting the host (owner decision 2026-10-25). Local Lean work never exceeds 5 GB of memory in total, and the development thread pin and brake change only by explicit owner decision, never as a speed measure (owner direction 2026-10-25). Every Lean command is serialized through [`scripts/lake.sh`](../scripts/lake.sh). The wrapper replaces inherited `LEAN_NUM_THREADS` with the manifest-owned conservative value (on a GitHub-hosted Linux runner, the manifest's separate `leanCiBuildThreads` and `leanCiMemoryBrakeMiB` pair), acquires one fail-closed project lock, shared by every checkout of this repository, before invoking Lake, and refuses an explicit `BpmnSemantics` target. A full-library build, meaning `test` or a `build` naming no `BpmnSemantics.` submodule or declared executable, is refused unless `LEAN_FULL_GATE` names its gate or Lean batch, and so is the conformance root `build BpmnConformance`; the full root build is spelled `LEAN_FULL_GATE=<gate-or-batch-id> ./scripts/lake.sh build`, and a focused build names only its narrow modules. Every wrapped process tree runs under a [memory brake](../scripts/lean-memory-brake.sh) that sums the descendants' physical footprint (compressed pages included on macOS) every two seconds and terminates the tree above `config.leanMemoryBrakeMiB`, exiting `70`; an environment value may only lower it, and [`lean-memory-brake.test.ts`](../scripts/lean-memory-brake.test.ts) locks the termination, silent pass-through, lower-only override and the peak report written only to a `LEAN_MEMORY_PEAK_FILE` the caller names, which hosted Lean jobs print. Delegated lanes run no Lean command under [CLAUDE.md](../CLAUDE.md#delegated-implementation); every wrapper invocation, including the full-gate form, `test`, `exe`, and `env lean`, belongs to the root integrator. A yielded Lean command must be resumed or terminated rather than duplicated, and a killed one leaves the lock directory behind for manual recovery. [`verification-entrypoint.test.ts`](../scripts/verification-entrypoint.test.ts) runs the wrapper against a fake Lake executable and locks all three separators: an attempted thread override remains pinned, umbrella contamination rejects before Lake starts, and a held lock refuses a second process tree. [`lean-full-gate.test.ts`](../scripts/lean-full-gate.test.ts) locks the full-gate classification: every undeclared full-library spelling refuses before Lake starts, and a permitted invocation adds no output.

## Command deadline selection

Select the deadline before launching the command. Identify whether it is a focused test/build or a composed gate, then read that gate's documented allowance. Focused tests default to 60 seconds and focused builds to 120 seconds only when no applicable owner documents another budget. A composed gate uses its own allowance; keep its child deadlines, CPU limit, memory ceiling and swap restriction independently enforced.

For the full Lean library, local `LEAN_FULL_GATE=<gate-or-batch-id> ./scripts/lake.sh test`, `build` or `build BpmnConformance` and `./scripts/verify.sh lean-library` use the proof-library compilation allowance in [the verification stages](#continuous-integration), including when reached through pre-push. Use the compilation allowance, not the enclosing CI job's setup/recovery headroom. A focused-build default must not truncate that full-library allowance.

Execution-tool yield and polling intervals only control when the agent receives output; they are not command deadlines. Resume the same live session and receipt. Do not deliberately kill and restart a full-library build in focused-budget chunks to accumulate cache progress: unfinished modules restart from scratch. Reuse cached outputs after a genuine interruption, while retaining the failed receipt and any separate cold-resource acceptance obligation. A timeout first requires checking the selected gate and deadline against its owner; it does not by itself demonstrate a slow compiler or justify a larger budget.

## Feedback budgets

The [pipeline budget](../scripts/pipeline-budget.ts) derives a diagnostic warm target at 500 ms per registered case, a portable pathology ceiling at 1,300 ms per case, and a 10,000 ms floor for focused Lean batches. `BPMN_PIPELINE_WARM_BUDGET_MS` declares an environment-specific aggregate ceiling. Hosted allowance must exceed the portable ceiling by at least 50% and cover the longest nested CIB deadline plus reporting/cleanup. Both outer deadlines must exceed the selected aggregate ceiling; child CIB, Temporal, Lean and Node deadlines remain hang detectors. Do not copy current catalog counts or derived totals into this policy.

A soft-target breach reports the exact measurement and does not fail correctness. The prepared hosted aggregate ceiling remains hard; local cold pipeline time is measured and never reported as zero for prepared CI. Compare `phaseMs.warmTotal` only with the last uncontended measurement in [PLAN.md](PLAN.md). A full gate overlapping review or other heavy work is contended by construction: report correctness evidence and non-comparable timing, never a new performance baseline. Repeated hosted breaches require classifying the child deadline or optimizing the gate; changing a budget requires an explicit owner decision and strict parent-over-child ordering.

Each hosted verification job keeps its measured duration below about 70% of its `timeout-minutes`. Read job durations from the pull request's check runs at each push; when a job passes that share, split it by owned contract, as the integration lane was split on 2026-10-21 after a single job reached its 10-minute limit unnoticed behind an earlier red job, rather than raising the limit.

Stop if a feedback budget can be met only by weakening independence or evidence. Remove duplicate work, split by owned contract or make a performance measure diagnostic; never delete a discriminator, merge independent producers, skip a selected lane or relax its correctness oracle. During a complete pipeline measurement, no repository worktree may be modified: the harness records `git status --porcelain` after replay. Concurrent preparation stays read-only outside every worktree; ignored build output still obeys disjoint ownership.

## Long-running JavaScript and TypeScript commands

This policy preserves the result of a test or build when terminal output is truncated, an execution tool yields, or conversational context is compacted. Compaction is routine and must not force duplicate work or turn a completed gate into an unknown result.

Use durable capture for a JavaScript or TypeScript test, build, verification wrapper, browser run, or container orchestration command that may outlive one execution-tool yield or emit more output than the tool can retain. A short focused command whose complete output and exit status return in one invocation does not need a receipt.

Continue to use pnpm, `CI=true`, the repository wrappers, and [command deadline selection](#command-deadline-selection). Never start an indefinite watch process as verification.

Before launch:

1. Create an isolated receipt directory under `${TMPDIR:-/tmp}`.
2. Record or report its exact path before starting the command, so context compaction cannot erase the recovery location.
3. Name the exact command in that directory or in the accompanying progress update.
4. Start the command through a resumable execution facility and retain its resumable session ID. Retain the child command session ID, not only an outer tool-cell identifier.

During execution, stream combined standard output and error to the user and a durable log, resume the existing session after a yield, and do not start a replacement process merely to obtain more output. Do not poll only for activity; wait for meaningful output or completion while continuing the normal user-update cadence.

On completion, capture the command's pipeline status immediately and write the numeric exit status to an exit-status receipt only after the command and log capture have completed. A present receipt is the authoritative result. Retain the log until the result has been reported or incorporated into required review evidence. A green claim requires a separate `node scripts/assert-command-receipt.ts <absolute-receipt-directory>` invocation to exit zero and print `COMMAND_RECEIPT_VERDICT=success`; that verdict also prints the exact committed Git `HEAD` captured before the command started. A task notification, outer shell or tool-wrapper status, and filtered log search do not establish the command verdict. Missing or malformed evidence is invalid rather than green or red.

For a completed failed command, the assertion also reports `COMMAND_RECEIPT_FIRST_FAILURE=<line>: <text>` when the log contains a recognized line-start Node or Lean diagnostic. This is a locator, not a verdict: it may be absent for an unfamiliar reporter, preserves the complete log, and never interrupts execution or reports a failure from intentional negative output in a passing command.

Set optional `COMMAND_RECEIPT_LANE` before the receipt wrapper to retain an author-supplied label of 1–128 ASCII letters, digits, dots, underscores, colons, slashes, or hyphens, starting with a letter or digit. Labels describe work organization, not verified agent identities. Missing historical labels remain unknown.

Run `node scripts/summarize-command-receipts.ts <receipt-root>` to report completed direct-child receipts. Span runs from the earliest `command.txt` modification time to the latest `exit-status` modification time; busy duration is the union of those intervals, while summed command duration counts overlaps. Preserve modification times when copying receipts. Known direct command prefixes supply family totals; unfamiliar wrappers remain `other`. Invalid candidates are listed and make the report exit two; command failures remain observations and do not themselves fail summary generation. These measurements establish neither critical-path delay nor engineering effort and never replace individual receipt verdicts.

After compaction or a lost tool response, resume by session ID first. If that session is unavailable, inspect the receipt, the durable log, and the operating-system process state. An absent receipt means only that completion was not recorded: the command may still be running or may have been interrupted. Never rerun a command merely because transient output was lost or unavailable. Rerun only after confirming that no prior process remains active and that its outcome cannot be recovered; report that evidence gap explicitly.

[`scripts/run-with-receipt.sh`](../scripts/run-with-receipt.sh) is the executable mechanism. It uses `set -o pipefail`, `tee`, immediate `PIPESTATUS[0]` capture, atomic receipt publication, and refusal to overwrite prior evidence. Allocate and report the receipt directory before launching the long-running command:

```bash
command_receipt_root=$(mktemp -d "${TMPDIR:-/tmp}/bpmn-lean-command.XXXXXX")
printf 'command receipt: %s\n' "$command_receipt_root"
```

Then run the exact command through the wrapper in the same shell:

```bash
./scripts/run-with-receipt.sh "$command_receipt_root" -- \
  env CI=true ./scripts/pnpm.sh run test:pre-push:verify
```

When an execution tool uses a new shell for each invocation, copy the printed absolute receipt path into the wrapper invocation instead of relying on the shell variable to survive. Use the actual project command in place of the example. `command.txt` records the working directory and shell-escaped command, `git-head` records the exact committed `HEAD` before execution, `output.log` retains combined output, and `exit-status` appears only after authoritative completion. The wrapper refuses to start outside a Git worktree with a committed `HEAD`. The runner prints `COMMAND_RECEIPT_COMPLETE` only after atomic status publication; it is a completion marker, while the separate receipt assertion is the verdict. Exit `125` means the command result could not be retained reliably because log capture failed.

## Direct TypeScript harnesses

The pinned Node runtime executes every project-authored harness directly from `.ts` source through its built-in erasable-type stripping. Runtime execution does not perform type checking, so strict no-emit coverage precedes runtime execution. Product 1 uses `tsconfig.harness.json` through `check:harness-types`; it includes the engine's package tests, calibration entry points, and ordinary `scripts/*.ts`, while explicitly excluding `platform/` and `*.platform-test.ts`. Product 2 uses `tsconfig.platform-harness.json` through `test:platform-m1` and the additive M2, M3, and M4 platform checkpoint gates; it includes platform package tests and platform-only policy tests. Both configurations map workspace package names to source entry points and both reject project-owned `dist/` imports, so a clean checkout never depends on generated declarations. This split keeps `verify.sh` and its hosted workflow complete for the engine without building the platform tree, while separate path-filtered Product 2 workflows own platform, showcase-compatibility, and UI gates.

The harness configurations keep `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and NodeNext module resolution enabled. They permit `.ts` import suffixes because Node executes those paths directly. The shared harness-source policy parses each directly executed root and rejects TypeScript constructs such as native enums, runtime namespaces, parameter properties, import aliases, and `export =` that need emitted JavaScript; directly executed harnesses use `as const` value objects and derived unions instead. This guard is scoped to executed roots because no-emit checking also follows imported workspace source through path mappings, while those packages execute from compiled output and may legitimately use enums. `skipLibCheck` applies only to imported declarations, including the pinned Temporal SDK declarations that do not type-check under TypeScript 7.0.2, while every included project source file remains strictly checked. The direct `@types/node` dependency supplies the Node 24 host API surface; its `undici-types` dependency supplies type declarations for Node's Fetch-compatible APIs and adds no runtime code.

The no-emit configuration resolves workspace package names and every declared public JavaScript subpath of each mapped package to checked source entry points, so a clean checkout does not need ignored `dist/` output for type coverage. One workspace-manifest-derived guard keeps both harness path maps complete as public subpaths are added. Runtime package self-references still use each package's ordinary built output after the applicable gate builds it.

There is no JavaScript exception left: every project-authored module is strict TypeScript inside this gate. Package tests import their subject through the workspace package name so the gate resolves checked source while Node resolves the package's own built output; a package's internal compiled-only module is loaded through a non-literal specifier and narrowed like any other untrusted boundary, keeping the gate independent of `dist/`.

The semantic-core type-test configuration compiles without emitting JavaScript and locks developer-facing contract properties that runtime tests cannot observe. Its `DeepReadonly<T>` witness requires top-level, nested, array-element, tuple-element, and discriminated-union payload mutation to fail at compile time while callback types remain callable and tuples retain exact positions. `test:semantic-core` and `test:semantic` both run this gate.

The Temporal gates start a local server, and the infrastructure gate proves that run-local Playwright ports are bindable before a browser launch. In a managed sandbox, request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:infrastructure`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`; do not run a restricted probe first. A loopback-listener error containing `Operation not permitted` or `EPERM` identifies sandbox-denied local binding, not a port collision or infrastructure or semantic-test failure. The Temporal gates use pinned CLI `v1.8.1` cached under ignored `.cache/temporal-cli/`.

## Continuous integration

The [verification workflow](../.github/workflows/verify.yml) selects Product 1 from the committed diff and runs seven guarded Ubuntu jobs. [verify.sh](../scripts/verify.sh) defines the partition; bare local execution runs the same union sequentially, and `test:pre-push:verify` is its complete clean-HEAD equivalent.

| Stage | Required evidence and ordering |
|---|---|
| Proof library | Starts with runtime; the library is Lake's test driver, then the `BpmnConformance` root builds the `*Conformance` witnesses and the axiom footprint. [Source-derived root assignment](../scripts/lean-import-boundaries.test.ts) reaches every maintained non-experimental conformance and named-theorem owner from exactly one root, and keeps every non-witness module a witness imports in the semantic root. Compilation has 120 minutes inside a 135-minute job. |
| Runtime | Prerequisite inventory, infrastructure, XML, TypeScript builds/tests and CIB; no Lean-dependent package tests. |
| Temporal | After runtime; restore its exact run-attempt outputs and run the complete Temporal suite in two jobs, each within 15 minutes: `temporal` (component, testkit and hosted tests) and `temporal-serial` (serial witnesses). Split from runtime on 2026-10-22 when runtime reached 16 of its 20 minutes; as one job it needed about 14 of 15. |
| Lean checks | After proof library; restore that run's exact output, elaborate the checked-source and publication roots, build every Lean driver a package test runs (its declared native executable, or the module of a driver that binds proof-bearing fixtures and stays interpreted), and run no-argument checks through the Lean interpreter within 10 minutes. Package tests run drivers through [the native-driver helper](../scripts/lean-native-driver.ts), whose build precedes every test deadline; no programmatic witness uses the wrapper's `exe` subcommand or bypasses the wrapper. |
| Integration | After runtime and Lean checks; restore exact run-attempt outputs and run the Lean-dependent parity tests, the prepared pipeline and `git diff --check` in two jobs, each within 10 minutes: `pipeline` (catalog, Message, compensation, transaction and value-domain parity plus the prepared pipeline) and `composition-parity` (scope, structured-composition, Event Sub-Process and task parity), split on 2026-10-21 after the single job outgrew its limit. Primary Lean execution and three mutants form one serial resource-exclusive sub-lane; CIB and Temporal remain concurrent. |

`verify-complete` requires all seven selected stage jobs and accepts a legitimate Product 2-only skip. Source-derived guards follow package helper imports to prevent parity omissions or accidental runtime assignment. Weekly execution builds Lean from scratch; ordinary execution may restore the exact-source cache with incremental fallback. Lake validates reuse, and cache presence is never qualification evidence.

Keep compilation separate from setup/recovery headroom. The two-hour allowance is conservative recovery space, not a speed claim; do not restore the obsolete 30-minute cold-build limit. Restore/save are separate, and failed or timed-out compilation may save only under a unique partial key, never the immutable completed-source key. Saving is best effort and cannot survive runner loss or forced outer termination.

[The GitHub runner rule](../CLAUDE.md#rule-1-no-routine-github-hosted-macos) excludes routine macOS; Ubuntu owns clean-machine portability and the development Mac owns proportionate local validation. Only a job explicitly restricted to `workflow_dispatch` may perform a focused clean-Mac/ARM smoke check; no duplicate full suite. Larger billable runners require a separate owner decision.

[Platform verification](PLATFORM-VERIFICATION-POLICY.md#continuous-integration-and-distribution) owns separate platform, PostgreSQL, showcase and UI workflows and release/distribution execution. Product 2 browser work remains outside `verify.sh`.

## Pre-release architecture guard

`scripts/pre-release-architecture.test.ts` prevents active code from reintroducing:

- embedded schema/trace format counters;
- milestone-era scenario identifiers and paths;
- version-suffixed compiler routing;
- retired semantic-operation vocabulary in active code and maintained documentation, except exact allowlisted removal-history contexts;
- committed Temporal history JSON fixtures;
- Temporal Workflow patch branches other than the exact `bpmn-workflow-chain-v1` enrollment.

The general representation checks apply to current source and executable tests. The retired-operation check additionally scans maintained Markdown under `docs/`, excludes `docs/archived/`, and permits only the exact current removal-history contexts owned by the implementation map and profile-parameterized admission specification.

## Project tag procedure

The published `M1` through `M6` and `MVP` names are the closed functional-MVP history. For non-release completion points, use annotated `phase/<kebab-case>` tags with descriptive names. Preserve the published MUE Preview Alpha and Preview Beta phase tags at their original targets; do not retrospectively create `v0.2.0-alpha.*` or `v0.2.0-beta.*` aliases for distributions that were never released. For an actually qualified evaluation distribution, use an annotated `vMAJOR.MINOR.PATCH[-prerelease]` tag following Semantic Versioning. The version must equal the committed root `package.json` and browser `platform/apps/web/package.json` versions, and build metadata is excluded from tag names. The first selected MUE distribution version is `v0.2.0-rc.1`. The owner has explicitly directed RC phase-tag realignments, including the current review corrections; [the historical RC boundary](PROJECT-DESIGN.md#historical-rc-content-boundary) owns their qualification limits. Before each authorized move, record the former target and verify the exact remote tag object before using a compare-and-swap forced update. Each direction authorizes only its named RC correction, never another tag or an ongoing moving alias. Neither tag closes final MUE acceptance. `engine/v0.2` records that separate owner-accepted maturity boundary; a final `v0.2.0` software release remains a separate decision.

Create tags only at a clean, completely verified committed `HEAD`. Pass one `--receipt <absolute-receipt-directory>` for every applicable gate named by the owning checkpoint or release specification, and require each receipt to name the exact target commit; creation refuses an empty receipt set or any failed, malformed, or wrong-commit receipt. Never force or move a published tag except for an explicitly owner-directed RC realignment above; never reuse the historical milestone namespace, and push only the exact intended tag rather than every local tag. Before first publication only, an owner-directed correction may replace a local tag after verifying that the exact remote reference is absent and rerunning every applicable gate into exact-HEAD receipts; this is a one-time evidence correction, never a moving alias for a branch.

Create a local tag, optionally pushing it in the same invocation:

```sh
node scripts/project-tags.ts create phase shared-persistence --message "Shared persistence phase complete" --receipt <absolute-receipt-directory>
node scripts/project-tags.ts create release 0.2.0-rc.1 --message "Release 0.2.0-rc.1" --receipt <absolute-pre-push-receipt-directory> --receipt <absolute-release-receipt-directory> --push
```

If creation succeeded but the push did not, retry only that exact tag:

```sh
node scripts/project-tags.ts push phase shared-persistence
node scripts/project-tags.ts push release 0.2.0-rc.1
```
