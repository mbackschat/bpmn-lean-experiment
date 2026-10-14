# Nested embedded scope data proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can a business process nest ordinary embedded Sub-Processes in a serial chain, declare local data on each, read and write that data by the CIB name-resolution rule and carry portable structured values through it, with every local retiring exactly with its scope?

This is the first increment of the embedded and called scope family selected in [PLAN](../PLAN.md#exact-resume-point). It serves the embedded, scope-local surfaces of `PC-DATA-03` and the embedded-owner clauses of `PC-DATA-04`, `PC-DATA-05` and `PC-DATA-06` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#business-data-and-expressions), restricted to serial composition. It does not claim `PC-SCOPE-01`: concurrent branches inside nested scopes need a concurrent-wait Start capacity account, and concurrent branches with effects need a concurrent-effect hosting mechanism that [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) refuses today. Expression-based mappings wait for `PC-DATA-07`.

Later increments of this family are concurrent nested scopes (`PC-SCOPE-01`), Call input/output mapping (`PC-SCOPE-04`, after the called-definition policy of `PC-SCOPE-03`) and repeated or concurrent activations of one definition (`PC-SCOPE-02`, after `PC-CF-06`/`PC-CF-07`). This increment is the family's selected batch under the [family review unit](../REVIEW-POLICY.md#independent-cold-review-gate): it takes this proposal review, is implemented as one batch and then takes its own checkpoint and closure review. Each later increment is proposed as an amendment to this capsule and forms its own batch with its own proposal, checkpoint and closure review, so no Call, concurrent or repeated-activation semantics are implemented under this review.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.5 makes an embedded Sub-Process a contextual scope, and Clause 13.3.4 completes its instance only when no token remains inside and no contained Activity is active. Clause 10.4.1 ties a Property's or Data Object's lifetime to its parent Sub-Process instance and makes it accessible to that parent's children, including nested descendants. BPMN references such data by element identity, so it has no name shadowing and no rule for writing an undeclared name.

CIB Seven `2.2.0` operationalizes scope data by name. At the pinned revision (`5a45b47ea2`, verified by the `research` doctor scope), `BpmnParse.checkActivityInputOutputSupported` accepts `camunda:inputOutput` on an ordinary `subProcess` and refuses output parameters only on End Events and Multi-Instance constructs. `PvmExecutionImpl.executeIoMapping` runs every input parameter at entry; `IoParameter.execute(scope, scope.getParentVariableScope())` lets `InputParameter` evaluate in the outer scope and install a local binding. `ExecutionEntity.destroy` runs the output parameters whenever the scope is destroyed without skipped IO mappings; `OutputParameter` evaluates in the inner scope and calls `setVariable` on the outer scope. `AbstractVariableScope.setVariable` updates the nearest scope that has the name locally, walking parent by parent, and creates the binding at the root only when no scope has it. A present null is a local binding and therefore shadows.

Candidate `CIB-EXT-0020` in the [relation register](../CIB-BPMN-RELATION-REGISTER.md) records this account for nested ordinary embedded scopes. It broadens the one-body-level account of `CIB-EXT-0017`, which stays unchanged. The name-based account is a CIB extension layered over the BPMN scope and lifetime rules, not a reinterpretation of them. CIB also runs outputs on non-normal destruction, for example the Error path recorded by `CIB-EXT-0016`; this increment admits no interruption or Error exit, so "outputs at normal completion" is an admission restriction and later interruption or Error amendments must decide the abnormal-exit output policy.

## Required, optional and excluded scope

Required: one private executable root Process with one None Start and one None End; ordinary embedded Sub-Processes nested to a definition depth of at most three below the root; every scope, including the root, is one serial path from its None Start through User Tasks, mapped Service Tasks under the existing effect contract and nested Sub-Processes to its single None End; at most eight `camunda:inputParameter` declarations per Sub-Process, each a String literal of at most 1,024 UTF-8 bytes or an exact `${name}` reference; at most eight `camunda:outputParameter` declarations per Sub-Process, each an exact `${name}` reference to a name declared by an input parameter of the same Sub-Process.

Optional: scopes without declarations; one name declared at several levels; one local copied to several output targets.

Excluded: Parallel, Exclusive, Inclusive and Event-Based Gateways, conditions, any token split, Call Activities, cycles, repeated activation of one Sub-Process definition, Event Sub-Processes, boundary Events, Multi-Instance, Transactions, Compensation, JUEL beyond exact `${name}`, script or list/map mapping notation, output sources that are not declared locals of the same scope, duplicate input names or output targets within one Sub-Process, BPMN `property` and `dataObject` declarations inside Sub-Processes, and any new public observation field. These restrictions bound admission only; the representation below admits concurrent scopes, Calls and repeated activations later without reinterpreting accepted models.

Because every Sub-Process definition is activated at most once per Process instance, element-identifier task identity stays unique, which the [embedded completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#runtime-state-identity-and-ownership) requires; `PC-SCOPE-02` reopens that contract.

## Profile and value domain

Candidate identity: `cibseven-2.2.0-nested-embedded-scope-data-draft`, the family's cumulative profile, widened in place by later increments under the [pre-baseline profile rule](../../contracts/README.md). Its value domain is `SingletonBusinessItem` from the [portable values capsule](PORTABLE-BUSINESS-VALUES-PROPOSAL.md#public-value-contract), with the 1,024-byte root-String bound, at every surface: Start bindings, User Task completion patches, Service effect arguments and results, scope locals and output targets.

`NSD-TASK-01`: a User Task completion patch may carry only names declared by a frame on the task's chain, each at most once and each with a `SingletonBusinessItem` value; it updates those frame bindings by `NSD-WRITE-01` and never adds a Process binding. A User Task outside every declaring frame therefore admits only the empty patch. A name outside that set, a duplicate name or an out-of-domain value makes the patch wrong, and a wrong patch is `rejected`. Assignment-form metadata is excluded. The patch is measured as the UTF-8 bytes of the canonical JSON of its binding array, ordered by name, each element `{"name":…,"value":…}` with the value in the portable canonical value JSON; at most 16,384 bytes, the per-value allowance, is admitted, and a larger patch is `rejected`. This bounds every completion by the declared frame names, at most twenty-four across three levels, and by one value allowance in total. The name restriction is a profile admission restriction, not CIB behaviour: CIB's `TaskEntity.setExecutionVariables` accepts any name and creates a root binding for one no scope declares; the profile refuses such a completion instead of adopting that. Every copy across a scope boundary is by value; no committed state shares structure with a caller-owned stimulus.

`NSD-AVAILABLE-01` generalizes `SBT-AVAILABLE-01` from the [serial business-task capsule](SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md): admission scans the serial chain, tracking names declared by enclosing input parameters and names definitely produced by earlier Service outputs or Sub-Process outputs. A definite write lands at its statically resolved owner, the nearest enclosing scope declaring the target name or otherwise the Process, and it counts as available only while that owner is on the reader's chain; a write landing in a frame stops counting when that frame's scope completes. Every other `${name}` read becomes a required Start binding; Start without one is `rejected`, and null counts as present. An unavailable read is therefore unreachable after an accepted Start.

## Representation and runtime ownership

The Semantic Process IL grows by one Program-level declaration table, following the precedent of the Program's other scope-declaration tables such as `interruptingMessageEventSubProcesses`: `scopeLocalData: ScopeLocalData[]`, canonical by `scopeId`, each record `{ scopeId, localInputs: VariableMapping[], localOutputs: VariableMapping[] }` with both lists canonical by target name and `localInputs` nonempty, since every output reads a declared local. `enterScope` and `completeScope` keep their shapes and consult the record of their child scope; a scope without a record has no locals and no outputs. As for that precedent, the field is optional and absent unless nonempty (schema `minItems: 1`), its Lean field defaults to `[]`, and every existing profile omits it, so no existing producer or serialized Program changes. The checked graph carries the same mappings in an optional `scopeLocalData` declaration of the checked contract, keyed by the Sub-Process scope's checked identity, and independent lowering maps each checked record to the Program record of the lowered scope definition. Program admission requires each `scopeId` to name an ordinary embedded scope entered by exactly one `enterScope`, and rejects the field under every other profile. A table rather than new operation fields leaves the entry and completion operations unchanged, which bounds the change to the profile's own Programs. The changed owners are the [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md#definition-scope-entry-and-completion), the [IL schema](../../contracts/schemas/semantic-process.schema.json), the [TypeScript contract](../../packages/semantic-core/src/semantic-process-contract.ts), the Lean Program structure and both JSON codecs. The TypeScript contract is near its 800-line review target, so the new record moves together with the existing scope-entry operation types into one cohesive scope-operation contract owner first, if `what-binds` reports that the growth would cross the target.

Scope locals use the existing occurrence-keyed `variables.scopes` frames from [scoped data](SCOPED-DATA-SPEC.md), already shared by the sequential and parallel Multi-Instance bodies, and runtime scope occurrences already carry their parent occurrence. The scope-local, mapping and output value policy becomes profile-derived, following the `PropertyPathValuePolicy` and effect-mapping precedents, with arms `scalar` and `singletonBusinessItem`.

## Stable rules

`NSD-ADMIT-01`: admission accepts exactly the required and optional scope above and rejects every exclusion, every parser warning and every String literal input over 1,024 UTF-8 bytes.

`NSD-AVAILABLE-01`: as stated under the profile above.

`NSD-INIT-01`: automatic entry with a nonempty `localInputs` list evaluates every mapping against the visible context of the entering parent occurrence, through that occurrence's whole chain, before the new frame exists, then installs one frame owned by the new occurrence. An empty list installs no frame, so a scope without declarations owns none and the operation is state-identical to today's `enterScope`. Declaration order is irrelevant and an input cannot read a sibling input of the same Sub-Process.

`NSD-READ-01`: a name resolves by walking from the reading occurrence outward through parent occurrences. The first frame declaring the name decides, including a present null; otherwise the Process binding decides.

`NSD-WRITE-01`: a User Task completion binding, Service output or Sub-Process output updates the nearest frame on the writer's chain that declares the name, otherwise the Process binding, creating it when absent. It never creates a local and never changes another frame.

`NSD-OUTPUT-01`: at normal completion, each `localOutputs` mapping reads its source from the completing frame only and writes through `NSD-WRITE-01` starting at the parent occurrence. Validation, all writes and disposal commit atomically with the completion step. Because sources are declared locals whose values are already in the profile domain, an earlier output cannot change a later source and an output value cannot be invalid at completion.

`NSD-RETIRE-01`: completion disposes exactly the completing occurrence's frame, if it has one; the Process and the ancestors keep their bindings, and no retired local remains readable.

`NSD-VALUE-01`: structured values keep multiplicity, order, Map keys, Decimal scale and present null through every frame, state, observation and restoration; a root List or a 1,025-byte root String is refused atomically at the surface that introduces it.

`NSD-REFUSE-01`: every refusal leaves the predecessor state, frames, tasks and effects unchanged. Start without a required binding, a wrong or out-of-domain completion patch and a wrong effect result are `rejected`; no automatic entry or completion step can fail after an accepted command, by `NSD-AVAILABLE-01` and `NSD-OUTPUT-01`.

Observation adds nothing: reads are observed through existing `openEffects` arguments, writes through later arguments and the Process `variables`, and [SDATA-OBSERVE-02](SCOPED-DATA-SPEC.md#sdata-observe-02) remains the projection boundary.

## Separating witnesses and rule-to-evidence matrix

All witnesses run in one purchase-order approval model with three serial levels (order approval, then credit review, then a compliance check) and two smaller models for refusals and capacity, so that one fixture defect cannot hide every rule.

| Rule | Witness | Seeded mutation it must catch | Lanes |
|---|---|---|---|
| `NSD-ADMIT-01` | Each exclusion, including a Parallel fork in a scope and an output sourced from a parent name, is refused; the retained models compile. | Admit an output whose source is not a declared local. | Source, core, Lean admission |
| `NSD-AVAILABLE-01` | A compliance-scope read of `riskClass`, not declared or produced, makes `riskClass` a required Start binding; Start without it is rejected, with present null it commits. An inner Service output targets `note`, declared by order approval; a root read of `note` after order approval completes is a required Start binding. | Drop the required-binding derivation; keep a monotone produced-name set. | Source, core, Lean |
| `NSD-TASK-01` | A credit-review completion naming a frame-declared name commits; one naming an undeclared name, repeating a name or carrying a root List is rejected with the state unchanged. | Admit an undeclared name as a new Process binding. | Core, Lean, pipeline |
| `NSD-INIT-01` | Credit review declares `limit = ${requestedLimit}` and `requestedLimit = "0"`; the nested effect reads `limit` as the Process value, not `"0"`; reversing the declarations commits the identical state. Compliance declares `reviewer = ${status}` while order approval's `status` is null over a Process `"open"`; the compliance effect shows `reviewer = null`. | Evaluate inputs in declaration order against the new frame; initialize from the Process only. | Core, Lean, pipeline |
| `NSD-READ-01` | Process `status = "open"`, `initialStatus = null`; order approval declares `status = ${initialStatus}`; the compliance Service maps `${status}` and its open effect shows `null`. | Read the Process before the frames. | Core, Lean, pipeline |
| `NSD-WRITE-01` | The credit-review User Task completes with `status = "approved"`; the Process `status` stays `"open"` and order approval's later output of `status` to `finalStatus` publishes `"approved"`. Order approval and credit review both declare `decision`; a credit-review completion writing `decision` changes only the credit frame, so order approval's output of `decision` to `finalDecision` publishes its initial value. | Write to the Process; write to the innermost frame; write to the outermost declaring frame. | Core, Lean, pipeline |
| `NSD-OUTPUT-01` | Order approval outputs `order` to `approvedOrder` and `status` to both `finalStatus` and `auditStatus`; reversed declarations commit the identical state. Compliance outputs `checkResult` to `status`, declared by order approval, which changes that frame and leaves the Process `status`; credit review outputs its own local `limit` to `limit`, which writes the Process `limit`. | Read output sources from the parent frame; start the write at the completing occurrence. | Core, Lean, pipeline |
| `NSD-RETIRE-01` | After credit review completes, its frame is absent from runtime state and an order-approval effect reads `limit` as the Process value. A kept orphan frame is invisible at the public boundary, so its evidence is the Lean disposal law and the core state-validity check that every frame's owner is a live scope occurrence. | Keep the retired frame. | Lean law, core state validity |
| `NSD-VALUE-01` | An order Map with two equal line items, a nested address with a present null and a negative Decimal passes Start, two frames, an effect result and an output unchanged. | Deduplicate list members. | Core, Lean, pipeline, restoration |
| `NSD-REFUSE-01` | A patch of exactly 16,384 bytes commits; a root List patch, a 16,385-byte patch, below every host limit so the refusal is semantic, and a 1,025-byte root String result are rejected with the predecessor state unchanged. | Commit a partial frame update. | Core, Lean, value-domain matrix |

## Lean assurance lane

Lane shape: proved

Evidence: the starting owners are [scope variable data](../../BpmnSemantics/SemanticProcess/ScopeVariableData.lean), [scoped data primitives](../../BpmnSemantics/SemanticProcess/Data.lean) and the embedded scope entry and completion relation; they are inputs to this account, not evidence for it.

The frame laws are proved and reused by every later increment; admission and the witnesses are checked. The chain walk is a computable function over runtime scope occurrences, recursing on the parent link with the number of live scope occurrences as fuel. The quantified laws assume runtime well-formedness, stated as exact hypotheses: frames are unique per owner, every live occurrence's parent is live, and parent links are acyclic.

- Read law: the walk returns the first declaring frame on the chain, otherwise the Process binding, independently of surplus fuel.
- Write law: a write changes exactly the nearest declaring frame or the Process binding.
- Disposal law: completion removes exactly one frame and preserves every other frame and the Process.
- Initialization law: entry evaluates against the parent's visible context only.
- Reduction law: on states in which every chain carries at most one frame, the generalized read, write and initialization equal the current one-frame operations.
- Entry and completion preservation: for a scope without a `scopeLocalData` record, `enterScope` and `completeScope` produce exactly the states they produce today, so every embedded, Transaction and Call-bearing profile, whose Programs omit the table, keeps its runtime state, including validators that require no scope frames.
- Preservation: the reduction law is the preservation basis for every existing profile, because their admission keeps every chain to at most one frame (Multi-Instance bodies directly under the root only). The value-policy `scalar` pin preserves only their value domain.
- Nearest checked non-law: writing to the innermost frame is not the nearest-owner write when only an ancestor declares the name.

The declarative relation arms for `enterScope` and `completeScope` gain the initialization premise and the output-write conclusion, and the evaluator-soundness bridge extends to them. The bound is two new law owners and one conformance owner, each at most 800 nonblank lines; growth beyond it triggers replanning. The core Lean edits to `Data`, `ScopeVariableData`, the Multi-Instance scope write, the IL constructor and `ValueDomain` (including its pending unused-simp-argument lint) are made in one batch, with one full Lean gate at family acceptance.

## Temporal hosting and refinement preflight

The profile admits no token split, so [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) accepts its effect waits as serial and the `concurrentHostDrivenWaits` refusal stays unchanged; its [guard](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) must stay green. Durable ingress stays the existing Start, User Task completion and effect result; waits are one User Task or one effect at a time. There are no timers, Message waits, cancellation or interruption. Scope entry and completion are internal closure steps inside the command that reaches them, so no new Update, signal or Activity is added and no dedicated refinement witness is required under the once-per-mechanism rule.

Nested frames are ordinary runtime state carried through Continue-As-New, so the hosting risk is size. The profile joins the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts), whose [serial journey](../../packages/temporal-adapter/protocol/src/start-capacity-journey.ts) supports exactly this shape: one open wait at a time, with automatic scope entry and completion as internal steps. The envelope does not cover every admitted state: three frames of eight locals at the portable bounds exceed the 64 KiB committed-state budget, and a patch reserving every admitted name at full allowance would exceed the 64 KiB stimulus budget and the 65,536-byte patch-identity limit of the host's completion command. The journey therefore evaluates entry inputs and outputs on the actual Start values and reserved results, counting each copy where it lands, and reserves for each User Task one completion patch at the `NSD-TASK-01` cap of 16,384 bytes over that task's admitted names. A completion replaces frame bindings and adds no Process binding, so it grows committed state by at most that cap. The envelope charges every reserved completion the full cap as committed-state growth, whatever the reserved patch happens to replace, so a real patch writing into a name with a smaller prior value cannot outgrow the reservation. Today `completionFor` submits an empty patch for a plain User Task; for this profile it submits that reserved patch, so completions are reserved before Start rather than discovered after acceptance. Per task, as `PBV-EFF-05` does for effects, the reserved completion must fit the stimulus budget and the patch-identity limit; with at most twenty-four names and the cap this depends only on the Program, so a Program failing it is unsupported for the profile. A Start whose envelope exceeds an aggregate budget is refused with the envelope's typed reason before Workflow creation. The witness models are sized so that their actual Start and reserved completions fit every budget; the capacity model carries the refusal, a Start whose structured values push the reserved committed state past its budget. Its guards are the effect-data and Message-payload envelope tests' counterparts for this profile, each with a record-drop mutation, plus a mutation that reserves the empty patch and a guard that a patch to a different admitted name with a smaller prior value stays within the reserved estimate.

## Evidence and acceptance

The three models carry the witnesses as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, a corpus row and the About disclosure. The CIB lane is a calibration probe extending the existing body-data probe to two nested levels; `CIB-EXT-0020` records that admission's third level is uncalibrated. Acceptance: Lean, core and pipeline agree on every scenario, and the hosted pipeline passes once at family acceptance. Then the embedded, serial, scope-local clauses of `PC-DATA-03` to `PC-DATA-06` are evidenced; their concurrent, Call, repeated-activation and Multi-Instance clauses, and all of `PC-SCOPE-01`, stay open.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): the profile identity is additive, the optional `scopeLocalData` declaration is added to the one current checked and Program shapes, their schemas, codecs and lowering, every existing profile omits it and admission rejects it there, and no legacy reader or migration is added. Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards. The decisive ones are listed here.

- Schema and IL: [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and [internal commutation census](../../scripts/internal-commutation-census.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- Values: [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts).
- Registration: [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) for `CIB-EXT-0020` and the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- IL: the IL specification, schema, TypeScript contract (with the conditional extraction above), Lean IL constructor and both JSON codecs.
- Lean: scope variable data, scoped data primitives, Multi-Instance scope write, value domains, profile shapes, embedded scope admission, entry and completion relations, and one new conformance owner.
- TypeScript core: scope variable data, sequential and parallel scope data readers, Multi-Instance scope write, semantic process data, profile catalog, value domains and restoration, graph policy and scope runtime.
- Source: embedded Sub-Process source admission, the business mapping source for Sub-Process parameters, compilation dispatch and preservation capability.
- Temporal: Start capacity envelope and journey.
- Registration: profile artifact, scenarios, pipeline cases, value contract, corpus and About.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The first proposal review, against `ae20b678` from baseline `ece0021f` with packet `23aa96b9a395a8de50f7765d9b93d14e159b059b4556da38d902d35b5eb6b6fd`, rejected the draft. Its three blocking findings were host admission refusing Parallel forks combined with effects, the serial-only Start capacity journey, and an IL with no place for Sub-Process mappings. Six further findings covered unsupported preservation premises, missing witnesses, inconsistent coverage claims, an unaddressed reopen trigger, family review scope and CIB boundary precision. The correction narrows the account to serial nested scopes and adds typed IL fields, so it is material and returns to a fresh cold proposal review.

The fresh cold review of `eff1bee8`, packet `4891a6a82c6e477d27f126e933e9a670fb7c6b2d9044333e045817700707d6ee`, returned `approve-with-required-edits` with six required findings: the User Task completion contract and its capacity reservation, scope-aware availability, frame existence for empty input lists, witnesses that separate at the public boundary, the family batch arrangement, and the String-literal admission bound. The bounded correction awaits that reviewer's audit.
