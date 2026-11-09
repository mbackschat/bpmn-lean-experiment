# Multi-Instance semantics

## Status

Adopted kernel owner document (W0 extraction, 2026-11-09). The kernel modules it cites are the executable authority; where they differ, the difference is a defect of one of them.

`Kernel.Feature.MultiInstance` ([Lean](../../../Kernel/Feature/MultiInstance.lean)) owns the guarded type `MultiInstanceMode` and the Multi-Instance body: a token reaching an Activity with Multi-Instance loop characteristics begins the body occurrence, which reads the input collection once, holds one slot per item in `FeatureSlots.multiInstances`, and begins each instance as an ordinary occurrence of the Activity in a scope occurrence of its own. `Kernel.Admission.MultiInstance` ([Lean](../../../Kernel/Admission/MultiInstance.lean)) admits the loop characteristics; `Kernel.Admission.Work` admits the instance's work. `Kernel.Publish.multiInstances` ([Lean](../../../Kernel/Publish.lean)) publishes the open bodies.

## Interpretation

### Entry and generation

- BPMN 2.0.2 §10.3.8, §13.3.7 and Tables 10.29 and 10.30 own the wrapper: the number of instances is evaluated once on entry; a parallel Activity generates every instance together, a sequential one the next only after the previous completes ([SMI account][smi-normative], [PMI account][pmi-normative]).
- The project resolutions of what the standard leaves open: the input collection is read once on entry, in declared order, into an immutable snapshot; the instance counter is zero-based and names the item and the output slot; extraction and update are exact index operations with no coercion or reordering; duplicate items keep multiplicity and distinct identity ([SMI account][smi-normative], [PMI account][pmi-normative], `PMI-ENTER-01` and `SMI-ENTER-01`, `SMI-DATA-01` in [PMI rules][pmi-rules] and [SMI rules][smi-rules]). Each instance holds its item as its input data item.
- An empty collection completes the Activity at once, normally, with an empty output collection and no instance, wait or controller ([SMI account][smi-normative], [PMI account][pmi-normative]).
- The body and its instances number apart: the body's activation is counted under its own role, so the first instance is activation 1 whatever the body entries before it ([row traceability F10](../ROW-TRACEABILITY-MAP.md#lifecycle-fit)).

### Completion and output

- An instance's completion submits exactly its output data item, which fills that instance's slot whatever the completion order; the Activity's output collection, in item order, is written only when every slot is filled (`SMI-ITERATE-01`, `SMI-COMPLETE-01`, `PMI-COMPLETE-01`, `PMI-FINISH-01`). The output collection keeps the form of the input: a String List stays a String List.
- The completion condition is evaluated after each instance completes; a true result before every slot is filled completes the Activity, ends the remaining instances, follows normal control and writes no output collection; a true result on the completion that fills the final slot writes the complete collection (`PMI-EARLY-01`, [PMI account][pmi-normative]). The no-partial-output rule reconciles early completion with the standard's caution that the output collection should not be accessible until all items are written; it is a profile resolution, not a claim about every BPMN implementation. The sequential account left the partial-output question open and excluded the completion condition ([SMI account][smi-normative]); the kernel applies the parallel resolution to both modes, and its selection for the sequential mode is track work of PC-MI-01, listed under the row below.
- Under BPMN the condition is evaluated on every completion, the final one included (`MultiInstanceFinalBody.conditionEveryCompletion`).
- All-complete outcomes are invariant under the order of distinct completion inputs; which instances an early completion ends follows the explicit input order (`PMI-ORDER-01`).
- Wrong, stale, substituted or inactive identities and an output outside the declared item commit nothing (`SMI-REFUSE-01`, `PMI-REFUSE-01`).

### Interruption

- The boundaries of a Multi-Instance Activity belong to its body (BPMN 2.0.2 §13.5.3; CIB `BpmnParse:3291-3295`): an instance arms none, and an interrupting boundary on the body cancels every instance, generates no pending item, writes no output collection and follows only the boundary flow (`SMI-CANCEL-01`, `PMI-TIMER-01`). One deadline covers the whole Activity, not one per instance ([SMI scope][smi-scope]). A raised event's search skips an instance's scope occurrence for boundaries (see [propagation](PROPAGATION-SEMANTICS-SPEC.md)).
- A task completion and the body's Timer aimed at the same committed state are ordered inputs: the first committed wins and the other is stale; a nonfinal completion leaves the Timer's identity and deadline unchanged ([SMI rules][smi-rules]).

### Publication

- `openMultiInstances` is published in every state, as an empty list before entry and after either end, exactly when the program declares a Multi-Instance Activity; other programs omit it ([SMI contract][smi-contract], [PMI contract][pmi-contract]). Each entry carries the body occurrence's identity (process instance, element, activation), its mode, `plannedInstanceCount` (the once-evaluated cardinality), `pendingItemCount`, the Table 10.30 counters `numberOfInstances`, `numberOfActiveInstances` and `numberOfCompletedInstances`, and one entry per active instance with its counter, task identity, input data item and output binding name. `numberOfInstances` counts the instances generated so far, so `plannedInstanceCount = pendingItemCount + numberOfInstances`; the two planned counts are project extensions, not BPMN runtime attributes ([SMI account][smi-normative]). The snapshot and partial slots are never published. The sequential contract also published `numberOfTerminatedInstances` ([SMI contract][smi-contract]); the kernel publishes no terminated count, since a state that keeps a body never holds a terminated instance; whether the count returns with interruption is track work of PC-MI-12, listed under the row below.
- Ended instances are transition facts, never a retained open state: the journal closes each live instance as cancelled, and every generated instance is counted once as a flow-node occurrence (`SMI-OCCURRENCE-01`, [PMI contract][pmi-contract]).

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-AGR-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0011-bounded-collection-driven-sequential-multi-instance-user-task-lifecycle) | Agreement on the sequential User Task lifecycle: ordered turnover, empty-collection closure, one outer Timer, interrupting routing ([SMI CIB][smi-cib]). |
| [CIB-INT-0002](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0002-sequential-multi-instance-nrofinstances-is-desired-cardinality-from-outer-entry) | Classified difference: CIB's sequential `nrOfInstances` is the desired cardinality from entry; the kernel publishes the generated-so-far count and the planned count separately, and no option selects CIB's reading. |
| [CIB-LIM-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-lim-0001-standard-sequential-multi-instance-output-aggregation-is-absent) | Selected by `ProfileOptions.multiInstanceOutputs = none`: no output collection is written; the default `aggregates` is BPMN §13.3.7. |
| [CIB-INT-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0009--on-the-final-multi-instance-completion-sequential-tests-exhaustion-first-and-parallel-tests-the-condition-first) | Selected by `ProfileOptions.multiInstanceFinalBody = modeSpecific`: on the final completion a sequential Activity tests exhaustion first, a parallel one the condition first. |
| [CIB-AGR-0013](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0013--sequential-multi-instance-sub-process-completion), [CIB-AGR-0014](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0014--parallel-repeated-body-completion-and-cancellation) | Candidate agreements for sequential and parallel Multi-Instance Sub-Process bodies; the kernel refuses those bodies (`scope.multiInstance`), so they await PC-MI-04 and PC-MI-05 ([SMIS basis][smis-basis]). |
| [CIB-EXT-0017](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0017--repeated-sub-process-body-local-mapping-and-enclosing-writes), [CIB-EXT-0018](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0018--parallel-body-mappings-and-post-disposal-condition-context) | Candidate extensions for body-local input mappings, nearest enclosing writes and post-disposal condition context; refused today (`multiInstance.mappings`, `scope.multiInstance`), owned by PC-MI-10. |

The parallel User Task account selected no CIB relation; the sequential facts above do not support the parallel or completion-condition account ([PMI CIB][pmi-cib]).

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `multiInstance.cardinality` | cardinality-driven generation | PC-MI-01, PC-MI-06 |
| `multiInstance.collectionExpression` | a collection given by anything but a variable read | PC-MI-07 |
| `expression.outsideSimpleBoolean` | a foreign collection or completion expression | PC-MI-07, PC-MI-09 (JUEL level M5) |
| `multiInstance.completionConditionExpression` | a completion condition outside Simple Boolean | PC-MI-09 |
| `multiInstance.elementVariable` | a CIB element variable | PC-MI-04, PC-MI-10 |
| `multiInstance.mutableCollection` | a sequential re-read of the collection (`CollectionRead.sequentialReread`) | PC-MI-08 |
| `multiInstance.inputDataItem`, `multiInstance.outputDataItem` | a loop without its input or output data item | the instance's input and its single submitted output |
| `multiInstance.mappings` | input or output mappings on a Multi-Instance Activity | PC-MI-10 |
| `activity.multiInstanceBody` | an instance doing anything but a User Task | PC-MI-02, PC-MI-03 |
| `scope.multiInstance` | a Multi-Instance Sub-Process | PC-MI-04, PC-MI-05, PC-MI-06 |
| `activity.compensationHandler` | a compensation handler on a Multi-Instance Activity | PC-COMPENSATION-03 |
| `instance-output-kind`, `undeclared-output`, `output-unavailable` (`rejected`) | an instance completion that is not exactly its output data item, or a non-String into a String List | the slot rule above |
| `multi-instance-collection` (`semanticFailure`) | a collection value that is no list | the run's data |

Superseded first-profile restrictions: the sequential and parallel User Task profiles fixed one Activity, explicit `isSequential` and `behavior="All"`, an exact data-association graph, at most sixteen items of at most 512 bytes in an 8,192-byte collection, one exact completion predicate and exactly one interrupting `PT5S` Timer ([SMI boundary][smi-boundary], [SMI limits][smi-limits], [SMI scope][smi-scope], [PMI scope][pmi-scope], [PMI source][pmi-source]); the Sub-Process accounts bounded operations, simultaneous waits and pending effects per closure and fixed a structured body grammar ([PMIS purpose][pmis-purpose], [PMIS capacities][pmis-capacity], [SMIS scope][smis-scope], [SMIS admission][smis-admission]). The kernel imposes none of these counts or byte bounds; its admission codes above are the restrictions.

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-MI-01 | Cardinality generation; both modes on User Task bodies under the selected CIB result account; the sequential completion condition and its partial-output resolution ([SMI account][smi-normative]). |
| PC-MI-02, PC-MI-03 | Service Task and Call Activity bodies with per-instance effects and called instances. |
| PC-MI-04, PC-MI-05 | Sequential and parallel Multi-Instance Sub-Processes: body quiescence, reset locals, fresh identities, early completion that cancels unfinished bodies after complete body quiescence ([SMIS basis][smis-basis], [PMIS purpose][pmis-purpose]). |
| PC-MI-06 | Cardinality-driven Sub-Process bodies with a fixed total. |
| PC-MI-07 | Typed collection and cardinality expressions (JUEL level M5). |
| PC-MI-08 | Mutable collections: fixed entry total, sequential next-index re-read, rollback when the collection shrinks below the next index; the representation keeps total, binding and current item apart ([SMIS basis][smis-basis]). |
| PC-MI-09 | Typed completion predicates for every body kind; classification of CIB's mode-specific final test (CIB-INT-0009). |
| PC-MI-10 | Body data and result effects with local initialization, completed-body reset and sibling isolation (CIB-EXT-0017, CIB-EXT-0018). |
| PC-MI-11 | Nested and repeated Multi-Instance composition and re-entry through a cycle. |
| PC-MI-12 | Outer interruption and current-body boundaries for every body kind, fencing late results; `numberOfTerminatedInstances` ([SMI contract][smi-contract]). |

## Sources

[smi-boundary]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#implemented-boundary
[smi-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#normative-account-and-selected-resolutions
[smi-limits]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#exact-admitted-source-and-profile-limits
[smi-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#required-optional-and-excluded
[smi-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#public-contract
[smi-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#stable-semantic-rules
[smi-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#cib-seven-relationship-boundary
[pmi-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#normative-account-and-selected-resolutions
[pmi-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#required-optional-and-excluded
[pmi-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#exact-admitted-source-and-profile-contract
[pmi-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#public-contract
[pmi-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#stable-semantic-rules
[pmi-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#cib-seven-relationship-boundary
[pmis-purpose]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#purpose-and-boundary
[pmis-capacity]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#selected-admission-and-host-capacities
[smis-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#normative-and-cib-basis
[smis-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#required-optional-and-excluded-scope
[smis-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#source-and-admission-contract
