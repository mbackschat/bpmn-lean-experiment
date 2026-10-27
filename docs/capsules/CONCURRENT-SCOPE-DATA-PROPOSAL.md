# Concurrent scope data proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can scope-local data live in concurrently live Sub-Process occurrences, including two live occurrences of one definition, so that every read, write, input and output resolves through the occurrence that performs it, never through another occurrence of the same definition? And can two mapped Calls of one definition run on concurrent branches and land their outputs by their own mappings in either completion order?

This is the next family of batch 2 in [PLAN](../PLAN.md#exact-resume-point). Its shared mechanism is per-occurrence scope data resolved along the live occurrence chain. Under the owner direction of 2026-10-27 the family takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares it:

- `PC-DATA-04`, primary: concurrent embedded owners, present-null shadowing and sibling isolation in concurrent occurrences, and the concurrent mapped Calls this row took over from `PC-SCOPE-05`;
- `PC-SCOPE-02`: distinct data lifetimes for two live occurrences of one embedded definition;
- `PC-SCOPE-01`: data in nested scopes whose bodies hold concurrent branches and mixed User and Service Tasks.

No row closes in this family, and the proposal says so up front. The remaining clauses belong to rows that do not share this mechanism:

- `PC-DATA-04` and `PC-SCOPE-02` also need repeated lifetimes through re-entry, which needs Sequence Flow cycles across scopes (`PC-CF-06`). `PC-DATA-04` also needs its Multi-Instance owners, whose evidence stays held at Multi-Instance qualification.
- `PC-SCOPE-01` also needs its selected gateways with typed conditions (`PC-CF-02` to `PC-CF-04`).
- `PC-MI-10` resolves Multi-Instance body data through the same frames, but it cannot close before `PC-MI-01` to `PC-MI-07`.
- `PC-DATA-05` and `PC-DATA-06` own expression and multi-source mapping evaluation, a different mechanism.

The [nested scope-data account](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md) is serial. It walks the definition chain and refuses whenever one definition has more than one live frame (`resolveOwner?` in [NestedScopeData](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean)). Its [representation note](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope) reserved this broadening: frames are already keyed by occurrence, and every scope occurrence already carries its parent occurrence. The [concurrent scope Service Tasks account](CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md) supplies the concurrency, the concurrent same-definition occurrences of [merge regions](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md) and the concurrent effect hosting, all data-free.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.5 makes each embedded Sub-Process instance a contextual scope, and Clause 10.4.1 ties a Property's or Data Object's lifetime and visibility to its parent instance and that instance's descendants. Two instances of one Sub-Process are two instances, so each owns its own data; nothing in the standard lets one instance see another's. BPMN references data by element identity and has no name shadowing, so the name-based resolution stays the CIB extension that [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md) records.

CIB Seven `2.2.0` (pinned `5a45b47ea2`) realizes this per execution. Every token that enters a scope activity gets its own scope execution, created in `PvmAtomicOperationCreateScope` (`execution.createExecution()`, engine `impl/pvm/runtime/operation`, lines 38–53). Each `ExecutionEntity` owns its own variable store. `AbstractVariableScope.setVariable` (lines 331–345) updates the nearest execution holding the name, walking `getParentVariableScope()`, which is `getParent()` with no concurrency special case (`PvmExecutionImpl`, lines 1697–1699). It creates a binding at the root only when no execution holds the name. `getVariable` resolves nearest-first (lines 190–198), and a present null hides a parent binding. Input mappings run on the new scope execution against its parent (`IoParameter.execute(scope, scope.getParentVariableScope())`). Output mappings run in `ExecutionEntity.destroy` before the locals are removed (lines 518–572). Concurrent executions are non-scope children of the scope execution. A non-local write from a concurrent branch therefore reaches the same frames the scope execution would, and that is the frame set this account's occurrence chain consults.

The source evidence for two live executions of one Sub-Process definition is an inference from these code paths. The closest engine tests are Multi-Instance ones (`InputOutputTest.testParallelMISubprocessIoSupport`) and `SubProcessTest.testTwoSubProcessInParallel`, which uses two different definitions. The family therefore runs the claim-assessment and supplier-rating models below on the CIB oracle as calibration of the concurrent same-definition clause. `CIB-EXT-0020`'s boundary widens from serial nesting to concurrent and same-definition occurrences, with these citations and that calibration; no new relationship ID is needed. Concurrent mapped Calls reuse the [Call variable mapping](CALL-VARIABLE-MAPPING-SPEC.md) relationships unchanged.

## Required, optional and excluded scope

Required: everything the concurrent scope profile admits today (the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope), merge regions, data-free Service Tasks and Process-root Calls), plus:

- `camunda:inputParameter` and `camunda:outputParameter` declarations on ordinary embedded Sub-Processes, including merge targets, within the [nested scope-data bounds](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope): at most eight of each per Sub-Process; inputs are String literals or exact `${name}` references; outputs are exact `${name}` references to a local of the same Sub-Process;
- input and output mappings on Service Tasks under the existing effect contract, with exact `${name}` sources;
- User Task completion patches restricted as in `NSD-TASK-01`, over the occurrence chain below;
- `camunda:in` and `camunda:out` variable mappings on Process-root Calls, under the [Call variable mapping](CALL-VARIABLE-MAPPING-SPEC.md) bounds, including two mapped Calls of one definition on concurrent Parallel branches;
- Start bindings for the names the Program reads at Process level.

Optional: declarations at several depths, one name declared at several levels, local null shadowing, and any mix of declared and undeclared scopes.

Excluded:

- re-entry of a Sub-Process or Call through a cycle (`PC-CF-06`);
- mapped Calls whose caller is an embedded occurrence;
- a Service Task in a model with a Call Activity, as today;
- structured values and the `SingletonBusinessItem` domain;
- expressions beyond exact `${name}`, gateway conditions, interruption, Errors, Multi-Instance, Message and Timer events;
- BPMN `property` and `dataObject` declarations;
- a Program whose static data envelope exceeds its budget (`CSD-CAPACITY-01`);
- every exclusion of the current profile.

These restrictions narrow admission only. Structured values, cycles and embedded callers later broaden the class without reinterpreting an admitted model, because nothing below depends on a value's shape or on the absence of a later occurrence.

## Profile and public contract

The `SCOPE` family profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). This lane is chosen over growing the `DATA` profile for one reason: capacity. Concurrency with `SingletonBusinessItem` values needs a schedule-dependent capacity journey over concurrent waits, which the [nested scope-data preflight](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#temporal-hosting-and-refinement-preflight) deferred. A bounded scalar domain allows a Program-only bound instead. The `DATA` profile keeps its serial admission and its structured domain, and its accepted models keep their exact behaviour (`CSD-CHAIN-01`).

The profile's value domain changes from empty to bounded String or present null at every surface:
- Start bindings;
- User Task completion patches;
- effect arguments and results;
- scope locals and Call mappings.

This is a new `boundedString` arm of [`EffectMappingValuePolicy`](../../BpmnSemantics/SemanticProcess/EffectMappingValuePolicy.lean) and its TypeScript counterpart. It admits `.string s` with at most 1,024 UTF-8 bytes, the existing root-String bound of `PBV-EFF-01`, and `.null` as a present value. The existing `scalar` arm has no byte bound, so it cannot carry a static envelope.

No wire shape changes: Programs gain the existing optional `scopeLocalData` table, which admission accepts under this profile as well, and the existing variable-mapping Call form. The profile artifact stays byte-identical. As for Service Tasks and Calls, the [profile README](../../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/README.md) gains a paragraph superseding its data exclusions, and the new scenarios cite `CIB-EXT-0020` and the Call mapping relationships.

## Representation and runtime ownership

The one representation change replaces the definition chain with the occurrence chain in [NestedScopeData](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and its TypeScript counterpart, for every profile that consults scope data. `read?`, `readOutcome?`, `write?` and `writeAll?` take the reading occurrence (a `ScopeOccurrenceId`) instead of a definition. They walk `state.scopeOccurrences` parent links to the instance root, and they select each consulted frame by exact owner through `selectScopeVariables?`. `resolveOwner?`'s refusal on several live frames of one definition disappears, because no frame is ever selected by definition. Its callers already hold the owner occurrence: the effect arming reader, Call input and output, and entry and completion. `occurrenceWithParent?`, which requires a unique live occurrence per definition, gives way to the entering or completing occurrence that the operation already addresses.

The gate `nestedScopeDataProgram` becomes a two-member profile set: the `DATA` profile with `singletonBusinessItem`, and this profile with `boundedString`. Every resolution site takes its value policy from the profile instead of the fixed `singletonBusinessItem`.

Concurrent closure needs one change that the serial account never exercised. [`internalScopeCreationRetentionUnchanged`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) excludes any declared scope from the prepared scope-creation path. The regional completion selection in [InternalRegionalSelection](../../BpmnSemantics/SemanticProcess/InternalRegionalSelection.lean) does the same, with the comment "a declared scope is never a regional candidate". An unprepared candidate beside any other offer makes the frontier `.ambiguous`, so a Parallel fork into two declaring Sub-Processes would roll back as `ambiguousInternalChoice`. Declared entry and completion therefore become prepared candidates:
- **Entry.** The patch carries the evaluated frame. Its footprint reads `scopeVariableScope` of every frame consulted on the parent chain, `scopeParent` of every chain link and `processVariable` of every name that resolves to the Process, and writes `scopeVariableScope` of the new frame.
- **Completion.** The patch carries the output writes and the frame disposal. Its footprint writes `scopeVariableScope` of each written frame or `processVariable` of each written name, and the disposed frame.

The existing atoms suffice. Two sibling entries read the same parent frames and write different frames, so they form an independent batch. A completion writing a parent frame conflicts with a co-enabled reader of that frame, which no admitted closure reaches (`CSD-PREPARE-01`). A per-name frame atom would only remove that unreachable conflict, and adding it later changes no admitted behaviour. Effect arming keeps its present read claim: arming writes only its own Activity scope, which no nested read consults.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). [Nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), and its Lean counterpart, gains the data declarations above and three Program-level checks:

- **Availability (`CSD-AVAILABLE-01`).** A `${name}` read is available when an enclosing input of its occurrence chain declares it, or when a definite write lands at an owner on the reader's chain on every path from the owner's Start to the reader. A Service output, Sub-Process output or Call output is a definite write; a User Task patch is not. After a Parallel join, the definite writes are the union of the branches' sets, because every branch has run. After an Exclusive merge, they are the intersection. A write in one fork branch is never available inside another branch or in a merge target reached from another branch. Every other read becomes a required Start binding, and Start without one is `rejected`. A Start binding outside the Program's Process name set is `rejected`. That set is the required names and every write target that resolves to the Process.
- **Capacity (`CSD-CAPACITY-01`).** Admission computes the static data envelope: the number of data slots times the cost of one bound slot.
  - **Slots** are, per scope definition, its locals times its live multiplicity; per Service Task, its inputs times its live multiplicity; per mapped Call, its `in` mappings times its live multiplicity; and the Process names. Live multiplicity is the multiplicity weight the 128-task bound already computes, through `multiplicityWeightedExtra`.
  - **One slot** costs the UTF-8 bytes of its name, plus 1,024, plus the canonical per-binding encoding overhead that the encoder measures.
  - **The check.** A Program whose envelope exceeds half of the committed-state and publication-batch budgets is refused before Workflow creation, with the envelope's typed reason. The reserved patch and result of each User Task, effect and Call must fit the stimulus budget.
  - **Values cannot breach it.** It depends only on the Program, so no Start value can exceed it.
- **Concurrent Calls.** Two mapped Calls of one definition may sit on concurrent branches only with Process-root callers.

The nearest wrong algorithms are three:
- resolving by definition, which picks the first live frame of the definition, perhaps the sibling's;
- refusing two live frames, which is today's behaviour;
- counting a write in one branch as available in a sibling branch.

## Stable rules

- `CSD-ADMIT-01`: admission accepts exactly the required and optional scope above and rejects every exclusion, every parser warning and every String literal input over 1,024 UTF-8 bytes.
- `CSD-VALUE-01`: every value at every surface of this profile is a String of at most 1,024 UTF-8 bytes or a present null; anything else is refused atomically at the surface that introduces it.
- `CSD-CHAIN-01`: the chain of an occurrence is that occurrence followed by its live parent occurrences up to the instance root, the hosting root or a called root. `NSD-READ-01`, `NSD-WRITE-01`, `NSD-INIT-01`, `NSD-OUTPUT-01`, `NSD-TASK-01` and the Call rules `CVM-RESOLVE-01`, `CVM-IN-01` and `CVM-OUT-01` hold with this chain in place of the definition chain, for every profile that consults scope data. Where every definition on a chain has one live occurrence, the two chains name the same frames, so no accepted `DATA` model changes behaviour.
- `CSD-ISOLATE-01`: a read, write, input or output never consults or changes a frame that is not on the performing occurrence's chain. Two live occurrences of one definition never share a frame, a local or a counter.
- `CSD-INIT-01`: each entering occurrence evaluates its inputs against its own parent occurrence's chain before its frame exists. Two concurrent entries of one definition see the same parent values and install two frames.
- `CSD-AVAILABLE-01`: as stated under admission.
- `CSD-PREPARE-01`: declared entry and completion are prepared internal candidates whose patches equal the evaluator's results and whose footprints carry the frame and Process atoms above. On every registered schedule, no closure reaches `ambiguousInternalChoice`.
- `CSD-CALL-01`: a returning Call writes its own `camunda:out` mappings, selected by its return operation as in `CALLN-FRAME-01`, through its caller's chain, whichever concurrent Call of the same definition returns first.
- `CSD-CAPACITY-01`: as stated under admission.
- `CSD-REFUSE-01`: every refusal leaves the predecessor state, frames, tasks and effects unchanged. Start without a required binding, a binding outside the Process name set, an out-of-domain value and a wrong patch are `rejected`. No automatic step can fail after an accepted command.

Observation adds nothing beyond the existing `openEffects` arguments and Process `variables`. [SDATA-OBSERVE-02](SCOPED-DATA-SPEC.md#sdata-observe-02) remains the projection boundary.

## Separating witnesses

Three whole models with business purposes and one refusal model carry the witnesses. The three are built so that one fixture defect cannot hide every rule.

- **Claim damage assessment.** A merge region: *Inspect vehicle* and *Inspect property* run on two fork branches and merge into the *Price damage* Sub-Process, which therefore runs twice concurrently. It declares `estimate = "pending"` and `adjuster = ${noAdjuster}`, where the Start binds `noAdjuster` to null over a Process `adjuster` of `"desk"`. Its *Fetch rates* Service Task maps `${estimate}` and `${adjuster}`, *Assess damage* writes `estimate`, and the Sub-Process outputs `estimate` to `lastEstimate`.
- **Facility inspection.** An outer *Inspection* Sub-Process declares `findings`. Inside it, a Parallel fork leads to two declaring Sub-Processes, *Electrical check* and *Fire safety check*, each with a local `result`, and each writes the outer `findings` and its own `result`. After the join, *Summarize* reads both outputs.
- **Supplier rating.** A Parallel fork leads to two Calls of one *Credit check* Process, mapping `supplierA` and `supplierB` in as `applicant` and `rating` out to `ratingA` and `ratingB`.
- **Capacity.** One Program whose envelope exceeds its budget, and one that fits exactly.

| Rule | Witness | Seeded mutation it must catch | Lanes |
|---|---|---|---|
| `CSD-CHAIN-01`, `CSD-ISOLATE-01` | In claim assessment, completing *Assess damage* in the second *Price damage* occurrence with `estimate = "4200"` leaves the first occurrence's `estimate` at `"pending"`; the first *Fetch rates* effect shows `"pending"`, the second shows `"4200"`. | Resolve by definition; flatten both occurrences into one frame; refuse two live frames. | Core, Lean, pipeline, CIB calibration |
| `NSD-READ-01` over `CSD-CHAIN-01` | Both *Fetch rates* effects show `adjuster = null` although the Process `adjuster` is `"desk"`. | Read the Process before the frames. | Core, Lean, pipeline |
| `CSD-INIT-01` | Both *Price damage* entries happen in one closure after the fork; each frame holds `"pending"` and the null. | Evaluate the second entry against the first occurrence's frame. | Core, Lean, pipeline |
| `NSD-OUTPUT-01` over the chain | The two occurrences output `estimate` to `lastEstimate` in both completion orders; the Process holds the later completer's value, by explicit command order. | Write outputs from the parent frame; drop the second output. | Core, Lean, pipeline |
| `CSD-PREPARE-01` | In facility inspection, the fork enters both checks in one closure and commits without `ambiguousInternalChoice`. The core asserts the prepared patch against the evaluator after every committed step of every registered schedule. | Keep declared scopes out of the prepared path. | Core, Lean, pipeline |
| `NSD-WRITE-01` over the chain, `CSD-ISOLATE-01` | Each check writes the outer `findings` (its nearest declaring owner) and its own `result`. *Summarize* reads the last-written `findings`; the sibling's `result` is never visible. | Write to the innermost frame; write to the Process. | Core, Lean, pipeline |
| `CSD-AVAILABLE-01` | *Summarize* reads both check outputs after the join without Start bindings. A *Fire safety* read of the *Electrical check* output is a required Start binding. | Count a sibling branch's write as available; take the intersection at a Parallel join. | Source, core, Lean |
| `CSD-CALL-01` | *Credit check* B returns before A; `ratingB` and `ratingA` hold their own instances' values. | Select output mappings by called definition. | Core, Lean, pipeline, CIB calibration |
| `CSD-VALUE-01`, `CSD-REFUSE-01` | A 1,024-byte patch value commits; a 1,025-byte one, a Boolean and a binding outside the Process name set are `rejected` with the state unchanged. | Commit a partial patch; admit an unbounded String. | Core, Lean, value-domain matrix |
| `CSD-CAPACITY-01` | The over-budget Program is refused before Workflow creation with the typed reason; the exact-fit Program runs. | Count each definition once instead of by multiplicity. | Protocol component test, pipeline |
| `CSD-ADMIT-01` | Each exclusion is refused, including a mapped Call with an embedded caller and a re-entry cycle; the retained models compile. | Admit a Call output whose target is a sibling's local. | Source, Lean |
| `CSD-CHAIN-01` preservation | Every registered `DATA` profile scenario keeps its exact committed states. | Change resolution for single-occurrence chains. | Core, Lean, pipeline |

## Lean assurance lane

Lane shape: proved

Evidence: the occurrence-chain mechanism is proved by generalizing the laws of [NestedScopeDataLaws](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean) from the definition chain to the occurrence chain; admission, availability and capacity are checked. The proved laws are:

- **Nearest owner.** Resolution selects the first frame on the occurrence chain that declares the name, otherwise the Process or the called root. This is `resolveOwner?_frame_nearest` restated.
- **Exact write.** A write changes exactly the resolved frame or binding (`write?_frame`, `write?_process`).
- **Off-chain isolation.** A new law: every frame whose owner is not on the writer's chain is unchanged. Its corollary is that a sibling occurrence of the same definition is unchanged.
- **Initialization.** A new frame holds exactly the inputs evaluated against its parent occurrence's chain (`initializeFrame?_reads_parent_chain`).
- **Retirement.** Completion removes exactly the completing occurrence's frame (`completeScopeState?_retires_frame`).
- **Prepared refinement.** The prepared declared entry and completion patches equal `enterDeclaredScope?` and `completeDeclaredScope?`. This extends `selectInternalScopeCreation_refines` and the regional completion refinement to declared scopes.

Checked: admission, availability, value bounds and the capacity envelope, through the conformance fixture of the three models and the source and core lanes. Open, recorded as such: there is no quantified Lean law that an admitted Program never reaches `ambiguousInternalChoice`. The core checks it on every registered schedule, and the preparation laws above make each executed patch sound. The `NSD` preservation laws stay as they are: they already show that declared entry and completion equal the undeclared ones under every other profile and for every undeclared scope.

## Temporal hosting and refinement preflight

The family adds no hosting mechanism. Durable ingress stays the existing Start, User Task Update, effect Activity result and Call return. Effect Activities with argument snapshots run through the existing [ordinary-effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts), which already passes each effect's argument snapshot to its Activity. Frames are committed state carried through Continue-As-New. There are no timers, Message waits, cancellation or interruption.

What changes is capacity. The profile's Start capacity envelope is inapplicable today because the profile admits no values. `CSD-CAPACITY-01` replaces it with the static data envelope: the data half of every measured budget is fixed by the Program before Workflow creation, and no schedule or value can exceed it. The capacity owner's component test proves three things:
- the maximal data-free control state of the profile (128 weighted tasks, depth three, 32 Service Tasks) fits the other half of the committed-state and publication-batch budgets;
- the exact-fit witness Program, with every slot holding a 1,024-byte String, fits every budget;
- the over-budget Program is refused.

The preserved relation is the [concurrent scope Service Tasks relation](CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#temporal-hosting-and-refinement-preflight), extended with every frame (owner, bindings), every effect argument snapshot and the Process bindings.

Risks and their deciders:
- **Ordering.** Concurrent writes to one Process or parent name commit in command order, which is an explicit input; the pipeline realizes both orders.
- **Replay.** Frames and snapshots are deterministic functions of committed state.
- **Deduplication.** As today.

Under the once-per-mechanism rule, no new hosted refinement witness is needed. The pipeline cases of the three models run once at family closure.

## Evidence and acceptance

The three models carry answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, corpus rows and the About disclosure. The claim-assessment and supplier-rating scenarios also run on the CIB oracle as calibration of `CIB-EXT-0020`'s widened boundary.

Acceptance: Lean, core and pipeline agree on every scenario of this profile and of the `DATA` profile, and the hosted pipeline passes once at family closure. Then these clauses are evidenced, and their remaining clauses are recorded in the checklist rows:
- the concurrent embedded-owner and concurrent mapped-Call clauses of `PC-DATA-04`;
- the concurrent-occurrence data clause of `PC-SCOPE-02`;
- the data clause of `PC-SCOPE-01`.

## Common-mode risks

- Both languages could share a wrong chain walk, for example stopping at the first parentless occurrence inside a called instance. The supplier-rating model and the preserved `DATA` Call scenarios separate it, and the CIB calibration adds an independent oracle.
- The availability analysis and the capacity envelope are each written in both languages from this text. Their witnesses include a deliberately unavailable read and an exact-fit Program, so a shared off-by-one appears as a disagreement with the pipeline.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy). The profile identity, the Program and checked shapes and the schemas stay unchanged. Admission accepts the existing `scopeLocalData` table and variable-mapping Calls under one more profile, and the value policy gains one arm. No legacy reader or migration is added.

Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards. The decisive ones are:

- Commutation and IL: the [internal commutation census](../../scripts/internal-commutation-census.test.ts) and the [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- Values: the [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts).
- Registration: the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- Resolution: [NestedScopeData](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and its [laws](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean), and the TypeScript [nested scope data](../../packages/semantic-core/src/nested-scope-data.ts).
- Closure: the Lean [scope-creation selection](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) and [regional selection](../../BpmnSemantics/SemanticProcess/InternalRegionalSelection.lean), and their TypeScript counterparts.
- Admission: [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) and their Lean counterparts.
- Values: the Lean [effect mapping value policy](../../BpmnSemantics/SemanticProcess/EffectMappingValuePolicy.lean) and its [TypeScript counterpart](../../packages/semantic-core/src/effect-mapping-value-policy.ts).
- Source: [compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) and the Sub-Process mapping source.
- Hosting: the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts) and [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts).
- Registration: the profile README, scenarios, pipeline cases, value-domain matrix, corpus and About.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
