# Plan

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

## Candidate initial CIB profile decisions

These are recommendations for owner approval, not implemented facts.

| Decision | Recommendation | Reason |
|---|---|---|
| CIB oracle | CIB Seven `v2.2.0` at `834a9874760de8a0107f7c1b32806e37f17fb017` | It is the published release actually executed by the source investigation; the investigated `2.3.0-SNAPSHOT` source must not be mixed into its behavior claims |
| CIB compatibility level | Begin with handoff Level 1, then mature to Level 2 public CIB execution compatibility | This is a CIB observation-boundary progression, distinct from the ultimate OMG Process Execution Conformance goal |
| Delivery phase | Complete Phase 0 calibration, then a Phase 1 sequential slice | It follows the handoff’s cumulative progression and gives the first three-way executable checkpoint |
| BPMN features | None start/end, sequence flow, one wait-state task, process completion; add variables only after the base path agrees | This separates lifecycle and command closure before expressions, gateways, events, or scopes |
| CIB extensions | None | Extensions would enlarge the compatibility boundary before the core oracle is calibrated |
| Oracle environment | Java 17, H2 fast lane, automatic job executor disabled, explicit logical clock and scheduler | This matches the demonstrated embedded approach while keeping choices reproducible |
| Expressions and values | No expression evaluation in the first executable slice | Coercion and serialization are high-risk compatibility domains and need their own explicit profile decision |
| Public observation | Deployment outcome, command outcome, process status, active semantic activities/waits with multiplicity, scoped typed variables when introduced, enabled stimuli, logical time, and stable semantic identity | These are the minimum high-value categories required by the handoff without exposing CIB execution entities or database structure |
| Listener and history scope | Exclude both initially | Including ordering and history projections would materially expand the observation boundary |
| Nondeterminism | Every scheduler, race, and time choice is explicit; compare only declared independent events modulo causal order | This prevents host scheduling or incidental iteration order from becoming BPMN semantics |
| External services | Exclude initially | External effects require a separate consistency, idempotency, retry, and rollback contract |
| Profile evolution | Drafts are mutable and produce no compatibility evidence; an approved profile is immutable and semantically versioned | This preserves replay and evidence identity without pretending an exploratory draft is a release profile |

## Next ordered work

1. Obtain owner decisions for the candidate profile table.
2. Turn the [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md) into a requirement ledger keyed by normative clause, machine-readable metamodel element, explicit disposition, and evidence source.
3. Add the 21 BPMN MIWG reference models as version-pinned import fixtures with provenance, expected parse outcomes, and a clear interchange-only claim boundary.
4. Inventory the first CIB assertion/fixture families into a machine-readable extraction ledger, starting from fixtures without vendor-prefixed constructs.
5. Calibrate CIB Seven `v2.2.0` as an embedded oracle with one deploy/start/wait/complete/cleanup scenario.
6. Record the resulting exact environment, observation boundary, and any corrected decisions as the first immutable CIB profile.
7. Add the first neutral scenario and canonical observation shape, using Betsy only when it supplies a distinct standards-anchored separator.
8. Implement the same sequential semantic capsule in Lean using red/green examples, then add the executable interpreter relation and preservation obligations.
9. Adopt Node and pnpm only when the approved shared contract is ready for an independent TypeScript reducer.
10. Add Temporal only after reducer-versus-Lean behavior is executable without Temporal.

## Stop conditions

Stop and request direction if source and executable CIB revisions diverge, a decision would enlarge the approved feature or observation boundary, a new dependency is required, reference behavior is ambiguous, a profile choice would be inferred from host runtime behavior, or a proposed mechanism duplicates CIB Seven or Temporal semantics inside the wrong component.
