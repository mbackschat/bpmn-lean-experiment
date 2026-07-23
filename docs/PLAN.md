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
- The official Temporal TypeScript SDK and the sibling Lean experiment are available as read-only references with exact revisions in [SOURCES.md](SOURCES.md).

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
| Oracle environment | Java 17, H2 fast lane, automatic job executor disabled, explicit logical clock and scheduler | This matches the demonstrated embedded approach while keeping choices reproducible |
| Expressions and values | No expression evaluation in the first executable slice | Coercion and serialization are high-risk compatibility domains and need their own explicit profile decision |
| Public observation | Deployment outcome, command outcome, Process status, active semantic waits with multiplicity, enabled stimuli, logical time, and stable semantic identity | These are the minimum high-value categories for the walking skeleton without exposing host internals |
| Listener and history scope | Exclude both initially | Including ordering and history projections would materially expand the observation boundary |
| Nondeterminism | No semantic concurrency in the first slice; use exact canonical trace equality | Causal-order comparison is unnecessary until a concurrent capsule explicitly introduces it |
| External services | Exclude initially | External effects require a separate consistency, idempotency, retry, and rollback contract |
| Feedback budgets | Semantic loop under 2 seconds warm; full pipeline under 15 seconds warm and 45 seconds cold | A correct pipeline that is too slow for red/green work will not serve the project |

## Next ordered work

1. Complete M0.0 by recording the milestone, performance contract, dependency decisions, and resume protocol.
2. Complete M0.1 with the actual BPMN fixture, draft profile identity, neutral scenario/stimulus/observation contracts, and separating Lean checks.
3. Obtain approval for the exact Java 17, CIB, H2, Node, pnpm, BPMN ingestion, and Temporal dependencies before adding them.
4. Complete M0.2 through M0.6 in the order and against the exit conditions in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md).
5. After the walking skeleton is fast and green, expand the BPMN requirement ledger, MIWG ingestion coverage, and CIB assertion/fixture extraction one semantic capsule at a time.

## Exact resume point

- Current package: M0.0, durable milestone plan.
- Last verified command before this package: `lake build && lake test`.
- Current task: finish and verify the M0.0 documentation checkpoint, then begin M0.1 without adding dependencies.
- Next implementation target: a standard BPMN XML fixture plus profile-independent scenario and canonical-observation types with a deliberate red Lean conformance check.
- Known environment constraints: Node and pnpm are absent; the active Java is 25 rather than the required Java 17; no dependency installation or package addition is approved yet.

## Stop conditions

Stop and request direction if source and executable CIB revisions diverge, a decision would enlarge the approved feature or observation boundary, an exact new dependency has not been approved, reference behavior is ambiguous, a profile choice would be inferred from host runtime behavior, a performance budget cannot be met without changing the contract, or a proposed mechanism duplicates CIB Seven or Temporal semantics inside the wrong component.
