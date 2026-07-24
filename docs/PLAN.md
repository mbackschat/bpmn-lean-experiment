# Plan

The durable milestone contract is [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md). This document owns the live checkpoint and exact resume point.

## Verified checkpoint

- The complete handoff is preserved in [ARCHITECTURE-AND-ASSURANCE-HANDOFF.md](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md).
- The official BPMN 2.0.2 PDF and machine-readable files are locally ingested, the PDF is converted to Markdown with image/link integrity checked, and the formal target is recorded in [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md).
- The project is initialized as a Git repository on `main`.
- Lean 4.31.0 and Lake 5.0 are pinned with no external packages.
- The Phase 0 contract vocabulary passes `lake build` and `lake test`.
- The CIB Seven source checkout matches the handoff’s investigated revision.
- CIB Seven’s inherited semantic regression corpus and harness have been characterized, the BPMN MIWG interchange suite is pinned, and Betsy is available as a historical cross-engine execution-case source.
- The official Temporal TypeScript SDK and the sibling Lean experiment are available as pinned references with exact revisions in [SOURCES.md](SOURCES.md).
- Temporal’s replay mechanism, Workflow and Activity execution, message types, concurrency, retries, timers, cancellation, Continue-As-New, versioning, data and visibility boundaries, human-task mechanics, and unsafe BPMN mapping shortcuts are recorded in [TEMPORAL-EXECUTION-MODEL.md](TEMPORAL-EXECUTION-MODEL.md).
- The question-driven formal-methods toolbox is assessed in [TLA-AND-BISIMULATION-RESEARCH.md](TLA-AND-BISIMULATION-RESEARCH.md): no Milestone 0 expansion or selected auxiliary tool; observational stuttering refinement remains an unimplemented adapter design target; TLA+, P, SPIN, mCRL2, Alloy/Electrum, LoLA, and specialized alternatives are available only for concrete questions.
- Controlled source instrumentation and acceleration are authorized by [REFERENCE-INSTRUMENTATION.md](REFERENCE-INSTRUMENTATION.md): pinned pristine evidence lanes remain authoritative, experimental branches are diagnostic, and semantics-relevant acceleration requires shadow comparison.
- CIB Seven’s typed DOM authoring model, separate deployment parse tree, PVM definition graph, runtime execution tree, and the corresponding fUML/PSSM execution-model precedents are recorded in [research/SEMANTIC-REPRESENTATIONS.md](research/SEMANTIC-REPRESENTATIONS.md).
- A separately gated representation spike now distinguishes source from executable IR, flow scope from event scope, arrival count from edge provenance, and external commands from internal closure; its candidates remain provisional and are recorded in [experiments/SEMANTIC-REPRESENTATION-SPIKES.md](experiments/SEMANTIC-REPRESENTATION-SPIKES.md).
- M0.2 is complete: the repository-local Java 21 runner embeds pinned CIB Seven `2.2.0` on H2 `2.3.232`, controls logical time and automatic job execution, emits the calibrated sequential User Task trace, exposes a read-only PVM diagnostic, serves multiple JSON-lines requests through one warm engine, and proves cleanup after every run.
- M0.3 is complete: the production Lean capsule separates command admission from internal closure, derives the calibrated canonical trace, keeps bound exhaustion outside semantic outcomes and committed observations, and proves start-to-wait, matching-completion, and non-matching-completion invariants.
- M0.4 is complete: the dependency-free pure TypeScript semantic core independently derives the calibrated trace, cannot read the calibration answer, matches the lifecycle and bound-exhaustion guards, and joins Lean in a 1.11–1.17 second warm semantic gate.
- M0.5 is complete: the full local Temporal server hosts one deterministic Workflow loop around the semantic core, the live Workflow result exactly equals the pure core result, and both live and committed Event Histories replay successfully.

## Locked ultimate target

The adapter will import BPMN 2.0.2 Process diagrams, including their definitional Collaboration, and ultimately satisfy OMG Process Execution Conformance. The separate CIB Seven profile will target public CIB execution compatibility within a declared observation boundary. BPMN Complete Conformance, Process Modeling Conformance, BPEL mapping, and Choreography Modeling Conformance are outside the current product goal unless the owner explicitly expands it.

## Approved Milestone 0 decisions

These decisions authorize the walking skeleton only. They do not yet constitute an immutable compatibility profile or evidence of CIB or BPMN conformance.

| Decision | Milestone choice | Reason |
|---|---|---|
| CIB oracle | CIB Seven `v2.2.0` at `834a9874760de8a0107f7c1b32806e37f17fb017` | It is the published release actually executed by the source investigation; the investigated `2.3.0-SNAPSHOT` source must not be mixed into its behavior claims |
| Delivery architecture | Establish research, CIB, Lean, semantic core, Temporal, diff, and replay in Milestone 0 | Every later semantic capsule must use the real assurance pipeline rather than a deferred integration path |
| BPMN features | None Start Event, User Task, None End Event, two Sequence Flows, and Process completion | This is the smallest useful external wait and command-closure slice |
| CIB extensions | None | Extensions would enlarge the compatibility boundary before the core oracle is calibrated |
| Oracle environment | Java 21, H2 fast lane, automatic job executor disabled, explicit logical clock and scheduler | CIB Seven 2.2 supports Java 17 and 21, publishes Java 21 Docker images, and the machine already has Homebrew Java 21 |
| Expressions and values | No expression evaluation in the first executable slice | Coercion and serialization are high-risk compatibility domains and need their own explicit profile decision |
| Public observation | Deployment outcome, command outcome, Process status, active semantic waits with multiplicity, enabled stimuli, logical time, and stable semantic identity | These are the minimum high-value categories for the walking skeleton without exposing host internals |
| Listener and history scope | Exclude both initially | Including ordering and history projections would materially expand the observation boundary |
| Nondeterminism | No semantic concurrency in the first slice; use exact canonical trace equality | Causal-order comparison is unnecessary until a concurrent capsule explicitly introduces it |
| External services | Exclude initially | External effects require a separate consistency, idempotency, retry, and rollback contract |
| Feedback budgets | Semantic loop under 2 seconds warm; full pipeline under 15 seconds warm and 45 seconds cold | A correct pipeline that is too slow for red/green work will not serve the project |

## Next ordered work

1. Complete M0.6 against the exit conditions in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md): one command must run the targets, compare canonical results, classify one injected disagreement, report phase timings, and meet the feedback budgets.
2. Obtain approval for the exact BPMN-ingestion dependencies before the package that adds them; the M0.2 Java graph, M0.4 Node/pnpm/TypeScript toolchain, and M0.5 Temporal SDK/CLI graph are approved and implemented.
3. Keep advanced boundary Event, Event Sub-Process, and multi-instance PVM models in the diagnostic research lane until the walking skeleton is complete; the first read-only sequential-model projection has answered the M0.2 topology question.
4. Preserve the M0.5 refinement boundary while building M0.6: one synchronous message handler enqueues versioned inputs, one deterministic Workflow loop alone advances the semantic core, and live-server behavior remains distinct from retained-history replay.
5. After the walking skeleton is fast and green, add the researched User Task discovery/completion vertical slice and explicitly decide Update versus Signal, the task projection, Search Attribute registry, and production inbox boundary.
6. Before adding an auxiliary formal tool, identify a concrete question and seeded defect, then time-box the smallest candidate experiment from [TLA-AND-BISIMULATION-RESEARCH.md](TLA-AND-BISIMULATION-RESEARCH.md); no formal-method spike is currently scheduled.
7. Expand the BPMN requirement ledger, MIWG ingestion coverage, and CIB assertion/fixture extraction one semantic capsule at a time.
8. After Milestone 0 is complete, review the sibling `a12-kernel-lean` project as a bounded process-transfer study: compare how it turns kernel probes into durable evidence, captures learned facts in Lean, and synchronizes formal code with its specification documentation; adopt only practices that survive the domain difference between a validation kernel and BPMN execution semantics.

## Exact resume point

- Current package: M0.5 is implemented; M0.6 fast differential/refinement orchestration is next.
- Last verified command: the complete `./scripts/verify.sh` gate, including the full local Temporal server, finished in 10.01 seconds. Its Temporal refinement/replay phase finished in 2.15 seconds.
- Current state: the content-addressed BPMN fixture, draft spike profile, calibrated CIB trace, typed Java protocol, repeated embedded CIB execution, production Lean interpreter and proofs, pure TypeScript semantic core and negative guards, deterministic Temporal Workflow host, live refinement equality, retained replay, diagnostic PVM projection, cleanup checks, and component timings are green.
- Next implementation target: add the smallest failing M0.6 orchestrator/comparator test, including one injected trace disagreement with a typed classification, then compose CIB, Lean, semantic-core, and Temporal phases without broadening the BPMN slice.
- M0.2 calibrated result: deployment and both commands commit; start reaches one `UserTask_Approve` wait with multiplicity one and enables its completion stimulus; completion ends `Instance_1`; logical time remains zero.
- M0.2 diagnostic result: ordered PVM topology matches the source sequence, ordinary flow activities have no PVM event scope, and the None End Event’s internal type is `noneEndEvent`; these facts remain diagnostic rather than compatibility keys.
- M0.2 performance result: dependency-warm engine startup measured 1.983 seconds and one scenario including cleanup measured 0.492 seconds; the dependency-warm Maven gate completed in 5.28 seconds.
- M0.3 performance result: the source-current Lean build measured 3.29 seconds; the artifact-warm focused build measured 0.14 seconds and execution measured 0.16 seconds.
- M0.4 performance result: two artifact-warm semantic-gate runs covering Lean and the TypeScript semantic core measured 1.17 seconds and 1.11 seconds, within the less-than-two-second budget.
- M0.5 performance result: the first successful source-current Temporal gate completed in 7.33 seconds; an artifact-warm rerun including TypeScript builds, full local-server startup, live execution, live replay, retained replay, and cleanup completed in 2.15 seconds. The complete implemented verification gate finished in 10.01 seconds, but M0.6 still owns the concurrent full-pipeline/comparator measurement.
- M0.5 dependency result: direct Temporal SDK packages are pinned together at `1.21.0`, CLI `v1.8.1` is cached locally, optional SWC/protobuf install scripts are denied, and the permissive graph audit is recorded in [SOURCES.md](SOURCES.md).
- M0.5 architecture result: BPMN models will be interpreted from versioned executable IR data rather than compiled into authoritative generated TypeScript; the general XML parser and IR remain absent.
- Transport status: JSON Lines is implemented for CIB but remains provisional until a Lean or TypeScript process consumes the same framing; Lean and TypeScript currently consume the shared logical contract in-process.
- Architecture-spike status: M0.3 transferred only the definition/runtime, command/closure, and bound-classification distinctions; the experiment's source/IR, scope, and token types remain outside production semantic authority.
- Later Temporal implementation constraint: Event History, not Workflow cache or Visibility, is the durability source; the initial adapter must serialize all semantic core mutation through one Workflow loop and treat Search Attributes as an eventually consistent projection.
- Known environment constraints: Homebrew Java 21 and Node 24 are installed but not globally active and are selected explicitly by maintained wrappers; `.nvmrc` and `.node-version` also pin Node 24.18.0; Maven is supplied by the repository wrapper; the first Temporal gate downloads CLI `v1.8.1` and the managed sandbox requires permission to execute its local server; BPMN-ingestion package additions remain unapproved.
- JavaScript/TypeScript command policy: the shared long-running-command guidance was read before selecting or running the M0.4 toolchain; keep tests at or below 60 seconds, builds at or below 120 seconds, and diagnose silent CPU saturation instead of extending timeouts.

## Stop conditions

Stop and request direction if source and executable CIB revisions diverge, a decision would enlarge the approved feature or observation boundary, an exact new dependency has not been approved, reference behavior is ambiguous, a profile choice would be inferred from host runtime behavior, a performance budget cannot be met without changing the contract, or a proposed mechanism duplicates CIB Seven or Temporal semantics inside the wrong component.
