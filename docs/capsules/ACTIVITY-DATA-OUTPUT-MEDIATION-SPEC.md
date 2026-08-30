# Activity data-output mediation specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and bounded outcome

What is the smallest standards-only data mechanism that lets one ordinary User Task declare a produced value, fill it from the completion command, and copy it into Process scope through a declared Data Association, without selecting expressions, optional or while-executing outputs, multiple OutputSets, or a new Task host?

This capsule owns one implemented private executable Process containing a None Start Event, one data-bearing User Task, and one None End Event. The User Task carries one required scalar `DataOutput`, one `OutputSet` referencing exactly it, one empty `InputSet`, and one direct `DataOutputAssociation` from that `DataOutput` to one Process-owned `Property`. Completion supplies exactly that one output by its `DataOutput` id; the association decides which Property receives it.

This is the write-back half of the closed [Activity data-input mediation specification](ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md), which named it as the nearest unsupported claim. The reviewed requirement ID is `BPMN-ACTIVITY-DATA-OUTPUT-01`. Its requirement-ledger disposition is `supported` only for this exact bounded slice; the broad `BPMN-MECH-DATA-01`, `BPMN-MECH-ACTIVITY-01`, and `BPMN-MECH-TASK-01` families remain `unsupported`.

## Normative account and selected interpretation

Clause 10.4.2 states the write-back proposition directly: "When an **Activity** finishes execution, all **Data Associations** whose sources are any of the **Data Outputs** of the OutputSet are executed. These executions copy the values from the **Data Outputs** back to the container's context (**Data Object**, Properties, etc.)." Properties are therefore a named legitimate target, symmetric with the Process `Property` the input capsule reads.

Clause 13.3.2 gives the operational rule: on completion "a data OutputSet of the **Activity** is selected as follows. All OutputSets are checked for availability in order. An OutputSet is available if all its REQUIRED **Data Outputs** are available. A data output is REQUIRED by an OutputSet if it is not optional in that OutputSet. If the data OutputSet is available, data is pushed into the context of the **Activity** by triggering the output **Data Associations** of all its data outputs. Further OutputSets are not evaluated. If the data OutputSet is not available, the next data OutputSet is checked. If no OutputSet is available, a runtime exception is thrown."

Clause 10.4.2 also fixes the surrounding structure. An `InputOutputSpecification` "MUST define at least OutputSet element"; an OutputSet "MAY reference zero or more DataOutput elements"; and an empty OutputSet "signifies that the **ACTIVITY** produces no data", which is the meaning the input capsule already locked and this proposal must not disturb. Clause 10.4.2 additionally leaves selection to the implementation: "The implementation of the element where the OutputSet is defined determines the OutputSet that will be produced."

The machine-readable anchors are `InputOutputSpecification-dataOutputs` (`lower="0"`, `upper="*"`), `InputOutputSpecification-outputSets` and `InputOutputSpecification-inputSets` (both `upper="*"` with no lower bound stated and therefore `1`, which is what makes the required empty InputSet mandatory rather than a project choice), `OutputSet-dataOutputRefs` (`lower="0"`), `Activity-dataOutputAssociations` (`lower="0"`), `OutputSet-optionalOutputRefs`, `OutputSet-whileExecutingOutputRefs`, `OutputSet-inputSetRefs`, `InputSet-outputSetRefs`, `DataOutput-isCollection` (`default="false"`), and `DataAssociation-sourceRef`/`targetRef`, together with `tOutputSet`, `tDataOutput`, and `tDataAssociation` in `Semantic.xsd`.

**Recorded prose inconsistency.** Clause 10.4.2 says the outputs are copied "back to the container's context", while Clause 13.3.2 says "data is pushed into the context of the **Activity**". Read literally these name different destinations, and only the first is coherent with a Data Association whose `targetRef` is a Process-owned `Property`. This proposal follows Clause 10.4.2 and treats the Clause 13.3.2 phrase as loose wording for the Activity's containing context. Clause 13.3.2 itself supports that resolution twice: its input-side bullet names "the elements of the context such as **Data Objects** or Properties", and its input-side passage defers outright, "Please refer to 10.4.2 on page 224 for a description of the execution semantics for **Data Associations**." The disagreement is a BPMN prose-to-prose inconsistency for [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) to carry; it is not a CIB relationship and selects no vendor behavior.

**Selected interpretation of an unavailable required output.** Clause 13.3.2 throws a runtime exception when no OutputSet is available. In this bounded slice there is exactly one OutputSet, one required output, and no optional outputs, so availability is decided entirely by whether the completion command carries that output. Clause 13.3.2's conditional IORule check does not arise: "IORule" appears nowhere in `BPMN20.cmof` or `Semantic.xsd`, and Clause 10.4.1's `outputSetRefs` table records that the pairing with `inputSetRefs` "replaces the IORules attribute for **Activities** in **BPMN** 1.2". IORules is a BPMN 1.2 legacy attribute that 2.0 replaced, so no conforming 2.0 document can carry one. A command that omits it is malformed for this profile rather than a process reaching a genuine runtime condition, so this profile **refuses** the completion with exact state preservation instead of producing a semantic failure. This is a bounded restriction, not a claim about Clause 13.3.2: a profile that later admits optional outputs, several OutputSets, or while-executing outputs makes unavailability a real runtime condition and must revisit the outcome class before reusing this rule.

## Required, optional, and excluded

**Required:** one private executable Process; one Process-owned `Property` as the association target; one ordinary User Task with exactly one incoming and one outgoing Sequence Flow; one `InputOutputSpecification`; exactly one non-optional, non-while-executing, non-collection scalar `DataOutput`; exactly one `OutputSet` referencing exactly that `DataOutput`; exactly one empty `InputSet`; exactly one direct `DataOutputAssociation` whose `sourceRef` is that `DataOutput` and whose `targetRef` is that `Property`; no transformation or assignment; and string/null values within the existing canonical bounds.

**Optional:** none. Every listed element is required, and a source omitting or duplicating any of them is refused.

**Excluded:** `DataInput`, `DataInputAssociation`, and input mediation, which the [input capsule](ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) owns; more than one `DataOutput`; more than one `OutputSet`; `optionalOutputRefs`; `whileExecutingOutputRefs`; `isCollection`; the `InputSet`/`OutputSet` pairing associations `OutputSet-inputSetRefs` and `InputSet-outputSetRefs`; `Assignment`; `transformation`; `FormalExpression`; `ItemDefinition`; `DataObject`; `DataObjectReference`; `DataStore`; `DataStoreReference`; nested or collection values; catch-Event data outputs, which Clause 10.4.2 fills from the triggering element and explicitly defines no OutputSets for; output during execution; another Activity or Task type; boundary Events; looping; Multi-Instance reuse; Sub-Process scope; Call Activity mappings; form schema; field validation; authorization; Tasklist behavior; Product 2 presentation or browser changes; Script, Business Rule, Send, and Service Task effects; DMN; JUEL; scripts; outbound transport; CIB compatibility; and general BPMN Process Execution Conformance.

## Competing accounts and the account this proposal selects

Two accounts produce identical public observations for this slice, so the choice must be made on forward compatibility rather than on evidence.

**Account A — routed write.** The completion command's submitted binding is matched to the declared `DataOutput` by id, and the association is used as a routing table to write the value into the target Property in one step. The `DataOutput` has no runtime existence; it is a compile-time name.

**Account B — materialize then copy.** Completion writes the submitted value into the Activity-occurrence-owned local scope under the `DataOutput` id, the association then copies it from there into Process scope, and the local scope is disposed. All three happen inside one atomic transition.

No public witness separates them, and same-transition disposal is not what establishes that. Under Account B an *empty* local scope exists across the whole open-task window, which Account A never creates, so a reason resting only on the value's lifetime would be incomplete. Two facts make the difference invisible. [`projectSelectedTaskInputs`](../../packages/semantic-core/src/activity-data-input-observation.ts) answers absence for an empty scope, so the extra scope publishes nothing; and canonical observations are taken only at stable states after a whole stimulus, so no observation is ever taken inside the completing transition where the filled scope briefly exists.

This proposal selects **Account B**, and the justification is forward compatibility rather than discrimination. `whileExecutingOutputRefs`, several outputs filled by different means, and Multi-Instance all need the output to exist in the occurrence before the Activity ends. Clause 13.3.7 states the Multi-Instance case in almost exactly Account B's terms: "Each _instance_ processes the data value of its DataInput. It produces a value in its DataOutput if it completes successfully. The DataOutPut value of the _instance_ is passed to a corresponding outputDataItem in the outer **Activity**, where a DataOutputAssociation links both." An inner instance's output therefore exists as instance-scoped data before it is associated outward, which Account A cannot represent at all. Account A cannot express any of them without being replaced, and [the forward-compatible restriction rule](../../CLAUDE.md#forward-compatible-semantic-restrictions) requires verifying before approval that later coverage can broaden the representation rather than invalidate it. Account B also reuses the discriminated `activityOccurrence` local owner the input capsule already established, so it adds a consumer to an existing representation instead of a second one.

What this slice installs of Account B is its **representation**, not a two-step write. The occurrence-owned scope is armed empty at entry and disposed empty at completion, and the accepted completion fuses the fill with the association: the submitted value reaches Process scope under the associated Property's id without ever being materialized in the local scope. Materialization becomes a real step only when a construct must read an output between its production and its copy, which is exactly the `whileExecutingOutputRefs`, several-outputs, and Multi-Instance coverage this selection exists to keep reachable. Writing the value into the scope and removing it in the same transition would be dead state today, so no target does it.

Account B carries one obligation on a sibling capsule that is recorded here rather than discovered later. One Activity occurrence owns exactly one local scope, so a future while-executing output would share the scope the input capsule's publication reads, and [`projectSelectedTaskInputs`](../../packages/semantic-core/src/activity-data-input-observation.ts) answers absence for any cardinality other than exactly one. A while-executing output written while the task is still open would make a two-binding scope stable and silently withdraw `ADINPUT-OBSERVE-01`'s published collection. No model admitted today is affected, because an input-only Activity keeps one binding, so this does not violate [the forward-compatible restriction rule](../../CLAUDE.md#forward-compatible-semantic-restrictions); it is an obligation attached to the very construct that justifies Account B.

That both accounts agree publicly is itself recorded as this capsule's principal common-mode risk, because it means no lane can catch a wrong choice here. A second, narrower one is that Lean and TypeScript realize the same reviewed account while the differential lane compares canonical results only; because the local scope never reaches canonical output, a shared misunderstanding of its lifetime would be invisible there. The Activity-writer census and runtime-collection-removal guards, not the differential lane, are what cover it.

A third is structural and belongs to the source lane alone. The reader carries the model's own ids into the checked node, so the positive compiler assertions hold whichever end a defective reader resolved them from and cannot discriminate direction, cardinality, or reference resolution. That lane's whole discriminating power is its refusal cases, and those refuse through one whole-model exact match: they fix the exclusion boundary and are not independent per-feature rules, so a reader must not infer that removing one feature check would let exactly one of them through.

## Exact source and profile contract

The admitted graph is one Process carrying one `Property`, one User Task carrying one `ioSpecification` with one `dataOutput`, one `outputSet` whose `dataOutputRefs` is exactly that output, one empty `inputSet`, and one `dataOutputAssociation` on the same User Task. `sourceRef` and `targetRef` resolve by object identity in the parser graph, never by name, exactly as the input capsule's reader does. `DataOutput-name` carries `lower="0"` in the CMOF, so a `name` may be present or absent; this profile matches the submitted binding to the `DataOutput` `id` alone and **ignores** any `name`, which keeps a renamed output from silently changing the completion contract. A source is not refused for carrying a `name`.

The profile is registered as `bpmn-2.0.2-activity-data-output-user-task-draft`. It lowers to one `dataOutputUserTask` checked node and one `awaitDataOutputUserTask` operation. Registered scenarios cover a supplied string, a supplied explicit null, and a completion that omits the required output.

Old profiles keep byte-identical Programs and observations. This profile publishes no `openUserTasks[].inputs` key, because it declares no input.

## Runtime, command, stable-state, and observation contract

Activation is data-independent: the User Task becomes active when its incoming token arrives, because an OutputSet constrains completion rather than entry. This is the exact asymmetry with the input capsule, where readiness depends on committed Process data, and it is why the two halves are separate capsules rather than one.

The existing content-bound `completeUserTaskInstance` command addresses the exact occurrence and must carry exactly one submitted binding whose `name` is the declared `DataOutput` id. A completion carrying zero bindings, more than one, or a binding naming anything else is refused with exact state preservation.

Accepted completion atomically resolves the submitted binding by the `DataOutput` id, executes the association to bind the target Property in Process scope, removes the Activity-occurrence-owned local scope, removes the Activity record, removes the task wait, and adds one outgoing token. The fill and the association are one step, so the local scope is disposed exactly as empty as it was armed. No intermediate state is committed, so disposal never becomes observable. Disposal uses the Activity-keyed [`removeActivityOccurrenceVariableScope`](../../BpmnSemantics/SemanticProcess/Data.lean); the effect-keyed `completeActivityVariableScope` belongs to the effect family and is untouched.

The public observation change is confined to canonical `variables`: the target Property appears or changes value. No new observation field is added.

## Stable semantic rules and separating witnesses

| Rule | Statement | Implemented evidence |
|---|---|---|
| `ADOUTPUT-ENTRY-01` | A declared OutputSet never constrains Activity entry; the task activates on its incoming token alone | Lean `dataOutputTokenAloneActivates` and `dataOutputActivationArmsOneEmptyLocalScope`; the checked witnesses `tokenAloneActivatesWithNoProcessBinding` and `activationArmsOneEmptyActivityScope`; the core's `a declared OutputSet never delays entry` case; every registered scenario starting with no Process data |
| `ADOUTPUT-FILL-01` | Completion fills the declared `DataOutput` by its exact id, and a submitted name that is not that id is refused | Lean `dataOutputWrongSubmissionRefusesFill` and the checked `submissionUnderTheTargetNameIsRefused` and `extraSubmittedOutputIsRefused`; the core's refusal cases; the `activity-data-output-omitted` pipeline case |
| `ADOUTPUT-ROUTE-01` | The `DataOutputAssociation`, not the submitted name, decides which Process `Property` receives the value | Lean `dataOutputCompletionWritesTheAssociatedProperty` and the checked `completionWritesTheAssociatedPropertyOnly` and `declaredOutputAndAssociatedPropertyAreDistinct`; the checked `mergedOutputAndPropertyIdentityIsStructurallyRejected` and the core's independently written refusal of the same merged program, which is where the equal-id counterexample is decidable at all; the `namePropertyAfterItsSource` seeded mutation; the real-service witness reading the published canonical trace |
| `ADOUTPUT-ATOMIC-01` | The fill and the association it feeds, local-scope disposal, record removal, and token production are one atomic transition, and the fill is not separately committed | Lean `dataOutputCompletionDisposesOneLocalScope` and `completeDataOutputUserTask_activity_identity_discipline`; the checked `completionDisposesTaskRecordAndScopeTogether`; the core's one-transition case; the Activity-occurrence writer census rows |
| `ADOUTPUT-REQUIRE-01` | A completion that does not make the single required output available is refused with exact state preservation. Availability is degenerate in this slice: it is decided entirely by command shape, so this rule and `ADOUTPUT-FILL-01` fail together and count as one evidence lane rather than two | Lean `dataOutputUnavailableRequiredOutputRefusesCompletion` and the checked `omittedRequiredOutputIsRefused`; the `writeTheRefusedOutput` seeded mutation; the real-service refusal-and-termination witness |

The decisive separating witness is a model whose `DataOutput` id differs from its target `Property` id. Under the existing plain User Task completion, which merges `submittedValues` into Process bindings by their submitted name, completing with `DataOutput_Decision` writes a Process variable called `DataOutput_Decision`. Under this account it writes `Property_UnderwritingOutcome`, because the association says so. The two accounts therefore disagree in canonical `variables`, which is the approved public observation boundary, and the disagreement is not a hidden microstep.

A second witness separates `ADOUTPUT-ENTRY-01` from the input capsule: this model's task activates with no Process binding present at all, where the input model would stay ready and create no task.

## Lean assurance lane

The lane is declared **proved** for the bounded transition family, matching the input capsule rather than weakening below it.

Required theorems cover data-independent activation; exact-id fill and the refusal of every other submitted name; association-decided write with Process-binding preservation elsewhere; single-scope disposal; wrong and stale identity refusal; runtime-state invariant preservation for the completion transition; and the routed-versus-named non-law that fixes `ADOUTPUT-ROUTE-01` as a real discriminator.

The freshness question the input capsule met does not recur here in the same form, because this family creates its local scope at activation and consumes it at completion within the same occurrence. Where a bound is needed it is stated family-locally with its anchor and its enabling conditions named, and the capsule does not claim more than its anchors reach; that scoping error is recorded as instance 5 of [the recurring premises-and-conclusion finding](../PROCESS-ASSESSMENT-LEDGER.md).

## CIB Seven relationship boundary

No CIB relationship is selected for this mechanism. BPMN defines the write-back rule, the source needs no `camunda:*` extension, and no CIB compatibility claim is made. The profile artifact names the reviewed relationship IDs covering only the reused User Task lifecycle it inherits.

## Temporal hosting and refinement preflight

Durable ingress is the existing exact User Task completion Update; no Signal, Timer, Activity, Child Workflow, or new acknowledgement protocol is introduced. The pure semantic core alone decides whether the completion is well-formed, which value is written, and where it lands.

The mechanisms this family needs are the ones the input capsule already evidenced: content-bound Update ingress, FIFO accepted-input order, existing terminal-result recovery, and Continue-As-New carrying committed `RuntimeState`. The state relation preserved is equality of committed `RuntimeState` and of the canonical `variables` projection.

Delivery, ordering, deduplication, retry, and replay risks are the existing ones. Duplicate or stale completion Updates retain semantic refusal. Transport retry never becomes a second write, because the write is a function of committed state and the content-bound command rather than of delivery count. Workflow cancellation and non-retryable failure remain host outcomes and must not fabricate a write; the refinement lane retains a witness proving the target Property is unchanged after host termination of a task that was never completed.

No Continue-As-New boundary may split the atomic completion transition. A permitted rollover before completion carries the Activity record, task wait, and local scope together; after rollover the core performs the same write.

The smallest executable refinement witness starts the model, replaces the Worker while the task is open, completes with a name differing from the target Property, requires canonical `variables` to show the Property rather than the submitted name, obtains the terminal receipt, and replays both completed Runs. The refused Run carries no completion to replay from that witness; its replay belongs to the differential pipeline lane, which replays one live history per registered case. It is [implemented](../../packages/temporal-adapter/testkit/test/activity-data-output-temporal.test.ts) and runs all three registered scenarios against one live service and one compiled program. It reads the written Property out of the published canonical trace rather than through a new Query, because this capsule adds no observation surface: a routed write that is not visible in the contract the host already publishes is not visible at all. The same witness submits the omitted-output completion, requires the semantic refusal and an unchanged Property, then terminates that Run and requires its committed trace to be unchanged, which is this family's failure-and-cancellation obligation.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative write-back | BPMN 2.0.2 Clauses 10.4.2 and 13.3.2 and the pinned CMOF/XSD anchors above; no CIB semantic vote. OutputSet availability is not a separate lane here, because this slice makes it a function of command shape |
| Exact source and profile admission | Source compiler tests with independently authored checked-graph expectations, old-profile refusal, and eleven reference, cardinality, direction, and excluded-feature mutations. The mutations carry this lane's discriminating power and establish one exclusion boundary through a whole-model exact match; the positive assertions cannot discriminate a reference-resolution defect |
| Declarative meaning and laws | Lean completion relation, evaluator-soundness bridge, quantified write, preservation, disposal and refusal laws, and the routed-versus-named non-law |
| TypeScript realization | Separately written activation, fill, routing, disposal, and refusal logic plus focused state-preservation and negative tests |
| Cross-language behavior | Answer-free supplied-string, supplied-null, and omitted-output scenarios compared through exact canonical results |
| Runtime ownership | Activity writer census, local-owner discriminator mutation, runtime-state well-formedness, and collection-removal completeness |
| Durable refinement | Real-service Worker replacement, the routed write observed in canonical `variables`, host termination fabricating no write, terminal receipt, and replay of both completed Runs, with the refused Run's replay carried by the differential pipeline lane |
| Whole-model reach | One project-owned business model with a concrete purpose, exact pipeline binding, capability/restriction row, generated corpus map, and Product 2 About-page disclosure |
| Product 2 compatibility | One additive published-enum change: the new `awaitDataOutputUserTask` operation kind must reach Product 2's copied [`SemanticOperationKind`](../../platform/contracts/src/execution-publications.ts), which the input capsule's `awaitDataInputUserTask` already precedents. No observation field is added. The lane runs the platform clean-commit entry point rather than assuming the copy is unaffected |

Required source mutations reverse the association direction, leave `sourceRef` unresolved, remove the target Process `Property`, accept a second `sourceRef` (which `DataAssociation-sourceRef` admits at `upper="*"`), accept a second `DataOutput` or `OutputSet`, accept a non-empty `InputSet`, accept an `optionalOutputRefs` or `whileExecutingOutputRefs` entry, accept `isCollection="true"`, and accept a `transformation`. Required semantic mutations write by submitted name instead of by association, make entry depend on the target Property, admit a completion with zero or two bindings, admit an out-of-domain submitted value, commit the write while leaving the local scope in place, and drop the write across Worker replacement or Continue-As-New.

Two mutations this slice cannot retain are named here rather than left to be looked for. **Equating the `DataOutput` id with the target `Property` id so the routed and named accounts agree by coincidence** is not expressible in source, because both ends are `xsd:ID` and one document cannot declare the same id twice; program admission is the only boundary that can refuse it, and its negative is core-side. Disposing the scope before executing the association is **unobservable** while the fill and the association are fused, because no value ever passes through the scope; it becomes a real negative in the same coverage that makes materialization a real step.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Activity-local output scope | Created empty at activation and never written, because the accepted completion fuses the fill with the association | Never projected; this profile publishes no input collection | Created with the Activity and removed atomically with it in the completing transition |
| Data-bearing Activity record | Program-selected because the Activity owns a declared data interface | Contributes only to existing Activity lifecycle publication | Owns the exact task body and local scope; no attached Timer exists |

The BPMN layer owns the write-back proposition, its completion boundary, and OutputSet availability. The selected profile owns the exact source graph, the id-based fill, the value subset, and the refusal class for an unavailable required output. Lean and TypeScript independently realize the same reviewed account. Temporal owns durability and delivery only. Product 2 decodes an unchanged contract.

## Versioning consequences

This is a pre-release additive profile. It adds one profile artifact, one checked-node arm, one Semantic Process operation arm, one source reader, scenarios, one retained model, pipeline entries, and documentation owners. It adds no runtime collection, no observation field, and no wire-schema field beyond the checked and IL arms, so no current producer or consumer is replaced. No compatibility reader, version switch, or parallel RuntimeState shape is permitted under [the contract evolution policy](../../contracts/README.md#evolution-policy) and [the pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy).

The executable constraints mechanically resolved by `node scripts/what-binds.ts` include [schema coverage](../../scripts/contract-schema-coverage.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [Activity occurrence writer census](../../scripts/activity-occurrence-writer-census.test.ts), [runtime collection removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [model-corpus policy](../../scripts/bpmn-corpus-policy.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts). Focused oracles are the source compiler, semantic-core, Lean semantic, contract, differential pipeline, Temporal, and model-corpus gates selected by [the testing specification](../TESTING-SPEC.md#focused-gate-matrix).
## Epistemic closure and reopen conditions

Established by this capsule are the normative write-back and availability rules, the exact machine-readable cardinalities, the recorded Clause 10.4.2 versus Clause 13.3.2 destination inconsistency, the public separating witness against name-based completion, and an implementation whose source admission, Lean account, independently written TypeScript core, three answer-free cross-language scenarios, retained whole model, and real-service refinement all agree. What remains unestablished is everything the slice excludes: no claim covers a second output or OutputSet, an optional or while-executing output, an Activity carrying both directions, another Task host, or any CIB relationship.

The nearest unsupported claim is an Activity that both consumes and produces data. That does not require an IORule, which is not an admissible construct at all; it requires deciding whether the two capsules' local scopes coexist in one occurrence and how the input publication behaves when they do, and it is the natural third capsule.

The principal common-mode risk is stated above and is unusual in being known before implementation: Accounts A and B are publicly indistinguishable for this slice, so no witness in any lane can catch a wrong choice between them, and the selection rests entirely on the forward-compatibility argument. A reviewer should attack that argument directly rather than look for a discriminating test.

The nearest realistic counterexample completes with a submitted name equal to the target Property id, which makes the routed and named accounts agree by coincidence and would let a name-based implementation pass. The registered model must therefore keep those two ids distinct. The negative that equates them is retained at program admission rather than in source, because `xsd:ID` makes the equal-id model unwritable, and it is retained in both languages so the two refusals can fail apart from each other.

Reopen before adding a second output or OutputSet, admitting optional or while-executing outputs, which additionally requires revisiting `projectSelectedTaskInputs`'s single-binding cardinality rule and the input capsule's `ADINPUT-OBSERVE-01` publication, adding the `OutputSet-inputSetRefs`/`InputSet-outputSetRefs` pairing, combining input and output on one Activity, changing the refusal class for an unavailable required output, extending the value domain, reusing the mechanism for another Task or Event type, or selecting a CIB relationship.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4cf6d415` | `fork-turns-none` | `approve-with-required-edits` | `07261f25, d92ca95d` |
| Semantic checkpoint | `f65a4228` | `fork-turns-none` | `approve-with-required-edits` | `90281eba` |
| Closure | `4f5825c1` | `fork-turns-none` | `approve-with-required-edits` | `f9004d49` |
