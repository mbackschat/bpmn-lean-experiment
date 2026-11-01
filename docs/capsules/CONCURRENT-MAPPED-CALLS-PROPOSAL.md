# Concurrent mapped Calls proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and delivery boundary

Can mapped Call Activities sit on concurrent Parallel branches, including two live calls of one called definition with different mappings, so that each call's inputs are read from its own caller occurrence's chain when it is invoked and each call's outputs land at its own caller occurrence's owners when it returns, in any completion order?

This is a family of batch 3 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the prepared mapped invocation: a mapped Call's invocation, co-enabled with sibling work after a fork, is prepared like a declared Sub-Process entry, while its return stays an unprepared singleton. It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares that mechanism:

- `PC-DATA-04`, primary: the mapped Calls on concurrent branches it took over from `PC-SCOPE-05`, whose outputs must land at the associated caller under reverse completion;
- `PC-DATA-05`: reference input mappings at Call entry on concurrent branches, all reading one pre-entry context;
- `PC-DATA-06`: Call outputs on concurrent branches to local and enclosing targets, atomic at return.

No row closes in this family. The remaining clauses belong to mechanisms this family does not share: expression mappings (`PC-DATA-07`), Multi-Instance owners and Call bodies (`PC-MI-03`, held), structured values under concurrency (a concurrent capacity account), re-entry (`PC-CF-06`), exceptional return (`PC-SCOPE-06`), literal and expression Call inputs (`sourceExpression`, `PC-DATA-05` and `PC-DATA-07`) and Script, Send and Rule hosts.

The [concurrent scope data account](CONCURRENT-SCOPE-DATA-SPEC.md) excluded Calls from data-bearing models because "a mapped Call on a Parallel branch needs prepared mapped invoke and return, which is a second mechanism". Its first proposal review rejected an account that let a fork lead straight into two Calls of one definition; that shape stays refused here by `CALLN-ONCE-01`.

## Normative basis and CIB classification

**BPMN.** Clause 10.3.6 makes each Call Activity activation transfer control to its called element, and Clause 13.3.4 gives each activation its own called instance with Sub-Process completion semantics. Two activations therefore own two instances, whatever their completion order. Clause 10.4.1 ties data lifetime and visibility to the owning instance. Name-based transfer is not BPMN; it is the CIB extension below.

**CIB Seven.** The extraction of [`CIB-EXT-0021`](../CIB-BPMN-RELATION-REGISTER.md) holds per activation, at pinned `v2.2.0-27-g5a45b47`: `CallableElementActivityBehavior` evaluates the inputs against the Call Activity's own execution before the called instance starts and writes the outputs with `setVariables` on that execution at normal end, so each call reads and writes through its own execution's parent chain. A Call on a Parallel branch runs on a concurrent child execution whose variable scope resolves through the scope execution, as [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md) records for concurrent Sub-Process data. That two concurrent calls of one definition each read and write through their own Call execution is inferred from these code paths; `CallActivityTest.testSubProcessWithDataInputOutput` (line 313) shows two Calls of one definition with different mappings, serially. The family therefore calibrates the claim on the CIB oracle.

Register changes, each with these citations and the calibration: `CIB-EXT-0021` widens its boundary from one serial call and Stage B's two serial calls to the placements below under the `SCOPE` profile, with that profile's String domain; `CIB-EXT-0020` gains the Call caller occurrence as a chain origin, as `CALLN-FRAME-01` already uses it serially.

## Required, optional and excluded scope

Required: everything the `SCOPE` profile admits today for data-bearing Programs under the [concurrent scope data scope](CONCURRENT-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope), together with mapped Call Activities:

- **Placement.** A mapped Call may sit wherever the [Stage A structure](REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#admission) admits a Call vertex in the caller's root body, and on the serial path of an ordinary embedded Sub-Process body at depth one or two that is not a merge target, including such a body on a Parallel branch, provided the Call is not that body's leading vertex, directly or through a chain of leading Sub-Processes. Unmapped Calls keep their Stage A placements, so none sits in a Sub-Process body.
- **Mappings.** Each mapped Call carries the [Call variable mapping](CALL-VARIABLE-MAPPING-SPEC.md#required-optional-and-excluded-scope) mappings unchanged: one to eight `camunda:in` and at most eight `camunda:out`, each with exactly a nonempty `source` and `target`, an input source read from the caller occurrence's chain.
- **Called Process.** Each called Process is a serial chain from a None Start through one to three User Tasks to a None End.
- **Concurrency rules.** `CALLN-ONCE-01` and `CALLN-SHARED-01` hold unchanged, so a fork never leads straight into two Calls of one definition, and a User Task before either Call admits that shape.

A data-bearing Program is one with a declaration, a mapped Service Task or a mapped Call, so the data-bearing predicate ([`ScopeDataBearing`](../../BpmnSemantics/SemanticProcess/ScopeDataBearing.lean) and its [TypeScript counterpart](../../packages/semantic-core/src/scope-data-bearing.ts)) gains mapped Calls.

Optional: two mapped Calls of one definition with different mappings on distinct branches; a mapped Call beside an unmapped Call of another definition; a caller-frame namesake of a called name.

Excluded: a mapped Call that leads a Sub-Process body, directly or through leading Sub-Processes, because its embedded-caller invocation would be co-enabled with sibling work and the Lean control selection admits only parentless callers (`callerRoot.parent.isNone` in [`InternalScopeCreationSelection`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean)); a called Process invoked by both a mapped and an unmapped Call, because the called-root mapping lookup is decided per definition (`mappedCalledRoot` in [`NestedScopeData`](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and its [TypeScript counterpart](../../packages/semantic-core/src/nested-scope-data.ts)) and a mix would let called-owned resolution fall through to the caller; a Call inside a merge-target body or inside a Sub-Process that can have two live occurrences, because two live records of one Call element would break return selection by Call element (hazard 3 of the [repeated Calls account](REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#representation-and-runtime-ownership)); a Call inside a called Process; a Service Task in a model with a Call, as today; every exclusion of the mapping account other than placement and a second Call, so `sourceExpression` stays refused; every exclusion of the concurrent scope data account other than Calls. These bound admission only: the representation below admits re-entered and Multi-Instance callers later without reinterpreting an admitted model, because each record already names its caller occurrence and Call element.

## Profile and public contract

The `SCOPE` profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md): every model it admits today keeps its exact admission, commands and observations, and only data-bearing models with mapped Calls become additionally admissible. It already owns the concurrency, the Calls of Stage A and the concurrent data of the concurrent scope data account; the `DATA` profile would need all three and a concurrent capacity account for 16 KiB values, so it keeps its serial admission.

Values are `CSD-VALUE-01`'s bounded String or present null at every surface, including Call inputs, called-root frames, called User Task patches and Call outputs. `CMCALL-START-01`: a data-bearing Program with a mapped Call takes `CVM-START-01`'s Start rule, with availability decided by `CSD-AVAILABLE-01` over the occurrence chain: no Call input source makes a Start binding required, since an absent source becomes a present null; an input source or output target that resolves to the Process binding is admitted optionally, at most once; a required name stays required; any other name, including a called-only name, is `rejected`. Today's rule for this profile, which admits every Start name because it admits no data-bearing Call ([`scope-data-stimulus-admission.ts`](../../packages/semantic-core/src/scope-data-stimulus-admission.ts), `NestedScopeControl.startBindingsAdmitted` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), dispatched from [`CommandStartBindings`](../../BpmnSemantics/SemanticProcess/CommandStartBindings.lean)), stays for Programs without a mapped Call.

No wire shape changes: the `variableMappings` arm of the Call data variant exists, and [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) widens it to data-bearing Programs of this profile. Called identities and called task addressing stay those of `CALLN-IDENTITY-01`.

## Representation and runtime ownership

**Invocation and return are unchanged in meaning.** Invocation evaluates the inputs against the caller occurrence's chain by `CSD-CHAIN-01`, turns an absent source into a present null and installs the called-root frame with the record and called root, as `CVM-IN-01` states. Return reads the outputs from that frame, writes them by `NSD-WRITE-01` from the record's caller occurrence and disposes frame, root and record atomically, as `CVM-OUT-01` and `CVM-RETIRE-01` state. Mappings are selected through the live record's Call element, as Stage B already does, never by called definition.

**Prepared mapped invocation.** Under the placement rule, a mapped invocation is co-enabled with sibling work exactly when a fork in the caller's root body leads straight into its Call, so every co-enabled mapped invocation has the parentless hosting root as caller; an invocation in a Sub-Process body follows a task of that body and is a singleton. Today the core returns no preparation for the `variableMappings` arm ([batch derivation](../../packages/semantic-core/src/internal-transition-batch.ts)) and Lean refuses it in [`InternalScopeCreationSelection`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean), so such a frontier is `.ambiguous` and the command rolls back as `ambiguousInternalChoice`. The mapped invocation therefore becomes a prepared constructor beside the declared entry of the concurrent scope data account, with the same shape:

- **Control.** The `PreparedInternalScopeCreation` that [`selectInternalScopeCreation?`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) computes for the mapped operation, which it selects through the same arm as the empty-data invocation, so the mappings decide no selected field; `selectInternalScopeCreation_invokes` states that both arms select `invokeProcessState?` from the selected owner. The ordinary scope-creation family admits only operations with `internalScopeCreationUnmapped`, as it admits only undeclared entries, and `selectInternalScopeCreation_refines` carries that hypothesis; the mapped arm's refinement to `invokeState?` is `prepareInternalMappedInvocation_refines` in [`InternalMappedInvocationLaws`](../../BpmnSemantics/SemanticProcess/InternalMappedInvocationLaws.lean).
- **Frame.** The evaluated called-root frame, exactly the frame `CVM-IN-01` installs.
- **Application.** The control `apply` followed by one frame insertion that changes only `variables.scopes`, so every existing law over `apply` stays as it is.
- **Footprint.** The control footprint, plus reads of `scopeVariableScope` of each frame consulted on the caller chain, `scopeParent` of each chain link and `processVariable` of each name that falls through to the Process, and a write of `scopeVariableScope` of the new called-root frame, the declared entry's atoms for a different new frame.

Two sibling mapped invocations, a mapped invocation and a declared entry, and a mapped invocation and an arming read shared parents and write different new frames or no frame, so they form independent batches. The composed patch re-establishes, at the strength the declared entry has: refinement to the Call variable mapping invocation (`invokeState?` in [`CallVariableMapping`](../../BpmnSemantics/SemanticProcess/CallVariableMapping.lean)); `runtimeStateWellFormed` preservation from `apply`'s preservation and the variables-only frame insertion; complete footprint frames for mapped/mapped, mapped/declared, mapped/undeclared, mapped/arming and mapped/local-control pairs; their literal-state commutation from distinct-owner frame insertion commutation; and membership in finite batch induction under the concurrent scope data account's explicit premise, widened by one member kind: a batch that contains a declared entry or a mapped invocation contains only scope creations, declared entries, mapped invocations, ordinary armings and local-control members. Lean's `PreparedInternalTransition.Independent` and the core's `preparedInternalTransitionsAreIndependent` encode the widened premise, as they do today for declared entries.

**Return stays an unprepared singleton.** A called body is a serial User Task chain, so a called instance becomes quiescent only through the single token of the command that completed its last task; `reachNoneEnd` and `returnProcess` follow from that token alone, and return is the only offer of its frontier. Singletons execute unprepared. The argument reopens when a called body admits concurrency, wait-free paths or interruption.

**No new representation.** The record keeps its fields; no opcode, Program field, runtime collection or synthetic construct is added. The called-root frame stays the runtime-only construct of the Call variable mapping account, with its lifecycle invariant unchanged; under this profile, two such frames may be live at once, one per live record.

**An asymmetry this family does not copy.** The core prepares the vendor-neutral scalar Call data arm in batches ([call-data preparation](../../packages/semantic-core/src/internal-transition-call-data-preparation.ts)), while Lean has no matching prepared constructor and refuses scalar returns in regional selection. This family adds the mapped invocation constructor in both languages together; the scalar asymmetry is recorded for its own owner, not repaired here.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). [Nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) and their Lean counterparts gain the placements above and charge a mapped Call as Stage A and Stage B charge a Call. `CSD-AVAILABLE-01` gains one clause, `CMCALL-AVAILABLE-01`: a Call output is a definite write at its statically resolved owner on the caller's chain, as `CVM-AVAILABLE-01` states serially, and like every write in one fork branch it is never available inside a sibling branch.

The nearest wrong algorithms each have a separating journey below:

1. called-root mappings or frames selected by called definition, which applies the first-invoked call's mappings to the second;
2. outputs written from the hosting root instead of the record's caller occurrence, which bypasses a declaring Sub-Process frame;
3. a mapped invocation left unprepared, which rolls a fork into a mapped Call back as `ambiguousInternalChoice`;
4. a Call output counted as available in a sibling branch.

## Capacity

This family claims no static capacity envelope, as the concurrent scope data account claims none for the profile. Hosted budgets stay enforced at runtime: the candidate preflight refuses an over-budget successor before commit with a typed capacity failure, and the ordinary-effect History reservation refuses after commit. Called-root frames add up to sixteen bounded Strings per live call to committed state. The retained models are measured with a 1,024-byte String in every data slot, of control characters and of ASCII, in a Workflow component test beside the [concurrent scope data capacity test](../../packages/temporal-adapter/workflow/test/concurrent-scope-data-capacity.test.ts); the profile README and About disclose any slot pattern that stops with a typed capacity failure.

## Stable rules

Layers: `CMCALL-OWN-01` restates BPMN Clauses 10.3.6 and 13.3.4 for concurrent activations; the other rules apply the `CIB-EXT-0021` and `CIB-EXT-0020` overlay at the new placements and the prepared mechanism.

- `CMCALL-ADMIT-01`: admission accepts exactly the required and optional scope above and refuses every exclusion, every parser warning and every model that `CALLN-ONCE-01`, `CALLN-SHARED-01` or the closure bound refuses.
- `CMCALL-IN-01`: each invocation evaluates its inputs against its own caller occurrence's chain before the called instance exists; the called-root frame holds exactly the input targets.
- `CMCALL-OWN-01`: each return continues exactly its record's caller occurrence, once, whichever concurrent call returns first.
- `CMCALL-OUT-01`: each return reads every output source from its own called-root frame and writes it by `NSD-WRITE-01` from its record's caller occurrence, with the mappings of its own Call element; reading precedes every write, and the writes, disposal and caller token commit atomically.
- `CMCALL-ISOLATE-01`: a called-owned read or write never reaches another called instance's frame, a caller frame or the caller's Process binding, including those of a concurrent call of the same definition.
- `CMCALL-PREPARE-01`: a mapped invocation co-enabled with other offers is a prepared scope creation whose control equals the data-erased invocation's preparation, whose application equals the mapped invocation evaluator's result and whose footprint carries the atoms above; return stays a singleton. On every registered schedule, no closure reaches `ambiguousInternalChoice`.
- `CMCALL-AVAILABLE-01`: as stated under admission.
- `CMCALL-START-01`: as stated under the profile.
- `CMCALL-TASK-01`: a called User Task patch may carry only names among its own Call's input targets and output sources, selected through the live record's Call element, as `CVM-TASK-01` states for one call.
- `CMCALL-REFUSE-01`: every refusal leaves the predecessor state unchanged; a stale, sibling-addressed or caller-addressed called completion and an out-of-domain or wrong patch are `rejected`. No automatic step can fail semantically after an accepted command.

Observation adds nothing: `StateObservation` shows Process variables and open waits; frames stay runtime-only, and called-task detail follows `CVM-OBSERVE-01` under this profile.

## Separating witnesses

Two retained whole models carry the witnesses.

- **Supplier onboarding.** A fork leads to two ordinary Sub-Processes, *Financial review* and *Compliance review*. Each declares a local `file`, initialized from `${supplierName}` in the financial body and from the literal `sanctions screening` in the compliance body, and a local `verdict` initialized to the literal `pending`. Each body runs a preparation User Task and then a Call to one reusable *Expert opinion* Process with a single User Task. The financial Call maps `file` in as `dossier` and `opinion` out to `verdict`; the compliance Call maps `file` in as `screeningFile` and `finding` out to `verdict`. Each Sub-Process maps `verdict` out, to `financialVerdict` and `complianceVerdict`. An approval User Task after the join reads both.
- **Travel request.** A fork leads straight into a Call to a *Budget check* Process, a Call to a *Visa check* Process and a declaring *Booking* Sub-Process whose local `budget` is initialized from `${approvedBudget}`, the pre-approved budget the request starts with, which *Budget check* later confirms or overwrites, and whose body holds a *Book travel* User Task. Each Call maps `traveller` in; *Budget check* maps its result out to `approvedBudget` and *Visa check* to `visaStatus`, both landing at the Process.

Lanes: B profile admission, L Lean law or decided fixture, T TypeScript core, P pipeline agreement on `StateObservation`, H Temporal hosted, C CIB calibration, N negative witness, M seeded mutation.

| Rule | Witness | Lanes | Mutant it kills |
|---|---|---|---|
| `CMCALL-OWN-01`, `CMCALL-OUT-01` | Supplier onboarding with the compliance expert answering first: `complianceVerdict` holds the compliance `finding` and `financialVerdict` the financial `opinion`; a second schedule with the financial expert first agrees. | L, T, P, H, C, M | Select the called-root mappings by called definition: the second-invoked call takes the first Call's mappings, so its expert's patch naming its own output source is `rejected` where the correct account commits it. Write outputs from the hosting root: the declaring `verdict` frames keep `pending`, which the Sub-Process outputs publish. |
| `CMCALL-IN-01` | The financial expert's called-root frame holds `dossier` with the supplier name and the compliance expert's holds `screeningFile` with `sanctions screening`, each read from its own Sub-Process's `file`; called-task detail shows both. | L, T, H, C, N | Evaluate both invocations' inputs from one caller chain, which gives both frames the same `file`. |
| `CMCALL-TASK-01` | A patch writing `finding` to the financial expert's task, and one writing `opinion` to the compliance expert's task, are `rejected` unchanged; each instance's own name commits. | L, T, P, N, M | Select the allowed patch names by called definition. |
| `CMCALL-ISOLATE-01` | While both experts' tasks are open, the financial expert's completion patch, revising `dossier` and writing `opinion`, leaves the compliance called frame as it was, and the Process gains only the financial verdict its review publishes. | L, T, P, H | Write called patches through the caller hierarchy or the first frame of the definition. |
| `CMCALL-PREPARE-01` | Travel request commits Start, with `approvedBudget` bound, as one batch of two mapped invocations and the *Booking* entry, leaving three open waits, two called and one caller task; without the prepared constructor the same Start rolls back as `ambiguousInternalChoice`. | L, T, P, H, M | Leave mapped invocations on the singleton path. |
| `CMCALL-AVAILABLE-01` | *Booking*'s `${approvedBudget}` reads the *Budget check* output from a sibling branch, so travel request's Start without `approvedBudget` is `rejected`; a variant whose declaring Sub-Process reads `${approvedBudget}` after the join commits without it. | B, L, N | Count a branch's Call output as available in a sibling. |
| `CMCALL-START-01` | Travel request's Start without `traveller` commits and the called frames hold present nulls; supplier onboarding's Start binding the called-only name `dossier` is `rejected` unchanged. | B, T, P, N | Require Call input sources at Start, or admit any Start name. |
| `CMCALL-ADMIT-01` | A fork straight into two Calls of *Expert opinion*, a mapped Call leading a Sub-Process body on a fork branch, a called Process invoked by a mapped and an unmapped Call, a Call in a merge-target body, a `sourceExpression` input and a Service Task beside a Call are refused; the retained models compile. | B, L, N | Admit two invocations of one definition in one closure; admit a co-enabled embedded-caller invocation, which Lean would roll back while the core batched it. |
| `CMCALL-REFUSE-01` | A completion of the financial expert's task addressed with the compliance call's identity, and after its return, is `rejected` unchanged. | T, P, H, N | Route a called completion by definition. |

## Lean assurance lane

Lane shape: proved

Evidence: the prepared mapped invocation's refinement, preservation, footprint frames and commutation hold over every reachable state, which no finite schedule covers, so they are proved as for the declared entry in [`InternalScopeCreationPreparation`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationPreparation.lean): the control selected on the data-erased operation equals the singleton invocation's control effect, while the ordinary scope-creation family keeps refusing the mapped arm; application equal to `invokeState?`'s result; `runtimeStateWellFormed` preservation; nested input evaluation unchanged when the consulted frames, chain links and Process names are unchanged; commutation of the five pairs named under representation; and batch membership under the widened premise, taken as a hypothesis as the declared entry takes it. The declarative invocation arm takes the evaluator result as premise, so its soundness bridge is a dispatcher check. Ownership under reverse completion (`CMCALL-OWN-01`, `CMCALL-OUT-01`) is a fixture over the retained schedules, since return already selects by record and `CALLN-RETURN-01` and `CVM-OUT-01` carry the quantified laws. The nearest checked non-law is that selecting called-root mappings by called definition differs from selecting them through the record's Call element when two live calls of one definition carry different mappings.

## Temporal hosting and refinement preflight

No new hosting mechanism is added. Durable ingress stays the Start and User Task completion Updates; called tasks keep their called identities and the caller instance selects the hosting Workflow. The profile already hosts concurrent waits, called User Task waits and concurrent frames; this family adds concurrent called-root frames to the same committed state. Invocation and return are internal closure steps inside the command that reaches them, evaluated once from committed state and re-derived by replay. Continue-As-New carries the frames as ordinary runtime state; the [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) restoration accepts this profile's called-root frames by the same ownership rules it applies to the `DATA` profile's, rejecting a frame without its called root, a called root without its frame and a frame owned by a caller. [Called-task detail](../../packages/temporal-adapter/protocol/src/user-task-detail.ts) applies `CVM-OBSERVE-01` under this profile.

The preserved relation is the existing equality of hosted committed state with the core's state. The risks are delivery order, which only reorders the two experts' completions and is the separating schedule itself, and size, which the runtime budgets enforce. There are no timers, Messages, effects beside Calls or BPMN cancellation.

Smallest refinement witness: supplier onboarding hosted, with both expert tasks open, Worker replacement, Continue-As-New while both calls are live, the compliance expert completing first, then the financial expert, then approval, with every Run replayed and the final Process variables compared with the core.

## Evidence and acceptance

Both models run as answer-free scenarios, two schedules for supplier onboarding and one for the travel request, with registered pipeline cases, seeded mutations, value-domain rows, corpus rows and the About disclosure. The CIB lane is a calibration probe beside the [concurrent scope data probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentScopeDataProbeTest.java), driving both models in CIB `2.2.0` and asserting the caller's Process variables at the same points, plus each child instance's variables through CIB's query API for `CMCALL-IN-01`.

Acceptance: Lean, core and pipeline agree on every scenario's `StateObservation`; the Lean laws hold; the probe agrees at its declared fidelity; the hosted witness passes; and the hosted pipeline passes once at family acceptance.

Nearest unsupported claims: two invocations of one definition in one closure (`PC-MI-03`), Calls in merge-target bodies, literal and expression Call inputs, structured concurrent values, exceptional return and re-entry. Common-mode risk: Lean and the core transcribe one reading of the CIB extraction; only the calibration probe checks it independently, and only on the retained models.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): the profile identity, Program and checked shapes and schemas stay unchanged; admission accepts the existing `variableMappings` Call arm under one more profile; no legacy reader or migration is added.

### Owners this implementation grows

Derived with `node scripts/what-binds.ts` on 2026-11-01; `what-binds` owns every headroom figure.

- Lean prepared transitions: [`InternalPreparedTransition`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean), [`InternalScopeCreationPreparation`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationPreparation.lean) (the new constructor belongs in a module of its own when growth would exceed the review target), [`InternalScopeCreationSelection`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) and [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean), which takes the new batch case and the widened premise and is near its review target, so the batch case moves to its own module when growth would exceed it.
- Lean Start and data-bearing rules: [`ScopeDataBearing`](../../BpmnSemantics/SemanticProcess/ScopeDataBearing.lean) and [`CommandStartBindings`](../../BpmnSemantics/SemanticProcess/CommandStartBindings.lean).
- Lean mapping and admission: [`CallVariableMapping`](../../BpmnSemantics/SemanticProcess/CallVariableMapping.lean), [`CallVariableMappingLaws`](../../BpmnSemantics/SemanticProcess/CallVariableMappingLaws.lean), [`NestedScopeData`](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), which is near its review target, so placement analysis moves to its own module when growth would exceed it.
- TypeScript: [batch derivation](../../packages/semantic-core/src/internal-transition-batch.ts), the prepared-entry owners the constructor mirrors, [declared-entry preparation](../../packages/semantic-core/src/internal-transition-declared-entry-preparation.ts) and [scope-creation preparation](../../packages/semantic-core/src/internal-transition-scope-creation-preparation.ts), [Start admission](../../packages/semantic-core/src/scope-data-stimulus-admission.ts), the [data-bearing predicate](../../packages/semantic-core/src/scope-data-bearing.ts), [call-data preparation](../../packages/semantic-core/src/internal-transition-call-data-preparation.ts), [transition footprint](../../packages/semantic-core/src/internal-transition-footprint.ts), which sits at its review target, so the call-data footprint atoms move out before it grows, [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) and [profile value domains](../../packages/semantic-core/src/semantic-profile-value-domain.ts).
- Temporal: [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), [called-task detail](../../packages/temporal-adapter/protocol/src/user-task-detail.ts) and a capacity component test beside the [concurrent scope data capacity test](../../packages/temporal-adapter/workflow/test/concurrent-scope-data-capacity.test.ts).
- Registration: the [relation register](../CIB-BPMN-RELATION-REGISTER.md) entries `CIB-EXT-0021` and `CIB-EXT-0020`, the [profile README](../../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/README.md), scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`call-forest-selection-census`](../../scripts/call-forest-selection-census.test.ts): every helper on the invoke, return and called-body paths selects by owner, by a live record or by a called root identity, now with two live called-root frames;
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts): every consumer of `invokeProcess` handles the mapped arm under this profile;
- the [concurrent scope data runtime test](../../packages/bpmn-source/test/concurrent-scope-data-runtime.test.ts), which locks the declared-entry batch premise and gains the mapped invocation as a permitted member;
- [`lean-fanout`](../../scripts/lean-fanout.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound the new Lean module's fan-out and every grown owner's size;
- [`interruption-invocation-premise`](../../packages/differential/test/interruption-invocation-premise.test.ts), which Sub-Process-placed callers satisfy because the profile excludes Error and Terminate;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `233fb94b` | `fork-turns-none` | `approve-with-required-edits` | `1c725222` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The proposal review of `233fb94b` (packet `9fcfa65d3d3783f57c07ddbd55f40e5a8eb53b9e7cfbbf9adf174dc6e268514f`) required six corrections: co-enabled embedded-caller invocations that Lean's parentless control selection cannot prepare, a mapped/unmapped Call mix of one definition that breaks called-root isolation, an availability witness without a Call output, supplier witnesses that did not separate mappings selected by definition, an undecided Start rule, and an incomplete owner inventory. The same reviewer's audit of `1c725222` closed all of them and approved.
