# Activity data-input mediation proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and bounded outcome

What is the smallest standards-only data mechanism that makes one ordinary User Task wait for a required Process-scoped value, copies that value into an occurrence-owned Activity input, exposes the selected input to the task consumer, and disposes the local value with the Activity without selecting output mapping or a new Task-specific host effect?

This proposal selects one private executable Process containing a None Start Event, one data-bearing User Task, and one None End Event. The User Task has one required scalar `DataInput`, one `InputSet`, one empty `OutputSet`, and one direct `DataInputAssociation` from one Process-owned `Property`. A present Process binding, including explicit null, activates the User Task and copies the value once. An absent binding leaves the Activity ready at its incoming control place and creates no task, Activity occurrence, or local scope.

The reviewed requirement ID is `BPMN-ACTIVITY-DATA-INPUT-01`. The implemented checkpoint carries it to `supported` for this bounded slice and brings the differential and corpus lanes with it; the production Temporal refinement witness, Product 2 adoption, and governed closure evidence complete the capsule. The broad `BPMN-MECH-DATA-01`, `BPMN-MECH-ACTIVITY-01`, and `BPMN-MECH-TASK-01` families remain unsupported after this bounded checkpoint.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 10.4.1 states that a Property's lifetime is tied to its parent Flow Element and that a Process-owned Property is accessible to the Process's contained elements. Clauses 10.4.1 and 10.4.2 plus Tables 10.57, 10.58, 10.59, 10.61, 10.62, and 10.63 define the Activity data interface, DataInput, DataOutput, InputSet, OutputSet, and Data Association structures. The direct-copy and unavailable-source behavior is specified by the surrounding Clause 10.4.2 prose, not by the Assignment table.

Clause 10.4.2 evaluates InputSets in declaration order when an Activity is ready. If a Data Association source is unavailable, that InputSet is unavailable and the Activity waits. Once the first available InputSet is selected, its associations execute and fill Activity DataInputs before the Activity begins. The standard leaves the time and frequency of later reevaluation outside its scope.

The normative `Semantic.xsd` permits zero `DataOutput` values while requiring at least one `OutputSet`. The selected empty OutputSet therefore means that no data is required to finish this User Task. Completion executes no output association and changes no Process Property.

The machine-readable anchors are `Process-properties`, `Activity-ioSpecification`, `Activity-dataInputAssociations`, `InputOutputSpecification-dataInputs`, `InputOutputSpecification-inputSets`, `InputOutputSpecification-outputSets`, `InputSet-dataInputRefs`, `DataInputAssociation`, `DataAssociation-sourceRef`, and `DataAssociation-targetRef` in `BPMN20.cmof`, together with `tActivity`, `tInputOutputSpecification`, `tInputSet`, `tOutputSet`, and `tDataAssociation` in `Semantic.xsd`.

The standard defines unavailable data but does not define this project's value representation. This profile selects a representation-level interpretation: a missing canonical Process binding is unavailable, while a present binding whose `VariableValue` arm is `null` is available and is copied as explicit null. A present empty string is also available. This distinction does not claim that every BPMN implementation must expose a null value or use the same wire representation.

## Required, optional, and excluded

**Required:** one private executable Process; one Process-owned Property; one ordinary User Task with exactly one incoming and one outgoing Sequence Flow; one `InputOutputSpecification`; exactly one non-optional, non-while-executing scalar DataInput; exactly one InputSet that references that DataInput; exactly one empty OutputSet; exactly one direct DataInputAssociation from the Process Property to the DataInput; no transformation or assignment; and string/null Process-start values within the existing canonical bounds.

**Optional:** the accepted start payload is either empty or contains exactly one canonical binding named `Property_ReviewContext` whose value is a nonempty string, an empty string, or explicit null. Worker replacement and one permitted pre-arming Continue-As-New boundary may be exercised by the refinement witness. The empty payload exists only for the checked unavailable-input witness, with no liveness claim.

**Excluded:** DataOutput, DataOutputAssociation, output mapping, multiple InputSets, multiple inputs, optional or while-executing inputs, Assignments, transformations, FormalExpression, ItemDefinition, DataObject, DataObjectReference, DataStore, DataStoreReference, nested or collection values, Activity-local mutation while active, later availability or reevaluation ingress, another Activity or Task type, boundary Events, looping, Multi-Instance reuse, Sub-Process scope, Call Activity mappings, form schema, field validation, authorization, Tasklist behavior, Product 2 presentation or browser changes, Script Task, Business Rule Task, Send Task, Service Task effects, DMN, JUEL, scripts, outbound transport, CIB compatibility, and general BPMN Process Execution Conformance.

Input readiness, input copying, and Activity-local lifetime form one proposition because the copied value is what makes the Activity active and the same occurrence owns it. Output-set selection and output mediation are a different lifecycle boundary and require a separate capsule. Selecting an executable Task host is also separate because language, decision, message, or effect execution must not define the standard data mechanism.

## Exact source and profile contract

The proposed profile ID is `bpmn-2.0.2-activity-data-input-user-task-draft`. Its authority is BPMN 2.0.2, not CIB Seven or a downstream product fixture.

The exact source contains one Process Property `Property_ReviewContext`; one User Task `UserTask_Review`; one DataInput `DataInput_ReviewContext`; one InputSet `InputSet_Review` whose sole `dataInputRefs` entry resolves to that DataInput; one empty OutputSet `OutputSet_Review`; and one DataInputAssociation `DataInputAssociation_ReviewContext` whose sole `sourceRef` resolves to the Process Property and whose `targetRef` resolves to the DataInput. The Property and DataInput omit `itemSubjectRef` and use no DataState. The DataInput is scalar by its machine-readable default `isCollection = false`; Property has no corresponding collection field, so this profile separately restricts its untyped binding to the selected string/null representation. The InputSet has no optional, while-executing, or OutputSet references. The OutputSet has no data, optional, while-executing, or InputSet references.

Source admission resolves every ID reference against the exact parser graph, verifies that the Property is owned by the User Task's containing Process, and rejects foreign ownership, a second source, an unresolved target, reverse association direction, an extra input or set, any association assignment or transformation, and any unprojected executable child. Raw moddle objects stay inside `@bpmn-lean/bpmn-source`.

The checked graph adds a distinct `dataInputUserTask` node rather than an optional flag on the existing plain User Task. It carries the exact task identity and name plus one reusable `DirectActivityDataInput` value containing the association ID, source Process Property ID, target DataInput ID, and target DataInput name. The checked Process need not retain a second general Property catalog because this checkpoint admits only the Property resolved by the one association.

Lowering adds a distinct `awaitDataInputUserTask` Semantic Process operation carrying the same direct-input value, the incoming and outgoing control places, source provenance, and the existing task identity/name. A new operation arm is preferred to an optional field because plain readiness and data-dependent readiness have different enabledness and RuntimeState effects. The shared direct-input contract is Task-neutral so later reviewed Task operations may reuse its value shape without reusing this User Task transition.

Implementation must classify `awaitDataInputUserTask` as `compositeWaitAndActivityArming` in the implemented checkpoint's exhaustive TypeScript and Lean declarer censuses, not as ordinary wait arming. Current footprint derivation remains unavailable for this operation, so it cannot enter an independent batch and any frontier containing it fails closed under the checkpoint rule. An adversarial test must lock that boundary. A complete footprint belongs to the queued final commutation closure and requires the reviewed composite preparation, independent-frame, raw-state commutation, and publication laws before it may become batchable. That later footprint reads but does not write the source Process binding, so another read of that binding is permitted; a write to the binding conflicts. The future predicate separator must accept read/read overlap and reject write/read overlap, while the current checkpoint must reject the composite operation before successor selection.

## Runtime, command, stable-state, and observation contract

When `awaitDataInputUserTask` owns the incoming token, the evaluator looks up the exact source Property ID in Process scope. Zero matches means unavailable and produces no transition. Exactly one present binding means available, including explicit null, and atomically:

- consumes one incoming token;
- mints the next User Task occurrence and a distinct Activity occurrence;
- creates one User Task wait whose body belongs to that Activity occurrence;
- creates one Activity-local binding named by the target DataInput ID and containing an exact clone of the Process value;
- leaves the Process binding unchanged; and
- publishes the ordinary committed transition and started flow-node lifecycle facts.

The current effect-owned `ActivityVariableScope` is not silently reinterpreted as a general Activity scope. Runtime data replaces its owner with a closed discriminated `LocalDataOwner`: an `effectOccurrence` arm preserves every existing effect scope, while an `activityOccurrence` arm uses the distinct `ActivityOccurrenceId` for the new standard Activity scope. The collection remains one canonical local-scope representation, ordered first by owner discriminator and then by complete owner identity. No effect occurrence becomes substitutable for an Activity occurrence.

A data-bearing ordinary User Task receives an `ActivityOccurrence` record even without an attached handler because its admitted program gives it occurrence-owned state beyond the task wait. The record uses the existing singular User Task body and an empty attached-Timer list. Plain ordinary User Tasks still create no Activity record. The existing Activity issuing discipline and body-claim uniqueness rule apply to the new writer.

The public `OpenUserTask` contract gains `inputs?: readonly [VariableBinding]`, represented in JSON as a one-element array for this profile. A data-bearing User Task must publish exactly one canonically ordered binding in that collection; every existing profile must omit the field. The collection shape permits a later reviewed profile to widen admission to multiple inputs without replacing the public representation. This is an engine observation of selected BPMN DataInput state, not a form schema or authorization contract. General Activity-local variables remain private, and the Process-variable observation continues to expose only Process scope.

The existing `startProcess.initialVariables` ingress seeds the selected Process Property by exact Property ID. This profile accepts exactly `[]` or one canonical binding named `Property_ReviewContext`; every foreign name, extra binding, duplicate, unsupported value arm, or noncanonical payload refuses without mutation. No undeclared Process binding is retained or observed, and no new data-update command is added.

The existing content-bound `completeUserTaskInstance` command addresses the exact task occurrence and must carry an empty submitted-values list in this profile. Accepted completion atomically removes the task wait, its exact Activity-local scope, and its Activity record, adds one outgoing token, and leaves the Process Property unchanged. A wrong or stale task identity, a missing or duplicate local owner, a mismatched Activity body, or any submitted value refuses without mutation. Removing the local-scope collection entry is the project's bounded operational representation of disposing this no-output, no-compensation Activity context; it is not asserted as a machine-readable BPMN cardinality.

The missing-input stable state is Running with the incoming token retained, no open User Task, no Activity record, no local scope, no enabled external interaction for this Activity, and no started flow-node occurrence. The proposal makes no progress or fairness claim for a Process whose only required source remains unavailable and supplies no later-availability ingress.

## Stable semantic rules and separating witnesses

- `ADINPUT-READY-01`: the data-bearing User Task can enter Active only when its one required direct source binding is present in Process scope.
- `ADINPUT-COPY-01`: activation copies the present Process value exactly once into the target DataInput of the newly minted Activity occurrence and preserves the Process binding.
- `ADINPUT-NULL-01`: explicit null is a present available value; absence is unavailable, so the two states are not aliases.
- `ADINPUT-SCOPE-01`: the local binding exists exactly while its owning Activity occurrence is live and is neither Process-owned nor effect-occurrence-owned.
- `ADINPUT-COMPLETE-01`: completing the exact active task with no submitted values removes the task, local scope, and Activity record atomically, preserves Process data, and follows the sole outgoing flow.
- `ADINPUT-REFUSE-01`: missing, duplicate, substituted, stale, or structurally inconsistent input, task, Activity, or scope ownership yields no committed change.
- `ADINPUT-OBSERVE-01`: the active task publishes exactly its one-element selected-input collection, while no other Activity-local state enters public observation.

The smallest positive starts `Property_ReviewContext` with string `invoice-4711`, reaches one open task whose input collection is `[DataInput_ReviewContext = invoice-4711]`, completes it with no submitted value, observes the Process Property unchanged, and reaches the None End.

The primary negative uses the same Process and start command with the Property absent. The Process remains at the task's incoming control place with no open task or Activity-local state. The discriminator starts the Property as explicit null: that Process must instead activate the task and publish one explicit-null input. Any implementation that checks truthiness, erases null, copies by descriptive name, or activates before association execution fails this pair.

The ownership negative inserts an effect-owned local scope whose process, element, and activation coordinate values match the new Activity occurrence after mapping `elementId` to `activityElementId`. It must neither satisfy the Activity input lookup nor be removed by task completion. This separates the proposed discriminated owner from an unsafe value-coordinate alias while preserving the deliberately different identity structures.

The useful quantified laws are exact Process-binding preservation across activation and completion, local-scope uniqueness by discriminated complete owner identity, Activity-record/task/scope join preservation, and stale-completion state preservation. The checked non-law is `absent input = explicit null`: the two pre-states have different enabledness and different stable observations.

## Lean assurance lane

The Lean lane is **proved** for this bounded transition family. It adds a declarative activation relation, a declarative completion relation, separately executable evaluator clauses, and a soundness bridge for each evaluator-produced arm.

The required theorems establish absent-source refusal with exact state preservation; present string and present null activation; exact-copy and Process-binding preservation; fresh Activity and task issuance; local-owner uniqueness and the Activity/task/scope ownership join; completion cleanup and outgoing-route preservation; wrong and stale identity refusal; runtime-state invariant preservation for both successful transitions; and the absence-versus-null non-law.

Finite fixture evaluation may witness the three concrete values but may not replace the quantified preservation and refusal laws. The first build of any module adding kernel-decided fixtures stays with the root under the repository memory bound.

## CIB Seven relationship boundary

No CIB relationship is selected *for this mechanism*. BPMN defines the direct-copy and unavailable-input rules, the source needs no `camunda:*` extension, no CIB compatibility claim is made, and the selected host result does not depend on CIB configuration. The profile artifact still names `CIB-AGR-0001` and `CIB-OP-0001` because every profile must name its reviewed relationship IDs, and those two cover only the reused User Task lifecycle this profile inherits. The external CIB invoice examples provide independent whole-model demand for Data Associations but use DataStoreReference and remain outside this exact source profile. Their shape does not authorize a project DataStore interpretation.

The retained project-owned consumer is a real-world invoice-review model whose Process start supplies an invoice summary Property and whose reviewer task receives it through the standard DataInput. The broader CIB fixture counts show that User Task is already a high-reach Task family, but they do not prove this data semantics.

## Temporal hosting and refinement preflight

Durable ingress remains the existing content-bound Process-start command and exact User Task completion Update. The start payload already carries canonical initial variables into committed semantic Process scope. No Signal, Timer, Temporal Activity, Child Workflow, Worker-side expression evaluator, outbound transport, or new acknowledgement protocol is introduced.

The pure semantic core alone decides whether the source Property is present, whether the User Task becomes active, which exact value is copied, and whether completion removes the local scope. Temporal stores the complete committed Program and RuntimeState and schedules the already-published task interaction. A downstream consumer may read the published input collection through the engine contract but may not fill a missing source, reinterpret null, or choose an InputSet.

The Workflow's one semantic state-mutator loop preserves command serialization and FIFO accepted-input order. Duplicate Process-start requests retain the existing content-bound start identity behavior. Duplicate or stale completion Updates retain semantic refusal and existing terminal-result recovery. Transport retry and Update delivery never become BPMN data availability facts.

This profile defines no BPMN semantic cancellation command, cancellation handler, or semantic-failure transition. Temporal Workflow cancellation and non-retryable Workflow failure remain host outcomes: they do not invoke semantic cleanup, mutate the last committed RuntimeState, publish a completed or cancelled BPMN Activity occurrence, or synthesize output. An accepted Update still receives the Workflow's terminal failure through the existing accepted-Update resolution contract, and a later start or completion request follows the existing host-terminal result/recovery behavior rather than creating a BPMN transition. The refinement lane must retain a failure/cancellation witness that proves no Activity-local disposal or lifecycle publication is fabricated after the last committed semantic state.

The missing-input state requires no host wakeup because this capsule admits no later data-ingress command. It may remain durably Running and unproductive. This is an explicit liveness limitation, not a hidden polling loop. A later reevaluation capability must introduce its own durable ingress, ordering, deduplication, and replay account.

Query and Product 1 publication derive the optional task-input collection only from committed semantic state. Product 2 may copy that published field through its strict nonvisual contract but may not reconstruct it from start payloads or definition XML. Visibility and Temporal Event History remain non-authoritative. Any future UI or browser presentation is a separate Product 2 increment that first completes the source-grounded design preflight.

The smallest live-history refinement witness starts the invoice-review model with a non-null summary, reaches one task with the exact one-element input collection, replaces the Worker, completes the task, obtains the terminal receipt, and replays every Run. A second direct-VM witness starts explicit null and distinguishes it from an absent source. The nearest adapter counterexample schedules a task from the source XML before the semantic core copies the binding, exposing an open task with no input collection; exact Query and replay evidence must reject it.

No Continue-As-New boundary may split the atomic activation transition. A permitted pre-arming rollover carries the exact Process Property and incoming token; after rollover the core performs the same copy. Carried state must preserve the discriminated local owner, Activity record, task wait, and input value together once the task is active.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative input availability and direct copy | BPMN 2.0.2 Clauses 10.4.1 and 10.4.2, Tables 10.57, 10.58, 10.59, 10.61, 10.62, and 10.63, the direct-copy and unavailable-source prose, and the pinned CMOF/XSD anchors; no CIB semantic vote |
| Exact source and profile admission | Source compiler tests with independently authored checked-graph expectations, old-profile refusal, malformed ownership/reference/set mutations, and exact artifact schemas |
| Declarative meaning and laws | Lean activation and completion relations, evaluator-soundness bridges, quantified state-preservation and refusal laws, and the absent/null non-law |
| TypeScript realization | Separately written readiness, copy, ownership, completion, and one-element input-collection observation logic plus focused state-preservation and negative tests; the commutation census admits the composite declarer while a focused test proves its checkpoint footprint remains unavailable |
| Cross-language behavior | Answer-free present-string, present-null, and absent-source scenarios compared through exact canonical results without giving either runner an expected answer |
| Runtime ownership | Activity writer census, body-claim invariant, local-owner discriminator mutation, runtime-state well-formedness, and collection-removal completeness |
| Durable refinement | Real-service Worker-replacement, terminal receipt, exact Query input collection, and every-Run replay plus a direct-VM absence/null discriminator |
| Whole-model reach | One project-owned invoice-review model, exact pipeline binding, capability/restriction row, generated corpus map, and Product 2 About-page disclosure |
| Product 2 compatibility | Strict optional input-collection decoding and copied-contract tests only; no presentation or browser claim |

Required mutations remove the Process binding, replace explicit null with absence, look up the Property by name instead of ID, reverse the association, accept two sourceRefs without transformation, activate before copying, copy into Process scope instead of Activity scope, key the local scope by an effect identity, omit the Activity record, preserve the local scope after completion, delete the Process binding, accept nonempty completion values, omit the public input collection, reconstruct the input collection in Product 2, or drop the input collection across Worker replacement or Continue-As-New.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| `LocalDataOwner.activityOccurrence` | Minted by the semantic activation from the next Activity counter and the exact containing scope | Never projected directly | Names exactly one live Activity record and cannot alias the effect-owner arm |
| Activity-local input scope | Direct copy from the selected Process Property into the target DataInput | Only its one-element selected-input collection appears as `OpenUserTask.inputs` | Created with the Activity and removed atomically with it |
| Data-bearing Activity record | Program-selected because the ordinary User Task owns local data beyond its wait | Its identity contributes only to existing Activity lifecycle publication | Owns the exact task body and local scope; no attached Timer exists |
| Ready representation | Incoming control token plus unavailable source | Existing control position only | No task, Activity record, or local scope exists before availability |

The BPMN layer owns readiness, direct copy before activation, and the Activity completion boundary. The selected profile and runtime account own the occurrence-local storage representation and its disposal on normal completion, as well as the exact source graph, Property-ID binding, value subset, and absence/null representation. Lean and TypeScript independently realize the same reviewed account. Temporal owns durability and delivery only. Product 2 strictly decodes the published input collection and adds no semantic or presentation rule in this increment.

The invoice-review source is a retained business-purpose model and Product 2 copied-contract witness. It is not a model-specific semantic implementation. The reusable mechanism is the direct Activity input contract and its occurrence-owned runtime lifecycle.

## Versioning consequences

This is a pre-release additive profile plus an atomic current-contract replacement. The implementation adds one profile artifact, checked-node arm, Semantic Process operation arm, discriminated local-owner arm, profile-gated optional task-input observation, schemas, Lean and TypeScript cases, source reader, scenarios, retained model, pipeline entries, adapter projection, Product 2 strict decoder, and documentation maps in one complete checkpoint. No compatibility reader, version switch, parallel RuntimeState shape, or retained old/current decoder is permitted under the [contract evolution policy](../../contracts/README.md#evolution-policy) and [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy).

Old profiles must keep byte-identical source-independent Programs and observations with `inputs` absent. Existing effect scopes keep their semantic owner through the `effectOccurrence` discriminator, and every producer, consumer, fixture, ordering comparator, well-formedness check, footprint, continuation codec, schema, and replay witness moves atomically to the discriminated owner representation.

The executable constraints mechanically resolved by `node scripts/what-binds.ts` include [schema coverage](../../scripts/contract-schema-coverage.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [Activity occurrence writer census](../../scripts/activity-occurrence-writer-census.test.ts), [runtime collection removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [model-corpus policy](../../scripts/bpmn-corpus-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and the [Workflow occurrence authority guard](../../scripts/workflow-occurrence-semantic-authority.test.ts). Focused oracles are the source compiler, semantic-core, Lean semantic, contract, differential pipeline, Temporal, model-corpus, and Product 2 strict-contract gates selected by [the testing specification](../TESTING-SPEC.md#focused-gate-matrix).

### Owners this implementation grows

The `OWNER` measurements below are the current nonblank counts reported by `node scripts/what-binds.ts`, refreshed as the implementation grows each owner. Implementation reruns `node scripts/what-binds.ts` before growing any owner. The 800-line soft target is the extraction threshold and 1,200 lines is the hard ceiling.

| Owner | Current headroom |
|---|---:|
| [Lean ProfileAdmission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 138 |
| [Lean SemanticProcessContract](../../BpmnSemantics/SemanticProcessContract.lean) | 190 |
| [TypeScript source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 225 |
| [TypeScript scenario projection](../../packages/semantic-core/src/scenario.ts) | 252 |
| [TypeScript Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 322 |
| [TypeScript checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts) | 505 |
| [TypeScript RuntimeState contract](../../packages/semantic-core/src/semantic-process-state.ts) | 384 |
| [TypeScript public contract](../../packages/semantic-core/src/contract.ts) | 398 |
| [TypeScript scoped-data owner](../../packages/semantic-core/src/semantic-process-data.ts) | 536 |
| [TypeScript checked element projection](../../packages/bpmn-source/src/checked-element-projection.ts) | 358 |
| [TypeScript projected-key owner](../../packages/bpmn-source/src/projected-flow-element-keys.ts) | 464 |
| [TypeScript compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 526 |

`ProfileAdmission.lean` is the narrowest owner. If the exhaustive profile arm cannot fit cohesively in the headroom recorded above, extract the profile-specific rule before semantic implementation. `SemanticProcessContract.lean` receives only the reusable value and operation arm, source lowering delegates parsing to a new owner, scenario projection delegates the task-input projection if its complete addition reaches the soft target, and the RuntimeState contract receives only the owner-discriminator shape. New source, runtime, proof, and conformance modules hold behavior by responsibility.

No size exception is requested.

Same-change owners are this proposal, the [scoped-data specification](SCOPED-DATA-SPEC.md), [Activity occurrence ownership](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md), the [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), the [internal commutation proposal](../INTERNAL-COMMUTATION-PROPOSAL.md), the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), all applicable detail maps routed by [`implementation-status-router`](../IMPLEMENTATION-MAP.md), the semantic-core and source registries, the Lean module graph, the contract registry, model-corpus registry and generated map, capability disclosure, Product 2 About-page disclosure, capsule cost ledger, and [PLAN](../PLAN.md).

## Epistemic closure and reopen conditions

At proposal stage, established are the normative direct-copy and unavailable-source rules, the exact machine-readable source cardinalities, independent whole-model demand, the current representation gap, and Temporal feasibility using existing ingress and task completion. No implementation, support, cross-language agreement, durable refinement, or Product 2 readiness claim exists yet.

The nearest unsupported claim is one DataOutput and DataOutputAssociation copying a completed Activity value back to Process scope. The principal common-mode risk is that source, Lean, TypeScript, and Temporal all share the proposal's chosen absence/null representation. The normative unavailable-source text, explicit null discriminator, strict wire mutations, and independent source graph constrain but do not eliminate that risk.

The nearest realistic counterexample starts with explicit null, activates no task because the implementation uses a truthiness check, then later exposes the Process value through another surface. It would make present data behave as unavailable and leave the Process durably stuck despite a valid source. The second counterexample removes the task but retains its local scope, causing the next activation to observe or collide with retired data.

Reopen before adding another input or InputSet, selecting optional or while-executing input behavior, adding reevaluation ingress, changing the null interpretation, adding output mediation, choosing an ItemDefinition or external type system, extending the value domain, exposing general Activity-local variables, reusing the mechanism for another Task or Event, selecting a CIB relationship, changing owner discrimination, or changing the Temporal rollover boundary.

Closure requires a commit-bounded cost row compared with the nearest scoped-data or User Task data increment, exact established and unsupported status in every routed map, meaningful mutations listed above, a clean complete gate, the conditional semantic-checkpoint review, and governed closure review. Proposal approval alone authorizes none of those claims.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `3332a92f` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
