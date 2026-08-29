# Engine semantic family implementation map

This detail map owns the exact implemented and absent status of each closed or in-progress BPMN element family, one section per capsule delegation. Cross-cutting invariant and ownership mechanisms are owned by [`implementation-status-owner:ENGINE-SEMANTIC-INVARIANT`](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), the cross-cutting runtime, Lean, semantic-core, and conformance boundary by [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), and root routing by [`implementation-status-router`](IMPLEMENTATION-MAP.md).

This map exists because the runtime-and-proof map's size scaled with families closed rather than with the engine boundary. It was split a second time on a narrower axis: a section belongs here when it closes one BPMN element family, and in the invariant map when its subject adds no BPMN capability, operation kind, profile, scenario, or public observation field. A newly closed family adds a section here.

## Current boundary

Each section below states the exact implemented and absent status of one BPMN element family, delegated to this map by that family's capsule or specification. A section asserts nothing about any other family. The invariant and ownership mechanisms those families rely on are owned by [`implementation-status-owner:ENGINE-SEMANTIC-INVARIANT`](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), and the cross-cutting runtime, Lean, semantic-core, and conformance boundary by [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md); this map repeats neither.

The union of these sections is not a coverage figure. BPMN requirement coverage, CIB profile coverage, and platform milestone coverage are three separate denominators with their own owners, and adding family sections changes none of them.

## Implemented

The families with a section here are the three boundary-Timer loci, the two Multi-Instance User Tasks, and the Activity data-input User Task. Each section names its own rules, evidence lanes, and absences, and is the authority for that family rather than a summary of one.

## Explicitly absent

A family with no section here has no status in this map, which is an absence of routing rather than a claim that the family is unimplemented; [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions and the owning capsule owns meaning. No section here is a BPMN conformance or CIB compatibility claim, and none establishes that a mechanism one family proves holds for another.

## Evidence owners

The [capsule registry](capsules/README.md), the Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), the registered scenarios, and the differential pipeline bind every claim below. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

Reading these sections together supports no cross-family theorem. A mechanism two families share is established only where each section says so independently, and this map is where such a split becomes visible rather than where it is resolved. A mechanism recorded in the invariant map is likewise established for a family only where that family's section says so.

## Interrupting Activity boundary Timer

The [interrupting Activity boundary Timer specification](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) is **implemented and evidence-closed** for one interrupting exact-`PT1S` deadline on a User Task.

**Implemented.** Source, checked graph, `AwaitBoundedUserTask` lowering, Lean, the independent core, both registered victory routes, Worker-absence durability, shared-activation refusal, replay, and product examples are green.

**Absent.** In Lean, the quantified stale-identity account is conditional and stops at unfindability. `bounded_task_victory_withdrawals_are_final` states over every state and both victory arms that each victory withdraws a live task and a live deadline and that no remaining wait carries either withdrawn key, but it **assumes** key uniqueness rather than deriving it: the `waitIdentitiesUnique` conjunct names the fact and its preservation is unproved, so the law does not yet apply to a state reached by execution. It also does not state the refusal *outcome* of the later stimulus, because that outcome belongs to the dispatcher and one law spanning both accounts would depend on both; the rejected outcome and exact state preservation remain finite checked witnesses beside the core's independent refusal.

**Absent in evidence.** No target can present an off-deadline firing because the host derives the firing instant from committed state. The abandoned Activity's stale completion has no non-racing delivery mode after its task disappears. CIB observation is not selected. The shared-activation refusal identity reaches the Workflow result and Event History, but not a caller awaiting the completion Update.

## Non-interrupting boundary Timer

The [non-interrupting boundary Timer specification](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated** for one exact-`PT1S` firing that preserves its User Task host.

**Implemented.** Source admission resolves `cancelActivity` into the closed `BoundaryInterruption` value, and the sibling profiles remain disjoint. The `awaitMonitoredUserTask` operation, Lean, the independent core, two registered schedules with mutations, Worker absence, shared-activation refusal, and replay are green. Firing keeps the monitored task live, spawns exactly one boundary task, and closes after both one-sided completions.

**Absent.** CIB observation is not selected. Repeated firing is outside the slice and would require an occurrence record before the one-sided join could remain unambiguous.

## Interrupting Sub-Process boundary Timer

[The interrupting Sub-Process boundary Timer specification](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated**, for exactly one embedded Sub-Process with one child task and one interrupting `PT1S` boundary Timer. That capsule owns the full exclusion set and is not restated here.

**Implemented.** The source, checked graph, `enterBoundedScope` wire operation, independent Lean and core arming and victory transitions, two registered routes with mutations, distinct shared-activation refusal, Worker-absence durability, and replay are green. The host reuses the family-parameterized boundary deadline scheduler while retaining a distinct refusal identity.

**Absent.** In Lean, and owned only here, the quiescence bridge takes `running` and `bounded`, hypotheses its own transition does not establish. The deadline arm's `parentOwned` is **discharged**: it asserted that regional cancellation left the parent-owned deadline in `timerWaits`, which was true only because the deadline sat outside the cancelled subtree, and the Activity occurrence record now withdraws it there. `deadline_arm_bridge_premise_is_satisfiable` went with the premise it witnessed. With no non-evaluator premise left, that bridge is a dispatcher check and is not cited as a semantic lane; withdrawal on the arm rests on the quantified `cancelScopeSubtree_withdraws_listed_timers` instead.

**Absent in Lean soundness.** `BoundedScopeVictoryStep` is **not** wired into the global `ProgramStep` soundness; only `BoundedScopeArmingStep` is. The relation-level logical-time law is a joint bound over both arms rather than a law separating them.

**Absent in evidence.** CIB observation is not selected. Off-deadline and stale-child witnesses remain outside the registered schedules because no Temporal target can present them without replacing committed deadline derivation or racing task disappearance; Lean and the focused core test carry those refusals.

## Sequential Multi-Instance User Task

The [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) is **implemented and evidence-closed** for one exact collection-driven sequential User Task with direct String input/output mediation and one interrupting outer-lifetime `PT5S` Timer.

**Implemented.** Source admission and lowering preserve the complete data role graph; Lean and the independently written TypeScript core own one outer controller, immutable ordered snapshot, dense indexed outputs, four transition families, exact bounds, public progress, and generated-inner occurrence accounting. Program-aware well-formedness binds each controller forward to one exact operation, record owner, live User Task, and attached lifetime Timer, then checks the reverse operation-local census so no open record or surplus task or Timer wait can escape before command admission, continuation restore, projection, or scheduling. Program admission owns malformed operation-scope structure while no matching runtime artifact exists, and both missing and duplicate owners fail the runtime binding once the Activity is live. Lean proves finite-snapshot conditional closure from target-indexed actual transition events and derives their close-or-decrease effect without claiming human or host fairness. The registered natural and interrupted scenarios agree across Lean, the core, and Temporal. The production Workflow chain preserves one managed lifetime Timer across task turnover, permits only pre-arming rollover, replaces the Worker, recovers a retained result, publishes exact E1/E2 and terminal receipts, proves exact-16 fit with count-only exact-17 refusal, and replays every Run.

**Absent.** Another Activity body, loop cardinality, completion conditions, partial output, non-direct mapping, expressions, another value type, repeated or nested controllers, parallel generation, another Boundary Event or Timer form, a CIB Multi-Instance semantic profile, quantified preservation of every well-formedness conjunct, and a JSON-escape-aware Lean byte measure remain outside this slice.

## Parallel Multi-Instance User Task

The [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) is **implemented, independently closure-reviewed, and evidence-closed** for one exact collection-driven parallel User Task with direct String mediation, exact all-or-first completion policy, and one interrupting outer-lifetime `PT5S` Timer.

**Implemented.** Source admission and lowering preserve the complete role graph and exact Simple Boolean completion expression. Lean and the independently written TypeScript core own one indexed controller, atomic bounded child generation, progress, final aggregation, early sibling termination, Timer interruption, exact refusal, and public progress. Lean proves evaluator soundness, complete runtime-state preservation on every route, all-policy commutation for distinct child completions, index-ordered aggregation, and the first-policy trace non-law. Complete permutation and mutation matrices bind the TypeScript realization and three answer-free scenarios agree across Lean, core, E1/E2 publication, and Temporal. The production Workflow chain preserves FIFO accepted stimulus order, handles pre-arming rollover and Worker replacement, recovers results, keeps task-first and Timer-first schedules explicit, fails closed on coalesced readiness, fits all maximal sixteen-item topologies, and replays every Run.

**Absent.** Another Activity body, data graph or value type, arbitrary completion expression, partial output, Complex behavior, repeated or nested controllers, compensation, another Boundary Event or Timer form, host-priority semantics, and CIB parallel Multi-Instance compatibility remain outside the exact registered slice.

## Activity data-input User Task

The [Activity data-input mediation proposal](capsules/ACTIVITY-DATA-INPUT-MEDIATION-PROPOSAL.md) is **implemented and awaiting closure review** for one exact required direct Process-`Property`-to-`DataInput` association on one ordinary User Task, with an empty `OutputSet` and no transformation.

**Implemented.** Source admission and lowering accept exactly one required scalar `DataInput`, one `InputSet` referencing it, one empty `OutputSet`, and one `DataInputAssociation` whose `sourceRef` and `targetRef` resolve by object identity rather than by name. Lean and the independently written TypeScript core decide readiness from the committed Process binding alone, treat an explicit null as available and an absent binding as unavailable, copy the value once into a freshly minted Activity-occurrence-owned scope before the task exists, publish exactly that binding as the task's optional input collection, and dispose the scope atomically with the Activity on empty completion. Lean proves evaluator soundness for both transitions, exact copy with Process-binding preservation, single-scope disposal, wrong- and stale-identity refusal, and the absence-versus-null non-law; owner freshness is derived from a family-local bound proved at the initial state and preserved by both transitions rather than assumed at the call site. Three answer-free scenarios agree across Lean, the core, and Temporal, and one real service runs all three on one compiled program through Worker replacement, host termination, terminal receipts, and replay.

**Absent.** Any `DataOutput`, output association or mapping, further `InputSet`, second input, optional or while-executing input, `Assignment`, transformation, `FormalExpression`, `ItemDefinition`, `DataObject`, `DataStore`, collection or nested value, Activity-local mutation while active, later data-ingress command, another Task type or Activity body, boundary Event, loop or Multi-Instance reuse, Sub-Process or Call Activity mapping, form or authorization rule, and any CIB data-mediation claim remain outside this slice. A Process whose source binding is absent stays durably Running; that is a recorded liveness limitation of this profile, not a hidden retry.
