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

## Locked ultimate target

The adapter will import BPMN 2.0.2 Process diagrams, including their definitional Collaboration, and ultimately satisfy OMG Process Execution Conformance. The separate CIB Seven profile will target public CIB execution compatibility within a declared observation boundary. BPMN Complete Conformance, Process Modeling Conformance, BPEL mapping, and Choreography Modeling Conformance are outside the current product goal unless the owner explicitly expands it.

## Approved Milestone 0 decisions

These decisions authorize the walking skeleton only. They do not yet constitute an immutable compatibility profile or evidence of CIB or BPMN conformance.

| Decision | Milestone choice | Reason |
|---|---|---|
| CIB oracle | CIB Seven `v2.2.0` at `834a9874760de8a0107f7c1b32806e37f17fb017` | It is the published release actually executed by the source investigation; the investigated `2.3.0-SNAPSHOT` source must not be mixed into its behavior claims |
| Delivery architecture | Establish research, CIB, Lean, reducer, Temporal, diff, and replay in Milestone 0 | Every later semantic capsule must use the real assurance pipeline rather than a deferred integration path |
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

1. Obtain approval for the exact Maven, CIB, H2, JUnit, Jackson, Node, pnpm, BPMN ingestion, and Temporal dependencies before adding them.
2. Complete M0.2 through M0.6 in the order and against the exit conditions in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md).
3. During M0.2, add only the first read-only PVM definition projection needed to compare the sequential User Task model’s resolved topology, behavior type, ordered transitions, and scope relations; retain advanced boundary Event, Event Sub-Process, and multi-instance models in the diagnostic research lane.
4. For M0.5, implement one synchronous message handler that enqueues versioned inputs, one deterministic Workflow loop that alone advances the reducer, and separate live-server and retained-history replay gates.
5. After the walking skeleton is fast and green, add the researched User Task discovery/completion vertical slice and explicitly decide Update versus Signal, the task projection, Search Attribute registry, and production inbox boundary.
6. Before adding an auxiliary formal tool, identify a concrete question and seeded defect, then time-box the smallest candidate experiment from [TLA-AND-BISIMULATION-RESEARCH.md](TLA-AND-BISIMULATION-RESEARCH.md); no formal-method spike is currently scheduled.
7. Expand the BPMN requirement ledger, MIWG ingestion coverage, and CIB assertion/fixture extraction one semantic capsule at a time.

## Exact resume point

- Current package: M0.1 is implemented; M0.2 CIB calibration is next.
- Last verified commands: `./scripts/verify.sh`, `lake build checkSemanticRepresentationSpike`, and `lake exe checkSemanticRepresentationSpike`.
- Current state: the standard BPMN fixture, draft spike profile, neutral scenario, canonical observation vocabulary, logical runner boundary, and separating Lean checks are green.
- Next implementation target: approve the exact M0.2 dependency set recorded in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md), then create the embedded CIB deploy/start/wait/complete/cleanup runner that emits the first calibrated trace.
- M0.2 performance rule: measure the pristine pinned runner by phase and remove harness overhead first; create an experimental CIB source branch only when a named bottleneck or semantic question cannot be answered through public hooks, following [REFERENCE-INSTRUMENTATION.md](REFERENCE-INSTRUMENTATION.md).
- First M0.2 research anchor: inspect the pinned CIB User Task and process-completion assertion/fixture pairs and select the smallest public-API precedent before writing the red oracle test.
- First M0.2 research result: `UserTaskTest` supplies the start-and-active-task precedent, while `TaskAssigneeTest` supplies the complete-and-process-ended precedent; the neutral scenario removes their assignment and vendor-specific concerns.
- Architecture-spike status: the representation candidates and their focused gate are green, remain outside the default semantic authority, and do not reorder M0.2 calibration before the M0.3 Lean semantic capsule.
- Later Temporal implementation constraint: Event History, not Workflow cache or Visibility, is the durability source; the initial adapter must serialize all reducer mutation through one Workflow loop and treat Search Attributes as an eventually consistent projection.
- Known environment constraints: Homebrew Java 21 is installed but not active; Node, pnpm, and Maven are absent; no dependency installation or package addition is approved yet.

## Stop conditions

Stop and request direction if source and executable CIB revisions diverge, a decision would enlarge the approved feature or observation boundary, an exact new dependency has not been approved, reference behavior is ambiguous, a profile choice would be inferred from host runtime behavior, a performance budget cannot be met without changing the contract, or a proposed mechanism duplicates CIB Seven or Temporal semantics inside the wrong component.
