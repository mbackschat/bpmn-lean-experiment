# Engineering rules

How work on the kernel, its boundaries and Product 2 is reviewed, verified, documented, written and set up. [CLAUDE.md](../../CLAUDE.md) holds the triggers every contributor must see before acting, and the [kernel rewrite proposal](../LEAN-KERNEL-REWRITE-PROPOSAL.md) owns the architecture, the [guardrails](../LEAN-KERNEL-REWRITE-PROPOSAL.md#guardrails-against-degradation), the delivery plan and the definition of done; this document owns the procedure behind them and never restates them. It replaces the old review, testing, documentation, code-style and verification policies ([review][review], [testing][testing], [documentation][docs], [code style][style], [infrastructure][infra], [semantic][semantic], [Temporal][temporal], [platform][platform]); what the proposal's [process reset](../LEAN-KERNEL-REWRITE-PROPOSAL.md#process-and-rule-reset) drops is not carried here.

## Reviews

The review points are fixed by CLAUDE.md and the proposal: one cold review of the W0.1 architecture checkpoint, one combined review of meaning and structure per mechanism track, one cold interpretation review before code for a row that needs a new BPMN or CIB interpretation, and at most one audit of a correction.

- A cold reviewer is a fresh agent on the root's model and reasoning effort, read-only, briefed with the committed target and the claim it must check, never the author's diagnosis, findings or verdict ([isolation][review-gate]). It reads the committed documents and code, not summaries. Implementers never review their own work.
- An interpretation review checks the normative account against BPMN 2.0.2, the CIB relation and its register entry, the [forward-compatible restriction](../../CLAUDE.md#forward-compatible-restrictions) of every field the row leaves unadmitted, and the nearest realistic wrong account with the witness that separates it.
- A track review checks the degradation classes the guardrails name, that no TypeScript code is proof-motivated, that each register entry lands in the commit of the profile behaviour it governs, and the rows it closes against their acceptance clauses.
- A required finding names the violated contract, the unsupported claim or the concrete defect, with its locus; an unmeasured preference is advisory and never blocks. Writes to the reviewed files pause until the verdict. The single audit of a correction is recorded in the correction commit's message.

## Commits and delegation

- One commit is one coherent, verified change: a feature, a defect repair or a material checkpoint, with its tests and documents. A helper, a green module or an agent handback is no separate outcome ([commit boundaries][review-commits]).
- While several lanes share the working tree, stage named paths only; never `git add -A`, `git add .`, `git stash`, `git restore .` or `git reset --hard`.
- A delegation brief names the owned and excluded paths, the invariant or algorithm, the predicted red counterexample, the focused gates the agent runs and the outcome it hands back ([delegation][review-delegation]). A LOW brief names exact commands, the deciding check and the restore condition. HIGH takes over after a repeated failure instead of delegating an equivalent attempt.
- CIB fixtures are built with the pinned CIB Model API when it preserves every witness fact; literal XML is kept for syntax, namespace, declaration order, defaulted attributes and parser-rejection discriminators the builder could alter. Pinned CIB source is never modified or forked to simplify a fixture; tracing follows the [reference instrumentation policy](../REFERENCE-INSTRUMENTATION-POLICY.md) and never counts as oracle evidence ([fixture construction][review-fixtures]).

## Red/green semantic workflow

For every new semantic mechanism ([workflow][testing-redgreen]):

1. name the BPMN clause, the reviewed profile choice or the competing interpretation it settles;
2. add the smallest scenario that separates the intended account from a realistic wrong one, with its retained CIB evidence when a CIB relation is claimed, before the code (the proposal's order gate);
3. see it fail because the mechanism is absent or wrong;
4. implement the mechanism in its feature, never a scenario-specific branch;
5. see it green in the Lean kernel, the TypeScript kernel and the CIB evidence;
6. keep a mutation that shows the comparison notices the claimed distinction.

A pile of feature, profile or format switches signals an unsound boundary: revise the shared mechanism. For every newly reachable structure, the closure stays inside `Step.closureBound` (exceeding it is `unsupported`, never truncation); every state with several enabled internal steps is order-invariant, an explicit semantic input or refused alike by Lean and TypeScript; and every stable running state either completes or exposes a semantic resumption surface ([preservation checks][testing-redgreen]).

Semantic admission and host capability are separate gates: a program the kernel admits but the host cannot schedule is refused before a Workflow starts with a host refusal code keyed by a `hostRequirements` field, never by a throw from Workflow execution.

## Verification

### Local loop

Locally run only: the Lean build of touched modules through [the Lean wrapper](../../scripts/lake.sh), the kernel runner for the affected scenarios, TypeScript type checks and unit tests (`./scripts/pnpm.sh run test:kernel` for the kernel), the fast guard suite (`node --test scripts/*.test.ts`) and `git diff --check`. Docker, the Temporal server, PostgreSQL, browsers, the CIB suites and the complete pipeline run in hosted CI on the pushed branch, once per milestone or track; a hosted failure is reproduced locally only by its narrowest command. The CIB oracle runs locally only as a compile, an experiment or a single-scenario probe under a timeout, one at a time.

- Lean: never `lake` or `lean` directly; the wrapper holds one fail-closed project lock across every checkout and refuses a full-library build unless `LEAN_FULL_GATE=<gate>` names its gate. Lake passes `-M2048`; local Lean work stays under 5 GB in total; the thread pin and the [memory brake](../../scripts/lean-memory-brake.sh) change only by owner decision ([Lean execution][infra-lean]). Exit `70` is a resource-ceiling breach, exit `75` a refused build: stop, never retry blindly.
- A deadline is chosen before launch from the gate's own allowance (focused tests 60 s, focused builds 120 s when no owner states otherwise). Tool yields are not deadlines: resume the same process; never kill and restart a build to accumulate progress ([deadlines][infra-deadline]).
- In a managed sandbox, request host port-binding authorization before the first run of a gate that binds loopback ports; `EPERM` there is a sandbox denial.

### Hosted lanes and budgets

- Ubuntu is the routine lane; macOS follows [Rule 1](../../CLAUDE.md#rule-1-no-routine-github-hosted-macos).
- Each hosted job stays below about 70% of its `timeout-minutes`; past that it is split by owned contract, never given a larger limit ([feedback budgets][infra-budget]). A feedback budget is met by removing duplicate work, splitting or making a timing diagnostic, never by deleting a discriminator, merging independent producers, skipping a lane or relaxing an oracle. Bounds change only by owner decision.
- Hosted CI is the complete gate, not the first oracle: reproduce a locally reproducible failure, correct its mechanism and push again; never rerun an unchanged failure for a better result. Distinguish running, failed, interrupted and missing results from green.
- Branch push flow: push the branch, open a pull request, and fast-forward `main` to the exact SHA whose checks, `verify-complete` included, are green; never through an administrator bypass ([push flow][testing-push]).
- Tags only on explicit owner request, at a clean, completely verified `HEAD`, through `node scripts/project-tags.ts` with the receipts of every applicable gate; annotated `phase/<kebab-case>` for completion points and `vMAJOR.MINOR.PATCH[-prerelease]` (equal to the root and web `package.json` versions) for qualified distributions; a published tag is never forced or moved ([tags][infra-tags]).

### Contracts and evidence

- Wire contracts decode strictly in Lean and TypeScript: duplicate decoded keys (escape-equivalent names included), unpaired surrogates, unsafe or non-integral numbers, unknown or missing fields, closed-enum violations and null versus absence are distinct refusals; Unicode scalar ordering applies without normalization; no document carries a format counter ([contract gate][semantic-contracts]).
- Scenarios are answer-free; retained CIB evidence is verifier-only, bound to its scenario's digest, never given to a target runner and replaced only by the explicit replacement command, grouped by exact CIB release; every new projection first gets a verifier mutation ([contract gate][semantic-contracts]).
- The CIB runner bounds every Maven call by one deadline owner (hard kill 120 s, `BPMN_CIB_MAVEN_TIMEOUT_MS` to widen for a cold machine) and kills the whole process group; every scenario and probe tears down its deployments, runtime and history and checks the engine is empty before and after ([CIB gate][semantic-cib]). Generated CIB identifiers never enter canonical identity; the [CIB observation policy](../CIB-OBSERVATION-POLICY.md) classifies every observed field.
- Evidence lanes establish different things, and no vote resolves a disagreement between them; it is classified against the standard, the profile, the CIB configuration, the observation boundary and the evidence ([evidence lanes][semantic-lanes]):

| Lane | Passage establishes | Passage does not establish |
|---|---|---|
| Normative review | the selected requirement or interpretation | implementation behaviour |
| CIB evidence | the pinned engine's behaviour under the declared options | BPMN correctness |
| Lean kernel | the executable account and its stated laws | correctness of CIB, the parser, TypeScript, Temporal or effects |
| TypeScript kernel | transcription agreement on maintained inputs | a meaning chosen independently of Lean |
| Temporal witnesses | durable results and replay for the hosted mechanisms | BPMN meaning |
| MIWG interchange | structural import of pinned models | execution conformance |
| Seeded mutation | that the comparison notices the claimed field | completeness of the projection |

Lanes that share an account, a representation, a fixture or a projection fail together; agreement between Lean and TypeScript is a transcription check, never evidence of meaning.

### Temporal

During pre-release no Event History fixture is committed, no Workflow patch branch, legacy reader or format migration exists, and replay evidence is disposable. The first owner-approved immutable baseline introduces retained histories through red replay tests with provenance, version markers, a support window and removal criteria ([history acceptance][temporal-history]). The Temporal time-skipping server is calibration only and never replaces full-server evidence.

### Product 2

- Database test selection: SQLite owns sequential persistence; real PostgreSQL owns overlapping transactions, locking, competing writers, leases and shared replicas. Shared contracts run against both only for sequential operations; never race workers against one SQLite file. The repository boundary is Promise-only. New PostgreSQL work is a domain-owned vertical slice with its migration, adapter and one invariant matrix for both backends, its real-database tests under `test/postgresql/` behind an explicit `test:postgresql` command, outside ordinary package globs and `verify.sh` ([database selection][platform-db]).

| Change | Evidence |
|---|---|
| Pure contracts, services, authorization, HTTP | focused fake-based oracle, then the affected package |
| Sequential persistence, schema refusal, retry, restart, paging | the affected SQLite package gate |
| PostgreSQL SQL, migrations, concurrency | a focused PostgreSQL 18 witness and the affected database suite; both backends before committing a repository slice |
| Shared API and recovery replicas, lease loss | `test:platform-postgresql:local` at integration, `test:pre-push:platform-postgresql` before a relevant push |

- Browser acceptance: every workflow offered in the browser has a production-built headless-Chromium journey from the product entry point to its terminal or resumption state, checking status and history; every user-visible mutation precondition is first held false to show the action unavailable, and a definite HTTP refusal is never presented as uncertain delivery. Real-host journeys serve the built application through `vite preview`; a wrapper builds once and reuses the bundle. Viewport-independent behaviour runs once; only layout-sensitive tests repeat at the second width (`@responsive`) ([browser acceptance][platform-browser]).
- A material Product 2 interaction starts with the source-grounded preflight of the [UI design specification](../BPM-PLATFORM-UI-DESIGN-SPEC.md) before the first production edit.
- Product 2 workflows (platform, PostgreSQL, showcase, UI) stay outside `verify.sh` and run their exact clean-commit local counterparts; CI never writes baselines or compares pixels; containers are built only by the evaluation-distribution workflow on a version tag or dispatch ([distribution][platform-ci]).

### Profile release readiness

A profile is release-ready only when each block holds or every remaining item is visibly classified unsupported ([readiness][testing-readiness]): the profile pins the exact standard or CIB release, environment and options and states its supported and unsupported features, interpretations and known differences; every admitted feature has an explicit transition in Lean with its assumptions, and the open proof lanes are listed; the TypeScript kernel is free of Temporal and CIB, deterministic under explicit choices, and keeps the outcome distinctions; the host's refinement covers duplicate delivery, identity retention, timers, Messages, retries, cancellation and continuation, with replay; every scenario agrees or carries a classified difference with a minimized regression; and the report names every component, profile, environment and corpus version and keeps proof, differential, refinement and replay status separate, never broader than the evidence.

## Documentation

- One owner per fact; others link to it. A fact that must live in two owners gets an executable check that fails when the copies disagree ([writing and linking][docs-writing]).
- Filenames are uppercase kebab case `<SUBJECT>-<ROLE>.md`, except the singletons (`README.md`, `PLAN.md`, `ARCHITECTURE.md`, `PROJECT-DESIGN.md`, `SOURCES.md`, `INFOGRAPHICS.md`) and the lowercase semantics documents under `docs/kernel/semantics/`. Roles: `-SPEC` an implemented maintained contract, `-PROPOSAL` intent not yet implemented, `-DECISION` an adopted choice with alternatives and reopen conditions, `-RESEARCH` read-only source study, `-EXPERIMENT` a bounded executable question with its result, `-REGISTER` a living classified collection, `-LEDGER` a classification of a defined denominator, `-POLICY` a mandatory procedure, `-TARGET` a declared objective, `-GUIDE` reader-facing use ([roles][docs-roles]). An implemented proposal graduates into its spec in the change that updates every producer, consumer and inbound link.
- Write the current contract or argument, never a changelog, session diary or status narration; Git keeps history. One paragraph per line, no hard wrap; tables or bullets for catalogs; regular relative links; no counts without the date they were measured. Apply the deletion test to every paragraph ([writing and linking][docs-writing]).
- Same change: adding, renaming or deleting a document updates the [documentation registry](../README.md) and every inbound link; a change of profile behaviour updates its semantics document and lands its register entry; a structural change updates [ARCHITECTURE](../ARCHITECTURE.md); a changed gate updates this document. `PLAN.md` and the kernel status map change only at a milestone or track closure or a stop ([same-change triggers][docs-triggers]).
- The root README speaks to BPMN modellers, CIB Seven and Temporal developers new to Lean: purpose and practical benefit first, the assurance boundary stated once (Lean checks the execution model; tests check TypeScript and Temporal hosting; neither proves the whole engine conforms), no live status or counts ([README audience][docs-readme]).

## Code style

- One responsibility and one level of abstraction per file, type and function; a third independent responsibility is a smell to extract before extending ([hygiene][style-hygiene]). File sizes follow CLAUDE.md; line compression, deleting useful comments or moving code into an untyped bag never satisfies them.
- Lean: distinct structures and inductives for semantic domains, total pattern matching, structural recursion, executable definitions separate from the declarative `Laws`; finite examples run in the runner, never as kernel-decided theorems; identifier types stay distinct, and JSON conversion stays in the codec ([Lean idiom][style-hygiene]).
- TypeScript: deeply immutable data and wire contracts through the one `DeepReadonly<T>`; `as const satisfies Contract`, never `as Contract`; closed discriminated unions; exhaustive `switch` ending in `assertNever`; `unknown` narrowed by validators at untrusted boundaries, no `any`, non-null assertions or unchecked casts; typed domain results kept apart from thrown infrastructure failures; small pure functions and ES modules over stateful classes. Directly executed harnesses stay inside Node's erasable syntax (`as const` objects with derived unions instead of `enum`); compiled packages, the kernel included, use enums for guarded kinds as the proposal prescribes ([TypeScript idiom][style-hygiene], [harnesses][infra-harness]).
- Wire decoding, semantic orchestration, host lifecycle, evidence extraction and canonical projection are separate owners.
- Comments carry semantic surplus only: contracts, invariants, ordering, failure distinctions, ownership, resource limits, evidence provenance and a tempting wrong alternative, added in the change that introduces the fact; a kernel rule's comment cites a BPMN clause or a register identifier (guard 24). No status, chronology or "currently" in a comment; a stale comment is a defect; never write stubs or comments to meet a ratio ([comments][style-comments]).

## Setup

- [Contributor setup](../CONTRIBUTOR-SETUP-GUIDE.md) owns installation; `./scripts/doctor.sh verify` checks the prerequisites before the default gate. A missing input, wrong revision, dirty evidence checkout or absent tool is an infrastructure failure, never a semantic outcome, and no selected lane silently skips a missing input ([prerequisites][infra-prereq]).
- Default gates work without optional caches; fetching an exact official artifact is explicit provisioning, never a network fallback during verification. BPMN XML is validated against the registered `BPMN20.xsd` with `xmllint` ([validate-bpmn-xml.sh](../../scripts/validate-bpmn-xml.sh)); well-formedness is no substitute. A new host tool needs a supported Ubuntu package or a pinned wrapper.
- `pnpm-workspace.yaml` pins `enableGlobalVirtualStore: false`, so local and `CI=true` commands share one projection; a disposable reviewer worktree installs its own `node_modules` with `CI=true pnpm install --frozen-lockfile` and shares only the store.
- The A12 boundary guard keeps A12 code, coordinates, exact external model bytes and downstream bean assumptions out of the engine; research may describe A12.

## Sources

[review]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/REVIEW-POLICY.md
[review-gate]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/REVIEW-POLICY.md#reviewer-isolation-and-stage-focus
[review-commits]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/REVIEW-POLICY.md#commit-boundaries
[review-delegation]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/REVIEW-POLICY.md#delegated-implementation-protocol
[review-fixtures]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/REVIEW-POLICY.md#cib-bpmn-fixture-construction
[testing]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TESTING-SPEC.md
[testing-redgreen]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TESTING-SPEC.md#redgreen-semantic-workflow
[testing-push]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TESTING-SPEC.md#branch-push-flow
[testing-readiness]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TESTING-SPEC.md#profile-release-readiness-gate
[docs]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/DOC-DISCIPLINE.md
[docs-roles]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/DOC-DISCIPLINE.md#lifecycle-roles
[docs-writing]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/DOC-DISCIPLINE.md#writing-and-linking
[docs-triggers]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/DOC-DISCIPLINE.md#same-change-triggers
[docs-readme]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/DOC-DISCIPLINE.md#top-level-readme-audience
[style]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/CODE-STYLE-GUIDE.md
[style-hygiene]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/CODE-STYLE-GUIDE.md#code-hygiene-and-module-boundaries
[style-comments]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/CODE-STYLE-GUIDE.md#comments--document-semantic-surplus
[infra]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md
[infra-prereq]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#prerequisites-and-structural-guards
[infra-lean]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#lean-execution-and-resource-evidence
[infra-deadline]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#command-deadline-selection
[infra-budget]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#feedback-budgets
[infra-harness]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#direct-typescript-harnesses
[infra-tags]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#project-tag-procedure
[semantic]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-VERIFICATION-POLICY.md
[semantic-contracts]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-VERIFICATION-POLICY.md#current-contract-and-artifact-gate
[semantic-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate
[semantic-lanes]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-VERIFICATION-POLICY.md#evidence-lanes
[temporal]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TEMPORAL-VERIFICATION-POLICY.md
[temporal-history]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TEMPORAL-VERIFICATION-POLICY.md#history-and-refinement-acceptance
[platform]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PLATFORM-VERIFICATION-POLICY.md
[platform-db]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PLATFORM-VERIFICATION-POLICY.md#database-test-selection
[platform-browser]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PLATFORM-VERIFICATION-POLICY.md#browser-acceptance
[platform-ci]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PLATFORM-VERIFICATION-POLICY.md#continuous-integration-and-distribution
