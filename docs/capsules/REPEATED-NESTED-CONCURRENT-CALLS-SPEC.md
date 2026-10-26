# Repeated, nested and concurrent Calls specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and delivery boundary

Can one hosted process instance run several calls to the same reusable Process definition, serially, through a Call inside a called Process, and concurrently on distinct Parallel branches, so that every called instance returns exactly once, to exactly the caller occurrence and Call activation that created it, in any completion order? And can a mapped Call sit inside an embedded Sub-Process, receiving its inputs from and writing its outputs to that Sub-Process's frame?

This specification closes `PC-SCOPE-05` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) through both stages below. No sibling row shares its mechanism, as [PLAN](../PLAN.md#exact-resume-point) records. The two stages share one mechanism, a call record whose caller is any admitted caller occurrence rather than the hosting Process root, and they differ in where that caller may sit:

- **Stage A, Process-root callers.** Calls in the root body of the caller Process and in the root bodies of called Processes. Every caller occurrence is then a parentless Process root, either the hosting root or a called root. This covers serial repetition, nesting and concurrency. It grows the `SCOPE` family's cumulative profile, the only profile with Parallel branches and Calls in reach.
- **Stage B, embedded callers.** One mapped Call on the serial path of an embedded Sub-Process body, beside a root-path mapped Call to the same definition. It grows the `DATA` family's cumulative profile, which owns the [Call variable mapping account](CALL-VARIABLE-MAPPING-SPEC.md). Stage B carries the Lean premise lift that removes the parentless-caller assumption from call-association validity and the position proofs, and confines it to an explicit Program premise of the interruption proofs.

Stage A keeps the parentless-caller premise, since a called root is parentless as the hosting root is, but lifts every guard that assumes a caller in the hosting instance, listed under [Representation and runtime ownership](#representation-and-runtime-ownership).

The following stay later increments, and every restriction below bounds admission only:

- re-entry of one Call element through a cycle, with `PC-CF-06`;
- Multi-Instance Call bodies, with `PC-MI-03`, which this change amends to also own invoking several instances of one definition in one closure, including the plain fork into two Calls of one definition (see [Admission](#admission));
- exceptional return and propagated cancellation, with `PC-SCOPE-06` and `PC-SCOPE-07`;
- version and selector policy beyond in-document key equality, with `PC-SCOPE-03`;
- mapped Calls on concurrent branches, where scope data meets concurrency, with the concurrent owners of `PC-DATA-04`. That row also takes the output half of `PC-SCOPE-05`'s reverse-order clause: this specification shows return ownership under reverse completion and output ownership under serial repetition only.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.6 makes each Call Activity activation transfer control to its called element. Clause 13.3.4 gives a called Process the instantiation and completion semantics of a Sub-Process, so each activation creates its own instance, and the Call Activity completes when that instance completes. A Process called twice therefore has two instances. A called Process may itself contain a Call Activity, and nothing in the standard relates instances of one definition created by different activations. The standard settles every selected control behavior. The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

CIB Seven `2.2.0` (tag `v2.2.0`, commit `834a987`; every file cited here is unchanged at the pinned `5a45b47`) agrees at source level. Paths below are under `engine/src/main/java/org/cibseven/bpm/engine/impl`.

- `bpmn/behavior/CallActivityBehavior.java:55-64` starts each called instance with `createSubProcessInstance`.
- That method, in `pvm/runtime/PvmExecutionImpl.java:213-217`, links the new instance to the calling execution through `setSuperExecution`.
- At normal end, `pvm/runtime/operation/PvmAtomicOperationProcessEnd.java:50-90` continues only that instance's own super-execution.

Return association is therefore per activation, never per definition. Pinned tests exercise each shape:

| Test | Line | Shape |
|---|---|---|
| `CallActivityTest#testSubProcessWithDataInputOutput` | 313 | second invocation |
| `testTwoSubProcesses` | 747 | two parallel Calls to one definition, three live instances |
| `testDeleteMultilevelProcessInstanceInCallActivity` | 1749 | nested Call |
| `testDeleteDoubleNestedProcessInstanceInCallActivity` | 1800 | double-nested Call |

Classification: Stage A is standards-only and selects no new CIB relationship. Its CIB-specific surface is the one it reuses: a `calledElement` read as an exact in-document key. That reading is the key clause of [`CIB-EXT-0021`](../CIB-BPMN-RELATION-REGISTER.md), so the `SCOPE` profile names `CIB-EXT-0021` with matching verifier coverage, through the substitution recorded under [Owners](#owners-this-implementation-grows), and refuses every `camunda:in`, `camunda:out` and other mapping attribute. Stage B composes the existing `CIB-EXT-0021` and `CIB-EXT-0020` accounts without changing their behavior; the nearest-owner output write into a declaring caller frame is already part of `CVM-OUT-01`. The register's Boundary for `CIB-EXT-0021` today excludes a Call inside a Sub-Process and repeated or concurrent Calls, so each stage amends its Boundary and Evidence, as listed under [Versioning consequences](#versioning-consequences). A CIB probe of the Stage A model is optional calibration, not acceptance, as for the [nested scope-control capsule](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#normative-basis-and-cib-classification). Stage B extends the existing [Call variable mapping probe](CALL-VARIABLE-MAPPING-SPEC.md#evidence-and-acceptance) to its model, because its frame placement is a CIB extension behavior.

## Required, optional and excluded scope

### Stage A

Required: one `Definitions` document with one caller Process and one to seven called Processes, all private and executable.

- **Caller.** The caller's root body is any body of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) in which a Call Activity may also appear wherever that class admits a User Task vertex. Its embedded Sub-Process bodies and merge regions stay as admitted today and contain no Call.
- **Called Process.** Each called Process body is a serial chain from one None Start through one to three vertices, each a User Task or a Call Activity, to one None End.
- **Call Activity.** Each Call Activity carries a `calledElement` equal to the `id` of another Process of the same document and no other attribute, child or extension.
- **Call graph.** The graph over Processes is acyclic, with nesting depth at most three: a Call in the caller is depth one.

Optional:

- several Call Activities naming the same called Process, serially or on distinct branches, subject to the concurrency rules below;
- Calls inside the called Processes;
- Sub-Processes and merge regions beside Calls in the caller.

Excluded:

- a Call inside an embedded Sub-Process or merge-target body under this profile;
- Parallel Gateways, Sub-Processes or Start data in a called Process;
- Service Tasks in a called Process or in a caller that holds a Call, which the [concurrent scope Service Tasks](CONCURRENT-SCOPE-SERVICE-TASKS-PROPOSAL.md#admission) admission refuses;
- every mapping attribute, `calledElementBinding`, version, version-tag and tenant attribute, and a prefixed or foreign `calledElement`;
- boundary Events, loops or Multi-Instance on a Call Activity;
- the shapes the concurrency rules refuse;
- every exclusion of the nested scope-control class.

### Stage B

Required: the [Call variable mapping scope](CALL-VARIABLE-MAPPING-SPEC.md#required-optional-and-excluded-scope), with two changes.

- **Placement.** The caller may hold up to two mapped Call Activities, both naming the one called Process. Each lies either on the serial path of the root or on the serial path of an embedded Sub-Process body at depth one or two.
- **Output target.** An output target may be a local declared by an enclosing Sub-Process of its Call. It lands there by the nearest-owner rule `NSD-WRITE-01`, which `CVM-OUT-01` already names.

Excluded: everything the mapping account excludes except that placement and the second Call; a third Call, nested Calls, and Calls on concurrent branches.

## Profile and public contract

- **Stage A** grows `cibseven-2.2.0-embedded-subprocess-completion-draft` in place under the [cumulative profile rule](../../contracts/README.md).
- **Stage B** grows `cibseven-2.2.0-nested-embedded-scope-data-draft` in place under the same rule.

Every model either profile admits today keeps its exact semantic admission, commands and observations; the one hosting change is the `SCOPE` Start identity bound under [Owners](#owners-this-implementation-grows), which refuses a hosting identity above 256 UTF-8 bytes before Workflow start. No wire shape changes: Programs already carry a definition forest with one root per Process, Start and User Task completion keep their shapes, and every observation keeps its fields.

Public identity:

- **Called instance.** A called instance's semantic identity stays `deriveCalledProcessInstanceId(callerInstanceId, callElementId, activation)` from the [Call specification](CALL-ACTIVITY-SPEC.md#runtime-only-call-record-and-semantic-identity). The caller instance of a nested call is the called instance that holds it. The derivation is length-prefixed and injective ([`CallActivityIdentity`](../../BpmnSemantics/SemanticProcess/CallActivityIdentity.lean)), so every instance created in one hosted process has a distinct identity.
- **Called task.** A User Task in a called instance is addressed as `{ processInstanceId: calledInstanceId, elementId, activation }`, where the activation comes from the existing per-element counter shared by the whole hosted state.
  - Repetition. A second call to the same definition gives its first task activation 2, under a different called instance identity.
  - Concurrency. For live concurrent calls, activations follow commit order, as in the [concurrent embedded activations account](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#profile-and-public-contract).
  - Determinism. No admitted closure arms one called task element twice (see [Admission](#admission)), so the numbering never depends on scheduling inside a closure.

CIB task identifiers are opaque, so this numbering claims no CIB-visible fact.

## Representation and runtime ownership

Lowering is unchanged. Each Call Activity lowers to its paired `invokeProcess`, in the scope that holds the Call, and `returnProcess`, in the called root, whose caller output lies in the invocation's scope; Stage B places the invocation and the caller output in an embedded definition scope. The call record keeps exactly its fields: identity, caller occurrence, called Process, called root and return operation. No opcode, Program field, runtime collection or synthetic construct is added.

Four runtime guards, two Program-graph rules and the pairing check encode a caller in the hosting root today, two more graph rules encode one Call per called definition, and the Lean checked root census and task-completion check encode a single Process. Each is lifted only as far as its stage needs:

| Guard | Today | Stage A | Stage B |
|---|---|---|---|
| Invocation: TypeScript `selectCalledProcessInvocation` ([call runtime](../../packages/semantic-core/src/semantic-process-call-runtime.ts)) and Lean `invokeProcessState?` / `InvokeProcessStep` ([`CallActivity`](../../BpmnSemantics/SemanticProcess/CallActivity.lean)) | caller in the hosting instance and parentless | caller is a parentless root of the hosting instance or of a live called instance; the explicit hosting check is removed, because association validity, checked first, already admits exactly those parentless roots | caller is any live scope occurrence of such an instance |
| Invocation freshness: the same TypeScript and Lean owners, `selectInternalScopeCreation?` and `scopeCreation_selection_call_facts`, found during implementation | no live record of the Call element under the same caller | no live record of the Call element under any caller, so the one record Return selects by element stays unique; under a nested caller the per-caller rule let a second live instance of the calling definition invoke beside the first, and the batch commutation proof had relied on every caller being the hosting root | as Stage A |
| Association validity: TypeScript `calledProcessAssociationsAreValid` and Lean `calledProcessAssociationsValid` | parentless callers, every record reachable from the hosting root | unchanged; nested records are already admitted because called roots are parentless and reachable | caller may be an embedded occurrence whose Process root is reachable |
| Pairing: Lean `callOperationsPaired` ([`CallActivityAdmission`](../../BpmnSemantics/SemanticProcess/CallActivityAdmission.lean)) and its TypeScript counterpart | invoke operation, input and caller output in the entry root | in any Process root other than the called root, the called root never the entry root | additionally in an embedded scope of the caller Process |
| Batch selection: Lean `selectInternalScopeCreation?` ([`InternalScopeCreationSelection`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean)), whose `scopeCreation_selection_call_facts` exports the hosting-instance fact to 14 consuming modules, and `paired_invocation_host` in `InternalRegionalScopeCreationCalls`, removed in Stage A once invocation freshness made its caller-equality lemma unnecessary; TypeScript `deriveInternalInvokeProcessPreparation` already reuses `selectCalledProcessInvocation` | invoke owner in the hosting instance | owner a parentless root of the hosting or a live called instance, in both languages, so batched nested invocations agree; `scopeCreation_selection_call_facts` exports instead that the called instance is not the hosting one | as Stage A; mapped Calls stay on the singleton path |
| Return placement: Lean `GraphValidation.operationRespectsScopes` ([`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean)) and TypeScript `semantic-process-graph-admission.ts` ([graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts)) | `returnProcess` caller output in the entry root | caller output in the Process root that holds the paired invocation | additionally in the embedded scope that holds it |
| Root lifecycle: Lean `ordinaryScopeLifecycleValid` ([`CompensationEventSubProcessSnapshotDeclaration`](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotDeclaration.lean)) and the same TypeScript owner | exactly one `returnProcess` per called root | one `returnProcess` per paired invocation, at least one per called root | as Stage A |
| Called entry producer: Lean `producers` and `placeEdges` ([`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean)) and the TypeScript place-producer rule of the same graph owner, found during implementation | every place has exactly one producer | a called root's entry place is produced by exactly the invocations of that root; every producer contributes a place edge | as Stage A |
| Acyclicity edges: Lean `programEdges` ([`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean)) and the TypeScript graph-policy check, found during implementation | the order graph runs through the called body, from invocation to called entry and from called End to return | the order graph stands each call as an edge from invocation to its paired return, because a body called from two sites joins both sites' paths; reachability keeps the edges through the body. A call cycle is therefore invisible to acyclicity and is refused by the profile analysis, in the checked graph and in the Program (`call_cycle_program_is_refused`). TypeScript witnesses it in the checked graph only: it lowers a Program only after checked admission, and the attempted hand edit of an admitted Program left an unreachable called root, so no TypeScript Program-level witness was added | as Stage A |
| Checked root census: Lean `checkedDefinitionScopesValid` ([`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean)) and TypeScript `hasCallForestRoots`, found during the Lean transcription | one parentless root under this profile | one root per distinct called definition beside the entry root, each reached only by empty-data Calls of another root | as Stage A |
| Called task completion: Lean `dispatchStimulus` ([`CommandAdmission`](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean)), found during the Lean transcription | the completed task's instance is the hosting one | the exact wait identity selects a task of any live instance, as the TypeScript core, which checks no instance, already did | as Stage A |
| Lean premise `calledInstanceClosure_child_empty` ([`InternalRegionalPositionValidity`](../../BpmnSemantics/SemanticProcess/InternalRegionalPositionValidity.lean)) and the parentless-caller lemmas | an embedded occurrence seeds no called instance | holds unchanged | lifted; see [Lean assurance lane](#lean-assurance-lane) |

Return already addresses exactly one record: it selects the record by its return operation and Call element, requires the called root to be quiescent, and continues `record.caller`. Distinct Call elements have distinct return operations, and no admitted model holds two live records of one Call element. Quiescence already counts the live call records whose caller is the occurrence (`scopeQuiescent`), so an outer called root cannot complete while its nested call is live, and an embedded Sub-Process cannot complete while its Call is live. Transitive removal (`removeCalledProcessTree`, `calledInstanceClosure`) is unchanged. Return applies it to a quiescent called root, whose closure holds no nested record, so its transitive reach stays unused, since neither stage admits interruption.

Two live instances of one definition, or two Calls of one definition, break four assumptions that the existing account takes for granted. Admission excludes the first three and Stage B repairs the fourth, without changing representation:

1. **Several owners at one operation in one closure.** The ordinary operation path selects its owner by place through `onlyTokenOwner`, which fails when two owners hold tokens there, so the step is disabled and the tokens stall silently; the arming footprint also writes the shared per-element counter. Parallel Multi-Instance resolves this with its occurrence-addressed alternatives and reserved-occurrence certificate, which stay profile-gated.
2. **Join tokens selected by place.** A join inside a twice-live definition would see two owners' tokens at one input place, the deadlock the [concurrent embedded activations account](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#required-optional-and-excluded-scope) records. Called bodies are serial chains, so every token of a live called instance has become a User Task wait at every stable state.
3. **Return selected by Call element.** A Call inside a twice-live definition would have two live records of one element, and return would refuse both.
4. **Called-root data selected by called definition.** TypeScript `calledRootMappings` ([nested scope data](../../packages/semantic-core/src/nested-scope-data.ts)) and Lean `calledRootMappings?` ([`NestedScopeData`](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean)) return a called root's mappings only when exactly one `invokeProcess` targets that root scope. Their consumers are resolution, frame validity, the declared-name set and [`NestedScopeDataCommand`](../../BpmnSemantics/SemanticProcess/NestedScopeDataCommand.lean). Stage B's two Calls to one definition would make the lookup fail, so frame validity fails and resolution falls back to the caller's Process binding, crossing `CVM-ISOLATE-01`. Two Calls of one definition may carry different mappings, as CIB's `testSubProcessWithDataInputOutput:313` does, so no key by definition is correct. Stage B selects the mappings through the live record's Call element, the invocation that created the called root; the record needs no new field.

The implementation adds a census, [`call-forest-selection-census`](../../scripts/call-forest-selection-census.test.ts), next to the [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts), of every helper on the invoke, return and called-body paths that selects by place (`onlyTokenOwner`), by definition (`completeScopeOwner`, `calledRootMappings`) or by definition scope alone. It shows that each one selects by owner, by a live call record, or by a called root identity unique to one instance, or is unreachable under admission, before admission widens.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) and decides each rule independently in both languages.

**Stage A structure.** In the caller's root body, a Call Activity becomes a one-in, one-out task vertex of the structured-body owner ([`structured-parallel-body-analysis.ts`](../../packages/semantic-core/src/structured-parallel-body-analysis.ts), [`StructuredParallelBodyAdmission`](../../BpmnSemantics/SemanticProcess/StructuredParallelBodyAdmission.lean)), exactly as a Sub-Process vertex is today. The contraction rules, the branch condition and `structureOrder_certificate` therefore apply unchanged; the branch condition reads "User Task, Sub-Process or Call". Each called body is checked as a serial chain. The call tree is expanded per Call site, so one definition called from two sites is analysed twice.

**Stage A bursts.** The composition owner of [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts) and [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) treats a Call vertex like a Sub-Process vertex, with `invokeProcess` for `enterScope` and `returnProcess` for `completeScope`.

- Arming a Call charges `invokeProcess` plus the entry of the called body.
- That entry charges the arming of its first vertex, recursively for a leading Call.
- A completion that leaves a called body without a wait charges `reachNoneEnd` and `returnProcess`, then the caller's resumption from the Call vertex, recursively up through nested calls and into the existing parent recursion.
- Every closure stays within `semanticProcessClosureLimit = 8`.
- The 128-task bound counts each called task once per call site in the expanded tree.

On the supplier model below, completing *Screen sanctions* charges six steps:

1. `reachNoneEnd` of *Compliance check*;
2. `returnProcess` of *Check compliance*;
3. `reachNoneEnd` of *Supplier risk review*;
4. `returnProcess` of *Review risk*;
5. `invokeProcess` of *Final approval*;
6. the arming of *Prepare approval*.

**Stage A concurrency rules.** These decide the three hazards of the previous section statically:

- `CALLN-ONCE-01`: no closure invokes two instances of one definition. An arrival is one entry or resumption scan of the burst composition, so one command closure. The burst composition records the definitions each arrival invokes, including those invoked through leading Calls of called bodies, and refuses a model with an arrival that invokes one definition twice. This refuses the pinned `testTwoSubProcesses` shape, a fork straight into two Calls of one definition. A User Task before either Call admits it. Invoking several instances in one closure needs the occurrence-addressed reserved batch that `PC-MI-03` needs for parallel Call bodies anyway, and the amended `PC-MI-03` row owns this shape.
- `CALLN-SHARED-01`: a definition that contains a Call has at most one live instance. The call trees of two Call Activities on distinct branches of one Parallel block must not share a definition that contains a Call.

**Stage B.** The nested scope-data admission walk accepts a mapped Call on a Sub-Process body's serial path. It charges `invokeProcess` with the called entry and, on the last called completion, `reachNoneEnd`, `returnProcess`, the Call's successor in the Sub-Process and any `completeScope` chain that follows. It keeps the closure bound and the Start capacity envelope, which counts both calls' tasks and at most one live called-root frame, since the two Calls are serial.

The nearest wrong algorithms each have a refusal or journey that separates them:

1. return selected by called definition, which would continue the first-invoked caller when the second instance completes first;
2. one activation counter per called definition instead of per element and hosted state, which would reuse an identity across the repeated calls;
3. a nested return that also completes its outer called root without the outer root's own quiescence;
4. an admission that charges a Call one step as a User Task and so under-counts its bursts;
5. called-root mappings selected by called definition, which would apply the first Call's mappings to the second.

## Stable rules

Layers: every Stage A rule restates BPMN Clauses 10.3.6 and 13.3.4 for the selected shapes. Stage B rules apply the `CIB-EXT-0021` and `CIB-EXT-0020` overlay at a new placement.

- `CALLN-ADMIT-01`: each stage admits exactly its required and optional scope and refuses every exclusion, every parser warning and every model that `CALLN-ONCE-01`, `CALLN-SHARED-01`, the depth bound, the task bound or the closure bound refuses.
- `CALLN-INVOKE-01`: a token at a Call consumed by its admitted caller occurrence creates exactly one record keyed by that occurrence, the Call element and the next Call activation, one parentless called root with the derived identity, and one token after the called None Start, atomically.
- `CALLN-RETURN-01`: return is enabled only for the record whose called root is quiescent, and it continues exactly that record's caller occurrence at the Call's output, once. A completion order never routes a return to another record's caller, including a record of the same called definition.
- `CALLN-NEST-01`: a called root with a live nested record is not quiescent, so the inner return precedes the outer one, and the outer return continues the outer caller only.
- `CALLN-OUTSIDE-01`: progress, completion or return inside one called instance leaves every other record, called root, wait and token unchanged, including those of a concurrent instance of the same definition.
- `CALLN-IDENTITY-01`: as stated under the profile above.
- `CALLN-REFUSE-01`: a completion of a returned instance's task, a completion addressed to a sibling instance's identity and a completion addressed with the caller identity are `rejected` with the state unchanged.
- `CALLN-FRAME-01` (Stage B): a Call inside a Sub-Process evaluates its inputs from that Sub-Process's chain by `NSD-READ-01` and writes its outputs from that Sub-Process occurrence by `NSD-WRITE-01`, so a declaring Sub-Process frame takes the output. The Sub-Process cannot complete while its call is live. The repeated root-path call's frame and outputs are unaffected.

## Separating witnesses

Lanes: B profile admission, L Lean law, decided fixture or executable check, T TypeScript core, P pipeline agreement on `StateObservation`, H Temporal hosted, C CIB probe, N negative witness, M seeded mutation.

| Rule | Witness | Lanes | Mutant it kills |
|---|---|---|---|
| `CALLN-INVOKE-01` | The supplier model's nested Call, invoked from the *Supplier risk review* called root, creates a record whose caller is that root; a depth-three chain invokes from the second-level called root, keeps one record per level and returns through every level. A fork straight into Calls of two different definitions, each body starting with a Call of a third and fourth definition, batches the two nested invocations from two called roots in one closure, and Lean and the core agree on it. Lean decides the admission of each model; the depth-three journey runs in the core only. | L, T, P | Invocation or batch selection that requires the hosting root as caller. |
| `CALLN-RETURN-01` | The tax and bank approval calls run concurrently. Completing the bank instance's tasks first returns into the bank branch only, so the join still waits; the tax instance then returns into its branch and the join fires. A second journey completes in the natural order. | L, T, P, H, M | Return selected by called definition or by first-invoked record. |
| `CALLN-NEST-01` | While *Screen sanctions* waits, *Supplier risk review* holds no task and is not completed; completing it returns twice in one closure, inner then outer. | L, T, P | Complete the outer called root while its nested call is live. |
| `CALLN-OUTSIDE-01` | Completing the bank instance's first task leaves the tax instance's wait, record and called root identical. | L, T, P | Advance or retire every live instance of a definition together. |
| `CALLN-IDENTITY-01` | The three *Four-eyes approval* instances have distinct called identities, and their *Prepare approval* tasks carry activations 1, 2 and 3 in commit order. | T, P, H | Restart task activations per called instance; derive the called identity from the definition. |
| `CALLN-REFUSE-01` | While both approvals are live, a bank *Approve* completion addressed with the tax instance's identity and one addressed with the supplier's identity are each `rejected` unchanged; after the tax instance returns, completing its *Approve* task again is `rejected` unchanged. | T, P, H, N | Accept a stale or cross-addressed called completion. |
| `CALLN-ADMIT-01` | Refused: a fork straight into two Calls of one definition (`CALLN-ONCE-01`, with its User-Task-first control admitted); two branches calling a Call-bearing definition (`CALLN-SHARED-01`); a call cycle; depth four with depth three admitted; a Parallel Gateway in a called body; a Call inside a Sub-Process under the `SCOPE` profile; a mapping attribute under the `SCOPE` profile; a burst of nine with its eight-step control. Stage B, in Lean and TypeScript: a Call three Sub-Processes deep with depth two admitted, a third Call with two admitted, and Calls of two definitions. | B, L, N | Admit a shape whose closure is ambiguous or whose return is unaddressable. |
| `CALLN-FRAME-01` | The guarantor model's Sub-Process declares `guarantorVerdict`; the Call inside it maps `verdict` to `guarantorVerdict`, which lands in the frame, not in the Process binding, and the Sub-Process publishes it on completion. The root-path call's `applicantVerdict` stays as written. A completion of the first call's *Record verdict* after its return is `rejected`. | L, T, P, H, C, M | Write outputs from the hosting root; resolve inputs from the Process binding only; let a stale first-call completion write into the second frame; select the called root's mappings by called definition (wrong algorithm 5), which the guarantor's refused patch of `amount`, a name only the first Call copies, separates in T, P and M, and a Lean check of `calledRootMappings?` over two invocations of one called root separates in L; lower the second return with the first Call's outputs. |

## Lean assurance lane

Lane shape: proved

Evidence: the guard lifts and the return association are proved from the starting owners [`CallActivity`](../../BpmnSemantics/SemanticProcess/CallActivity.lean), [`CallActivityAdmission`](../../BpmnSemantics/SemanticProcess/CallActivityAdmission.lean) and [`ScopeCompletion`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean); admission is checked. Guaranteeing declarations: [`invokeProcessState_sound`](../../BpmnSemantics/SemanticProcess/CallActivity.lean#invokeProcessState_sound), [`returnProcessState_sound`](../../BpmnSemantics/SemanticProcess/CallActivity.lean#returnProcessState_sound), [`return_step_removes_exact_association_and_emits_one_continuation`](../../BpmnSemantics/SemanticProcess/CallActivity.lean#return_step_removes_exact_association_and_emits_one_continuation), [`scopeQuiescent_refuses_live_called_record`](../../BpmnSemantics/SemanticProcess/InternalRegionalReturnQuiescence.lean#scopeQuiescent_refuses_live_called_record), [`invokeState?_reads_caller_frames`](../../BpmnSemantics/SemanticProcess/CallVariableMappingLaws.lean#invokeState?_reads_caller_frames) and [`returnState?_outputs_land_in_caller_frames`](../../BpmnSemantics/SemanticProcess/CallVariableMappingLaws.lean#returnState?_outputs_land_in_caller_frames).

**Stage A.** The proved obligations are what no finite journey covers:

- invocation from a called root preserves `calledProcessAssociationsValid` and creates exactly the derived identity and record;
- return continues exactly the selected record's caller and preserves every other record, called root, wait and token (`CALLN-RETURN-01`, `CALLN-OUTSIDE-01`);
- a called root with a live nested record is not quiescent (`CALLN-NEST-01`);
- removing a returned called tree keeps every record, occurrence and reachable instance outside it, through the unchanged removal frame (`removeCalledProcessTree_keeps_outside_target`, `removeCalledProcessTree_preserves_outside_reachability` in [`InternalRegionalCallPositionValidity`](../../BpmnSemantics/SemanticProcess/InternalRegionalCallPositionValidity.lean)) and `return_step_removes_exact_association_and_emits_one_continuation` in [`CallActivity`](../../BpmnSemantics/SemanticProcess/CallActivity.lean);
- the lifted `callOperationsPaired` keeps three facts its consumers use: the called root differs from the entry root, the return lies in the called root, and the caller output lies in the invocation's scope. It drops the fourth, that the invocation lies in the entry root, from which `paired_invocation_host` derives a caller in the hosting instance. That consumer and the 14 modules consuming `scopeCreation_selection_call_facts` are re-proved on the weaker fact that the caller is a parentless root of a reachable instance. On 2026-10-23, `callOperationsPaired` appeared in ten modules, and the selection facts, `paired_invocation_host` and `selectInternalScopeCreation?` together in 41.

Admission and the concurrency rules are fixed per retained model and refusal as executable checks that [`CallFamilyChecksMain`](../../BpmnSemantics/CallFamilyChecksMain.lean) runs, extending `NestedScopeControlAdmission`. The structural certificate stays quantified over rules 1–3 only. The nearest checked non-law is an executable check in which selecting the return by called definition, on two live instances, continues the wrong caller.

**Stage B lift.** The parentless clause of `calledProcessAssociationsValid` is consumed through five named lemmas. On 2026-10-23, `rg` over them and their two transitive wrappers (`cancellation_child_calls_frame`, `cancelScopeSubtree_child_preserves_position`) found 44 occurrences in 21 modules. The census counts named lemmas only, so any direct unfolding of the clause found later is charged to the same effort bound.

| Lemma | Occurrences | Modules |
|---|---|---|
| `calledProcessAssociationsValid_parentless_endpoints` | 9 | 6 |
| `calledProcessAssociationsValid_parentless_frame` | 4 | 4 |
| `calledInstanceClosure_child_empty` | 10 | 5 |
| `calledProcessAssociationsValid_parentless_root_unique` | 6 | 3 |
| `calledProcessAssociationsValid_parentless_activation_separates_instances` | 1 | 1 |

The consumers fall into two kinds:

- **Normal-path consumers.** Return and scope-creation position, the pair-region frame, runtime and child-projection position: Stage B's own journeys pass through them.
- **Interruption consumers.** Regional cancellation, Error position, root termination and parallel-scope position.

Signature strategy: the state-only predicate keeps its signature, because it appears 188 times in 60 modules and a Program argument would touch all of them.

1. `calledProcessAssociationsValid` keeps its state-only signature, and its parentless clause weakens to: the caller occurrence lies in a reachable instance under a parentless root of that instance.
2. `runtimePositionValid`, which already takes the Program, gains the Program-linked clause: each record's caller occurrence has the definition scope of its Call's invoke operation.
3. The normal-path consumers are re-proved without any premise. That the caller and called root lie in different instances follows from the derived called identity and its injectivity, not from parentlessness.
4. The interruption consumers keep the parentless conclusion through an explicit Program premise, `InterruptionInvocationsRooted`: a Program declaring an Error or Terminate operation invokes only from Process roots. No theorem derives it from admission. Today the only profile admitting a Call inside a Sub-Process, nested scope data, admits neither operation, and a [census](../../packages/differential/test/interruption-invocation-premise.test.ts) checks the premise on every registered pipeline Program.

After Stage B, call-association validity, invocation, return and the position proofs no longer assume Process-root callers, and only the interruption proofs carry that explicit premise. `PC-SCOPE-07` lifts it when it admits interruption around a Sub-Process-placed Call. The amended `PC-SCOPE-05` row records this.

Stage B also:

- proves `CALLN-FRAME-01`'s input-read and output-write laws by extending the `CallVariableMappingLaws` evaluators to an embedded caller chain;
- moves `calledRootMappings?` to selection through the live record, with its frame-validity and resolution consumers.

## Temporal hosting and refinement preflight

No new hosting mechanism is added.

- **Ingress.** Durable ingress stays the Start and User Task completion Updates. Called tasks are addressed by their called semantic identity; the hosting instance selects the Workflow, as for nested called tasks.
- **Waits.** Stage A has only User Task waits, which may be concurrent, and host admission already accepts passive concurrent User Task waits under the `SCOPE` profile. Stage B keeps the data profile's single serial wait, effects included.
- **No timers, Message waits or interruption.** Host termination fabricates no return.
- **Effects.** Invocation and return are internal closure steps of the command that reaches them, deterministic from committed state and re-derived on replay.
- **Lifecycle.** Every called instance, nested ones included, lives inside the hosting Workflow; no Child Workflow carries BPMN identity.

The preserved relation is the existing one between hosted committed state and the core state. Nested records and Stage B's embedded-caller records travel through Continue-As-New as ordinary `calledProcessOccurrences`. The continuation decoder keeps validating them through the lifted association validity, and it rejects a record whose caller is absent or unreachable.

Risks:

- **Ordering.** Concurrent called-task completions are serialized as Updates in any order, which `CALLN-RETURN-01` covers.
- **Deduplication.** Duplicates stay rejected by command identity.
- **Retries.** Transport retries never reach semantic state.
- **Identity length.** A depth-three called identity embeds the hosting instance identity and three Call element identifiers, so it is about three times as long as a depth-one identity. The [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts) does not apply to the `SCOPE` profile, which it leaves `NotApplicable`; there, bytes are fixed by the admitted definition apart from the hosting instance identity, as the [nested scope-control preflight](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#temporal-hosting-and-refinement-preflight) records. Stage A's checkpoint measures the largest retained model's publication and terminal envelope with the longest hosting identity Start admits, against the 192 KiB query ceiling and the terminal envelope. If Start admits no identity bound under that profile, Stage A adds one rather than extending the envelope to concurrent waits. Stage B keeps the envelope, which already applies to its profile, and counts both calls' tasks.
- **Size.** The 128-task cap counts called tasks per call site.

The smallest executable refinement witness for Stage A:

1. both concurrent approval calls are live across a Continue-As-New, with a Worker replacement between them;
2. the calls complete in reverse order;
3. the nested risk-review chain is live across a second Continue-As-New;
4. every Run is replayed.

Stage B's witness is the mapping account's recovery witness, moved onto the guarantor model with the Sub-Process-placed call live across Continue-As-New, plus called-task detail read after Worker replacement.

## Evidence and acceptance

Two retained whole models, each with a business purpose, carry the witnesses.

- **Supplier onboarding (Stage A).**
  - The caller registers a supplier, then forks into *Collect tax documents* followed by a *Tax approval* Call, and *Collect bank details* followed by a *Bank approval* Call, both calling *Four-eyes approval* (*Prepare approval*, *Approve*).
  - After the join, *Review risk* calls *Supplier risk review*, whose *Assess risk* is followed by the nested *Check compliance* Call to *Compliance check* (*Screen sanctions*).
  - A final *Final approval* Call calls *Four-eyes approval* a third time.
  - Answer-free scenarios cover the natural order and the reverse order with the stale and cross-addressed completions.
- **Guarantor loan (Stage B).**
  - The caller verifies the applicant through a root-path mapped Call to *Identity verification*.
  - It then enters a *Guarantor review* Sub-Process, whose mapped Call verifies the guarantor through the same definition into the Sub-Process's declared `guarantorVerdict`.
  - A reviewer confirms it, and the Sub-Process publishes it on completion.

Each model gets scenarios, pipeline cases, seeded mutations, a model-corpus row and the About disclosure. The source lane holds the refusal and bound variants.

Acceptance:

- Lean, the core and the pipeline agree on every scenario's `StateObservation`;
- the Lean laws hold within each stage's lane;
- the hosted refinement witnesses pass;
- the Stage B probe agrees with its expected caller observations;
- the hosted pipeline passes once at family acceptance.

Nearest unsupported claims:

- several instances of one definition invoked in one closure (`PC-MI-03`);
- a Call-bearing definition live twice;
- Calls inside Sub-Processes under the `SCOPE` profile;
- concurrent mapped Calls (`PC-DATA-04`);
- cycles, interruption and exceptional return.

Common-mode risk: Lean and the core transcribe one reading of Clause 13.3.4's per-activation instance. CIB source agreement checks that reading only at source level for Stage A, and the probe checks it at runtime only for Stage B.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy). No schema, codec, opcode or profile identity changes, and existing models of every profile stay byte-identical; only admission widens. The decisive binding guards:

- **IL and censuses:** the [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts), the [internal commutation census](../../scripts/internal-commutation-census.test.ts) and the new definition-selection census above.
- **Call state:** [Call state validation](../../packages/semantic-core/test/call-data-state-validation.test.ts), the [removal ownership graph](../../packages/semantic-core/test/removal-ownership-graph.test.ts) and the [mapped-Call continuation controls](../../packages/temporal-adapter/workflow/test/call-variable-mapping-recovery.test.ts), extended with nested and embedded-caller records.
- **Hosting:** [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), the [nested scope-data capacity envelope](../../packages/temporal-adapter/protocol/test/nested-scope-data-capacity-envelope.test.ts) for Stage B, and the Stage A identity-length measurement.
- **Registration:** [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) for `CIB-EXT-0021` under both profiles, through the `SCOPE` scenario-provenance substitution for Stage A, and the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts). The register entry is amended in the same change as each stage's profile delta:
  - Stage A adds the key reading for repeated, nested and concurrent Calls under the `SCOPE` profile to its Boundary and Evidence.
  - Stage B adds the Sub-Process placement and two mapped Calls of one definition.
- **Structure:** [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- Program graph: the return-placement and root-lifecycle rules in [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean), [`CompensationEventSubProcessSnapshotDeclaration`](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotDeclaration.lean) and [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts). `GraphValidation` and the TypeScript owner are near the 800-line target. The Stage A lift crossed it in Lean; the Call placement rules read the producer census and so stay with it, and the operation control-place vocabulary moved into [`OperationControlPlaces`](../../BpmnSemantics/SemanticProcess/OperationControlPlaces.lean) instead.
- Batch selection: [`InternalScopeCreationSelection`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) and [`InternalScopeCreationSelectionFrames`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelectionFrames.lean).
- Called-root data (Stage B): [nested scope data](../../packages/semantic-core/src/nested-scope-data.ts), [`NestedScopeData`](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and [`NestedScopeDataCommand`](../../BpmnSemantics/SemanticProcess/NestedScopeDataCommand.lean).
- Source: Call admission in [`call-activity-source.ts`](../../packages/bpmn-source/src/call-activity-source.ts), widened to several Processes, several Calls and the two placements.
- Semantic core: the invocation and association guards in the [Call runtime](../../packages/semantic-core/src/semantic-process-call-runtime.ts) and the Call vertex and bursts in [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts).
- Lean: the 21 Stage B consumer modules of the census above, and [`CallActivity`](../../BpmnSemantics/SemanticProcess/CallActivity.lean), [`CallActivityAdmission`](../../BpmnSemantics/SemanticProcess/CallActivityAdmission.lean), [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and, in Stage B, [`InternalRegionalPositionValidity`](../../BpmnSemantics/SemanticProcess/InternalRegionalPositionValidity.lean).
- Hosting: the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts) for Stage B. Start admitted no identity bound under the `SCOPE` profile, so Stage A added one in the same owner: a hosting identity above 256 UTF-8 bytes is refused before Workflow creation, and the hosted recovery witness starts at exactly that size.
- Evidence: scenarios, pipeline cases, model corpus, both profile READMEs and the `CIB-EXT-0021` profile coverage. The `SCOPE` profile artifact cannot name `CIB-EXT-0021`, because the immutable cyclic preservation baseline pins its digest, as it already froze the artifact's `features`; the profile README and the Call scenarios' provenance name it instead. The owner accepted this substitution on 2026-10-23 at the Stage A checkpoint over replacing the baseline and its CIB evidence. The [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) bind it: a scenario may cite a relationship its profile artifact omits only through a recorded substitution whose register Boundary and profile README name it, and the entry retires once the artifact names the relationship.

## Implemented refinements

The implementation refines the approved lift in these places, each approved at closure.

- **Association validity** (lift item 1). The parentless clause is dropped rather than weakened to reachability, because no consumer needs the caller's reachability once the derived identity separates instances. The state-only predicate instead requires one live record per Call element, which invocation freshness keeps and the parentless caller used to imply through the per-caller anchor, and a caller naming exactly one live occurrence. The TypeScript core gained the same element-uniqueness conjunct. The Program-linked `callRecordDeclared` clause of `runtimePositionValid` (item 2) binds the caller's definition scope to its invocation.
- **Interruption premise** (item 4). The Program premise is `InterruptionInvocationsRooted`, which asks for Process-root invocations only of a Program holding a `throwError` or `terminateScope` operation. A Program without interruption satisfies it outright, so the normal-path journeys stay premise-free even through the generic pair, batch and publication layers that dispatch over every operation kind. The cancellation lemmas take the state-indexed `CallersParentless`, derived from that premise and position validity, or from a state without calls. The regional dispatchers take the premise per interrupting operation.
- **Pairing facts.** `callOperationsPaired` yields two further consumed facts: at most one invocation per return operation, and an invocation's scope equal to its input place's scope. From them every batch-created record is shown declared.
- **Fixture.** The incident-cancellation fixture's malformed caller became a dangling one, since an embedded caller is no longer malformed at the state-only boundary; its TypeScript twin already used a dangling caller.
- **`CALLN-FRAME-01` laws.** `invokeState?_reads_caller_frames` and `returnState?_outputs_land_in_caller_frames` in [`CallVariableMappingLaws`](../../BpmnSemantics/SemanticProcess/CallVariableMappingLaws.lean) rest on `readOutcome?_frame` and `writeAll?_frames` in [`NestedScopeDataLaws`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean). The output law takes the frame resolution in the written state as its premise. That the Sub-Process cannot complete while its call is live is `scopeQuiescent_refuses_live_called_record`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d51d42c4` | `fork-turns-none` | `approve-with-required-edits` | `647ab54c, df3fc157` |
| Semantic checkpoint | `0db7e397` | `fork-turns-none` | `approve-with-required-edits` | `f6933b64` |
| Closure | `f191a389` | `fork-turns-none` | `approve-with-required-edits` | `3f457ad4` |

The cold proposal review of `d51d42c4` (baseline `2edc6da0`, packet `cffe38786b9e22d808936314177eb310438ac8b05c8425d4a7e8eb0f86c07e86`) required seven bounded edits. It found further hosting-root guards in Lean batch selection and both graph validators, a called-root mapping lookup keyed by definition, a larger Stage B Lean census, an unamended `CIB-EXT-0021` boundary, unrouted deferred shapes, a misapplied capacity envelope and two contradictions. It judged the two-stage split sound and the `testTwoSubProcesses` refusal honest and forward-compatible. The same reviewer's first audit of `647ab54c` resolved six edits and required one more census row. Its second audit approved `df3fc157` on 2026-10-23 and found no correction material enough to need a fresh cold review.

The cold Stage A checkpoint review of `0db7e397` (baseline `efe439ef`, packet `d05469146956d89991e886e578fbfd32e7ea99050078741b2c7a04351379e030`) required four bounded edits and recommended two. It found the CIB-EXT-0021 artifact substitution unrecorded and unguarded, a reverse schedule whose cross-addressed refusals did not separate an instance-blind selector, an absent nested-record validity guard, witness and contract drift, a call cycle refused only by unstated profile analysis, and unnamed removal-frame lemmas. The same reviewer's audit approved `f6933b64` on 2026-10-23 with one prose note, applied. Stage B opens no checkpoint review; the family closure review covers both stages.

The cold closure review of `f191a389` (baseline `f6933b64`, packet `067a0c3520b0dc92fa5aea5e31a77408172bc7bad2791bbd6326d16e454041f3`) covered both stages and required four bounded edits: Lean negative witnesses for Stage B's admission bounds, a Lean- and pipeline-reaching separation of wrong algorithm 5 with an accurately named mutation, stale owner passages, and an executable basis for the interruption premise. The same reviewer's audit approved `3f457ad4` on 2026-10-24 with no new finding.
