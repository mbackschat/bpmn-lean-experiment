# Scope re-entry proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit Sequence Flow cycles in the Process root body, so that an embedded Sub-Process or a mapped Call on a cycle is entered again after its previous activation completed, each activation getting a fresh scope occurrence, fresh locals evaluated at that entry, fresh task and effect occurrences, and outputs written at its own end, while a command addressed to an earlier iteration is refused unchanged and every automatic burst stays within the declared closure limit?

This is the scope re-entry family of batch 3 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the resumption-bounded cycle account of the [cyclic control-flow specification](CYCLIC-CONTROL-FLOW-SPEC.md) and the [mixed-task control-flow account](MIXED-TASK-CONTROL-FLOW-PROPOSAL.md), applied to the scope frames of the [nested scope-data specification](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md) and the called-root frames of the [Call variable mapping specification](CALL-VARIABLE-MAPPING-SPEC.md). It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares that mechanism:

- `PC-CF-06`, primary: two rework iterations through an embedded Sub-Process and a Call expose distinct task, effect and scope identities and the intended retained data; a stale first-iteration command cannot settle the second; an over-limit automatic burst refuses at admission;
- `PC-DATA-04`, its repeated-lifetime clause: two successive lifetimes of one embedded owner and of one called owner never share a local, and retiring one deletes no Process value;
- `PC-SCOPE-02`, its re-entry clause: a later re-entry of the same embedded definition never sees the previous occurrence's locals or consumes its completion;
- `PC-HUM-01`, its scoped-rework clause: a User Task inside a re-entered scope gets a fresh engine-issued occurrence, and a completion naming the preceding loop's occurrence refuses unchanged.

Screened out, each with its reason: `PC-CF-04` and the Inclusive cells of `PC-CF-08` need held conditions (`PC-DATA-07`/`08`); `PC-MI-11` re-enters Multi-Instance bodies, outside this family by owner direction; `PC-TIMER-05` re-enters Timer waits, which is batch 5's subscription mechanism; `PC-CF-05` re-enters Event-Based races, also batch 5; `PC-COMPENSATION-03` needs completed-work retention, batch 6; `PC-JOURNEY-01` is an integrated journey consuming closed rows. Each row keeps its other clauses open.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Table 7.2.** A Sequence Flow connected to an upstream object forms a loop, distinct from Standard Loop and Multi-Instance characteristics.
- **Clauses 10.6.2 and 13.4.2, Table 13.2.** Exclusive choice routes each arriving token to the first true or the default flow; the merge passes each arriving token through.
- **Clause 13.3.4.** An embedded Sub-Process is instantiated when a token arrives and completes when no token remains inside and no contained Activity is active, so every traversal of the loop creates a new instance.
- **Clause 10.4.1.** Data declared in a Sub-Process lives exactly as long as its instance; a new instance starts without the previous instance's data.
- **Clause 10.3.6.** Each activation of a Call Activity transfers control to the called Process; the Call Activity is BPMN 1.2's *Reusable* Sub-Process, which is why `PC-CF-06`'s "reusable scopes" takes Calls as well as embedded Sub-Processes.

CIB Seven `2.2.0` at the pinned revision (`5a45b47`, [SOURCES](../SOURCES.md#cib-seven)) realizes exactly this; paths are relative to `engine/src/main/java/org/cibseven/bpm/engine/impl/`:

- **Fresh scope.** A Sub-Process is a scope (`bpmn/parser/BpmnParse.java:3887`). Every entry, a loop-back included, creates a new child execution (`pvm/runtime/operation/PvmAtomicOperationCreateScope.java:39`) with an id from the monotonic `DbIdGenerator` (`db/DbIdGenerator.java:39-45`) and a new activity instance id (`persistence/entity/ExecutionEntity.java:880-896`). End destroys and removes that execution (`pvm/runtime/operation/PvmAtomicOperationTransitionDestroyScope.java:58-74`), so no id is reused. A non-Multi-Instance Call is a scope too and starts a new sub-process instance per activation (`bpmn/behavior/CallActivityBehavior.java:62`).
- **Fresh locals, outputs per end.** `camunda:inputOutput` inputs run at every activity-instance start, evaluated in the parent scope (`pvm/runtime/PvmExecutionImpl.java:250-261`, `core/variable/mapping/InputParameter.java:43-52`); outputs run inside every `destroy` (`persistence/entity/ExecutionEntity.java:523`), after which `removeVariablesLocalInternal` clears the locals (`:554`). Process variables written through `setVariable` persist across iterations (`core/variable/scope/AbstractVariableScope.java:327-346`). Call `camunda:in` reads at every activation (`bpmn/behavior/CallableElementActivityBehavior.java:114-130`) and `camunda:out` writes at every callee end (`pvm/runtime/operation/PvmAtomicOperationProcessEnd.java:50-61`).
- **Stale task.** Completion deletes the `TaskEntity` (`persistence/entity/TaskEntity.java:327-349`); completing the deleted id fails with "Cannot find task" (`cmd/CompleteTaskCmd.java:64-66`).
- **No loop guard.** None was found; atomic operations drain an unbounded queue (`interceptor/CommandInvocationContext.java:126-129`).
- **Tests.** Engine tests loop only over plain tasks (`ExclusiveGatewayTest.java:280`, `FullHistoryTest.java:922`); a cycle detection over the 2,438 BPMN resources of the checkout (2026-11-02) found no embedded Sub-Process or Call on a cycle except the `invoice.v2.bpmn` example. Re-entry depth is therefore source-established, not test-established; the calibration probe below supplies the execution evidence.
- **Multi-Instance.** A non-Multi-Instance Sub-Process never reaches `MultiInstanceActivityBehavior` (`bpmn/parser/BpmnParse.java:1378`, `:3892`), so re-entry needs no Multi-Instance mechanism.

**Expression boundary.** CIB's re-entry behavior needs no expression. CIB's only data-driven loop exit is a JUEL or script condition (`bpmn/parser/BpmnParse.java:4399-4422`); its expression-free exits are Event-Based Gateways, boundary Events and external-task Errors, all later families. The project's models exit through the approved [Simple Boolean v1 language](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md), as the cycle and mixed-task profiles do, so the held `PC-DATA-07` lane is not needed. The calibration probe gives CIB a JUEL rendition of each root condition (`stringEquals(n,"v")` becomes `${n == "v"}`) under the existing [`CIB-CFG-0005`](../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0005--pinned-read-only-juel-condition-environment) configuration, which the [`CIB-AGR-0006`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0006--divergent-exclusive-gateway-first-true-and-default-routing) calibration already uses; it compares re-entry, frames and identities only, never condition truth. JUEL fails on an absent name where Simple Boolean v1 returns false, so every name a Choice reads is written before the first Choice on every path of a probe model.

Classification: normative agreement for fresh instance and lifetime, and the existing extensions [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes) and [`CIB-EXT-0021`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0021--call-variable-mappings-by-name-across-the-instance-boundary) for name-based inputs and outputs, whose boundaries grow from "activated once" to "each activation" once the probe agrees. No new relationship ID is needed.

## Required, optional and excluded scope

Required: every model the nested scope-data profile admits today, unchanged, plus root bodies that are graphs rather than one path. A root graph has one None Start, one None End and any finite set of User Tasks, mapped Service Tasks, ordinary embedded Sub-Processes, mapped Call Activities, divergent Exclusive Gateways (Choices) and converging Exclusive Gateways (Merges). Tasks, Sub-Processes and Calls have arity `1 -> 1`. A Choice has one incoming flow, exactly two Simple Boolean v1 conditional flows in XML declaration order and one conditionless referenced default, the existing non-mixed Choice arity. A Merge has two or more incoming flows and one outgoing flow. Sub-Process bodies and the called Process keep exactly the account they have today, including depth, declaration, Call-position and Call-count bounds. `Definitions.expressionLanguage` must name the Simple Boolean v1 URI exactly when a conditional flow exists.

Optional: acyclic root graphs with Choices and Merges, several back-edges, a Sub-Process or Call reached on several paths, and immediate exit.

Excluded: a Choice with one or more than two conditional flows, because the Program-level `choose` arity lives in the closed-world `ProgramStructuralValidation` and admitting it there would rebuild that hub's fixtures for a shape the two-condition Choice already expresses; Exclusive Gateways inside a Sub-Process body or the called Process, because Simple Boolean v1 reads Process bindings only while CIB resolves names through the scope chain; a model that both forks and chooses; a cycle whose only resumption point lies in the called Process (the [admission](#admission) cut treats a Call as automatic); Multi-Instance, Standard Loop, Event-Based and Inclusive Gateways, events, interruption, Errors, Compensation; expressions beyond Simple Boolean v1 and exact `${name}`; and any new public observation field. These bound admission only; the representation admits each later without reinterpreting accepted models.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [pre-baseline profile rule](../../contracts/README.md). Its value domain, Start, completion-patch (`NSD-TASK-01`) and effect contracts are unchanged. A root User Task outside every declaring frame still admits only the empty patch, so the data a Choice reads reaches the Process through a Sub-Process output, a Service output or a Call output. Simple Boolean v1 evaluates over the Process bindings; a structured value is present, not null, and never equal to a String literal, which the existing evaluators already implement.

Observation adds nothing. Each re-entry is visible through the existing occurrence identities: User Task occurrences and effect keys carry their activation ordinals, and the scope occurrence stays runtime-only as the [embedded completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#runtime-state-identity-and-ownership) requires.

## Representation and runtime ownership

No IL, checked-graph, runtime-state, stimulus or observation field is added, and no transition family. Choices and Merges lower to the existing `choose` and `mergeExclusive` operations, Sub-Processes and Calls to their existing declared entry, completion, invocation and return. The existing counters `scopeActivations`, `callActivations`, `taskActivations` and `effectActivations` already issue the next ordinal per element. Under this profile, two serial mapped Calls of one called Process already issue called-root and called-task ordinal two, the precedent for `SRE-FRESH-01`; this family is the first to issue an ordinal above one for an embedded scope, a Call element or a caller-side task. A scope occurrence's frame is installed at its entry by `NSD-INIT-01` and retired at its completion by `NSD-RETIRE-01`; a called-root frame likewise by the Call mapping rules. A cycle keeps one control unit, so at most one occurrence of each definition is live at a time, which is the premise under which the [frame laws](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean) resolve uniquely.

Runtime-state validation needs no change: the TypeScript `nestedScopeFramesValid` checks each frame against its own live occurrence and never counts activations per definition, and Lean's runtime well-formedness has no profile-specific frame check.

## Admission

`SRE-ROUTE-01`: a Program or checked graph of the profile routes to the re-entry account exactly when its root body contains a Choice or a Merge and it splits no token; a Program that both splits and contains a root Choice or Merge is refused; every other Program keeps its current serial or concurrent route unchanged.

`SRE-ADMIT-01`: the re-entry account admits exactly the required and optional scope above, analysing the root graph independently at the checked and Program levels, and each Sub-Process body, Call position and called Process with the existing serial analysis. Exact lowering equality between the two analyses is an additional bridge, not either analysis.

`SRE-CYCLE-01`: the profile's graph policy becomes the existing mixed-task resumption-bounded policy arm, whose cut removes the continuations of User Tasks and Service Tasks, and every directed cycle must cross a cut. The two analysis levels see a Sub-Process differently, so the cut is stated for each:

- **Program level.** The order graph threads through every Sub-Process body, so an `awaitUserTask` or `awaitEffect` inside a body cuts a cycle through that Sub-Process. A Call contributes its existing invocation-to-return summary edge, which is never cut.
- **Checked level.** Checked validation runs per definition scope, so in the root graph an embedded Sub-Process vertex counts as a cut exactly when its body, transitively through nested Sub-Processes, contains a User or Service Task. Every body is one serial path, so this is the same criterion as the Program level's threading. A Call vertex never counts as a cut.

The checked rule lives in the body of the `mixedTaskResumptionBounded` arm of `checkedGraphPolicyValid` and in the TypeScript checked graph policy selection; the one-scope mixed-task profiles have no Sub-Process vertex, so the change is behavior-neutral for them. Every Program admitted today is acyclic and stays admitted. Switching the whole profile's policy removes the generic acyclicity backstop from its serial and concurrent routes too; a cyclic Program without a root Choice or Merge is then refused by the serial walk's duplicate-visit check and by the concurrent restrictions, which refuse every `MergeExclusive`, and a witness locks that.

`SRE-AVAILABLE-01` generalizes `NSD-AVAILABLE-01` with the barrier rule of `MTCF-DATA-01`. Each Sub-Process, Call and Service vertex of the root graph carries the names its existing serial analysis requires from outside it and the Process names it definitely writes. A name required by a vertex still reachable from Start after removing the outgoing edges of every vertex that definitely writes it is a required Start binding. A write reached only through a back-edge never satisfies a first entry, and a Choice's reads require nothing, because Simple Boolean v1 is total on absence. For a Program with a Call, the existing rule that every Start binding is required or optional (`CMCALL-START-01`) keeps holding, with the optional set over the graph by the same barrier rule: a Call input source or output target that lands at the Process is optional when some path from Start reaches the Call without first passing a vertex that definitely writes the name.

`SRE-BURST-01`: the re-entry account computes the longest automatic step sequence and refuses a Program whose sequence from Start or from any resumption target exceeds `semanticProcessClosureLimit`. The burst graph is the cut graph plus, for each call site, the continuation from the called None End through the paired return; resumption targets include every continuation inside a called Process, and an invocation counts its called root's first arming as the stop. Every operation the scheduler fires counts one, scope entry and completion included, and arming a wait counts one and stops. The count must equal the scheduler's actual closure on the witnesses, so an off-by-one in the analysis fails a witness rather than surfacing as a runtime rollback; the concurrent account's per-call-site `maximumBurst` is the precedent.

The existing serial account has no burst rule. Derived statically by the cold proposal review and not yet executed: a serial model `Start -> SP1{SP2{SP3{T}}} -> SPb{SPc{T2}} -> End` passes the depth-three admission, and completing `T` needs nine internal steps against the limit of eight, so the completion would roll back on every attempt. This family leaves the serial account unchanged; the finding is recorded with its deciding witness in the nested scope-data section of [`implementation-status-owner:ENGINE-DATA-FAMILY`](../ENGINE-DATA-FAMILY-IMPLEMENTATION-MAP.md), and the re-entry account does not inherit the gap because `SRE-BURST-01` refuses such Programs at admission.

## Capacity

A cyclic Program offers no single bounded journey, so the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts) gives routed re-entry Programs only the Program-level and reserved-result checks, as `CSSD-CAPACITY-01` does for concurrent ones. Committed state does not grow with iterations: frames retire, Process bindings are keyed by name and counters grow in digits only. A run that outgrows a hosted budget ends with the existing typed capacity failure, and the iteration count is bounded by the existing aggregate continuation and Run bounds, both disclosed in the profile README and About. The same treatment covers acyclic routed Programs, whose Choices would multiply the serial journey per branch; this is an accepted tradeoff, not a weakened gate, because no Program admitted today is routed here, and every Program that keeps its serial route keeps the full envelope.

## Stable rules

`SRE-ROUTE-01`, `SRE-ADMIT-01`, `SRE-CYCLE-01`, `SRE-AVAILABLE-01` and `SRE-BURST-01` are stated under [Admission](#admission).

`SRE-FRESH-01`: each traversal of a Sub-Process, Call, User Task or Service Task creates an occurrence whose ordinal is one greater than the previous occurrence of that element; no identity is reused.

`SRE-INIT-01`: a re-entered Sub-Process frame holds exactly its inputs evaluated against the entering parent chain at that entry (`NSD-INIT-01`); a re-entered called-root frame holds exactly the Call inputs read at that invocation. No local of an earlier occurrence is readable.

`SRE-RETAIN-01`: values an earlier iteration wrote to the Process stay until a later write replaces them; retiring a frame deletes no Process binding (`NSD-RETIRE-01`).

`SRE-STALE-01`: a User Task completion or effect result addressed to an earlier iteration's occurrence is rejected with state, frames, counters and observation unchanged.

`SRE-OUTPUT-01`: each completion writes its outputs once, from its own frame, by `NSD-OUTPUT-01`; each Call return writes its outputs once at its caller's owners.

## Newly reachable waits and resumption

The reachable wait sets are those the serial account already reaches: one User Task or one effect, owned by the root or by a chain of at most three Sub-Process occurrences or one called root. What is new is the ordinal above one in their owners and identities. The pipeline's continuation witness drives every committed running state through the Continue-As-New checkpoint, so each retained re-entered state is restored by the hosted validator; host admission keeps its serial path.

## Separating witnesses

Two retained whole models, each run as answer-free scenarios:

- **Claim assessment with rework.** *Assess claim*, a Sub-Process declaring `notes` from `${claimSummary}` and `decision` as null, holds the User Task *Inspect damage* and the mapped Service Task *Price repair*, and copies `decision` to the Process `assessment`. A root Choice routes `stringEquals(assessment,"rework")` back to a Merge before *Assess claim*, `stringEquals(assessment,"reject")` to the User Task *Notify claimant*, and the default to the User Task *Approve settlement*; a second Merge joins both before the End. Iteration 1 sets `notes` and requests rework; iteration 2 must read `notes` from `claimSummary` again, issue *Inspect damage* and *Price repair* with ordinal 2 and keep `assessment` from iteration 1 until it is overwritten. A completion of iteration 1's *Inspect damage* and a late result of its *Price repair* both reject unchanged. Further schedules exit at once by approval and by rejection.
- **Contract revision.** *Prepare draft*, a Sub-Process copying `contractText` into a local edited by *Edit draft*, outputs it back; the mapped Call *Legal review* passes it to a called Process whose User Task *Review clauses* returns `verdict` to the Process `legalVerdict`; a Choice routes `stringEquals(legalVerdict,"revise")` back to the Merge, `stringEquals(legalVerdict,"withdraw")` to *Close negotiation* and the default to *Sign contract*; a second Merge joins both before the End. Two invocations of *Legal review* get distinct called identities and fresh called-root frames, and iteration 1's *Review clauses* rejects after iteration 2 opened. A Start binding `legalVerdict` is admitted as optional; a Start binding of an unrelated name is rejected.

Refused models, each in the source lane and both target analyses:

- an internal-only cycle, whose User Task lies only on the exit path;
- a cycle whose only resumption point is *Review clauses* in the called Process;
- a cycle through a Sub-Process whose body holds no task, refused by the checked cut and by the Program cut;
- a cyclic Program without a root Choice or Merge, refused by the serial route;
- a Choice with one or with three conditional flows, and a Choice inside a Sub-Process body;
- a model that forks and chooses;
- two burst pairs, each an exact-limit model that is admitted and its one-step-longer variant that is refused at admission: one critical at a caller-side resumption, one critical at a resumption inside the called Process;
- a read whose only writer lies on the back-edge path, which stays a required Start binding, and the same model with a writer before the Merge, which does not.

Mutations, each changing the deciding mechanism: completion that does not retire the frame, so iteration 2 reads iteration 1's `notes`; occurrence identity by element only, so the stale completion settles iteration 2; a cut on the Choice instead of a wait; a checked cut that ignores Sub-Process bodies; a monotone written-name set that counts a back-edge write; a burst count that omits scope completion; a burst graph that omits the called-return continuation; re-entry that clears the Process values the scope's outputs wrote.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `SRE-ROUTE-01` | Both models route to the re-entry account; every retained profile model keeps its route; fork-and-choose refuses | Lean preservation law, conformance module, core, source | Route on Merge alone, so a Choice-only model takes the serial walk |
| `SRE-ADMIT-01` | Both models admitted; one- and three-condition Choices, Choice in a body refused | Source, conformance module, core | Accept any Choice arity |
| `SRE-CYCLE-01` | Both models admitted; internal-only cycle, called-only resumption, task-free body cycle and cyclic serial Program refused | Source, conformance module, core | Cut on the Choice; checked cut ignoring bodies |
| `SRE-AVAILABLE-01` | Back-edge-only writer requires a Start binding, earlier writer does not; `legalVerdict` optional, unrelated name rejected | Source, conformance module, core, pipeline | Monotone written-name set |
| `SRE-BURST-01` | Two exact-limit and one-over pairs, caller-side and called-side | Conformance module, core, pipeline against the scheduler's closure | Omit scope completion; omit the called-return continuation |
| `SRE-FRESH-01` | Ordinal 2 for *Inspect damage*, *Price repair*, *Assess claim*, *Legal review* and *Review clauses* | Pipeline across Lean, core and Temporal; CIB probe ids | Identity by element only |
| `SRE-INIT-01` | Iteration 2 `notes` equals `claimSummary`; fresh called-root frame | Lean frame laws, pipeline, CIB probe locals | Completion that keeps the frame |
| `SRE-RETAIN-01` | `assessment` and `legalVerdict` survive into iteration 2 | Pipeline, CIB probe Process variables | Re-entry that clears the Process values the scope's outputs wrote |
| `SRE-STALE-01` | Iteration-1 completion and late effect result reject unchanged | Pipeline across Lean, core and Temporal; CIB stale task id | Identity by element only |
| `SRE-OUTPUT-01` | Each iteration's outputs written once at its end | Lean frame laws, pipeline, CIB probe | Completion that keeps the frame |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. The quantified laws it relies on already hold for every Program of the profile and every frame population, and do not assume a single activation: frame installation reads the parent chain ([`initializeFrame?_reads_parent_chain`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean)), completion retires exactly the completing frame ([`completeScopeState?_retires_frame`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean)), resolution picks the nearest frame ([`resolveOwner?_frame_nearest`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean)), and a saturation-certified acyclic cut graph has no directed cycle ([`acyclicClosed_excludes_directedCycle`](../../BpmnSemantics/SemanticProcess/GraphReachabilityLaws.lean)). The family's own propositions are finite analyses whose risk is a coding slip: routing, admission, Start names and the burst count are checked by an executable conformance module over both models and every refused model, run natively rather than kernel-decided; agreement with the core and Temporal is checked by the pipeline. One preservation law is proved because it is definitional: a Program without a root Choice or Merge routes exactly as before.

Selection by risk ([owner direction of 2026-10-14](../PROJECT-DESIGN.md#lean-assurance-lane)): this is breadth over the proved cycle and frame mechanisms, not a concurrency, cancellation, Compensation or Multi-Instance family. Not proved, and recorded as such: that every actual closure of an admitted re-entry Program stays within the computed burst, which the mixed-task account proves for its own graphs; the runtime closure bound rolls back an over-limit closure atomically, so the gap can stall a run but never expose partial commitment. Also not proved: freshness of every issued ordinal at an arbitrary reachable state, a reachable-state predicate whose status [`implementation-status-owner:ENGINE-SEMANTIC-INVARIANT`](../ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md) owns; `SRE-FRESH-01` is checked on the retained schedules and by the identity mutation.

Assurance findings: `AA-13` adds no reader work, because no wire shape changes; `AA-15`'s value-domain lane is the matrix row of each retained model.

## Temporal hosting and refinement preflight

The family adds no hosting mechanism. Ingress stays Start, content- and occurrence-bound User Task completion Updates and effect Activity results; effects re-armed in a re-entered scope get the next effect ordinal, as the mixed-task witness established for root Service Tasks; frames are committed state carried through Continue-As-New; there are no timers, Messages, cancellation or interruption. The preserved relation is equality of hosted committed state and core state, now with ordinals above one. Risks and deciders: ordering is command order; deduplication keys carry the occurrence, so a late iteration-1 Update or result is a different occurrence and is refused; replay re-derives frames from committed state; restoration of re-entered frames is decided by the continuation witness the pipeline runs on every committed running state. No dedicated hosted witness is required under the once-per-mechanism rule.

## Evidence and acceptance

Both models run as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, corpus rows and the About disclosure. The CIB lane is a calibration probe beside the [Call variable mapping probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCallVariableMappingProbeTest.java), driving both models with JUEL condition renditions and asserting at each wait the caller's Process variables, the scope's local variables, distinct activity-instance and task ids per iteration, and failure of the stale task id.

Acceptance: Lean, core and pipeline agree on every scenario of the profile; the preservation law holds; the probe agrees; the hosted pipeline passes once at family closure. Then the clauses of `PC-CF-06`, `PC-DATA-04`, `PC-SCOPE-02` and `PC-HUM-01` named above are evidenced, and each row's other clauses stay open.

Nearest unsupported claims: re-entry of Multi-Instance bodies, cycles through Event-Based or Inclusive Gateways or Timer waits, cycles cut only inside a called Process, conditions inside scopes, and quantified bounded closure for this account. Common-mode risk: Lean and the core transcribe one reading of the CIB extraction; only the probe checks it independently, and only on the retained models.

Closure gates, 2026-11-02:

- **Green at `deeced6c`:** the complete `verify.sh`: the full Lean library and the `BpmnConformance` root with the [conformance module](../../BpmnSemantics/ScopeReentryConformance.lean); the runtime stage with the CIB oracle and the [calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java); the complete Temporal gate; the pipeline with all 151 registered cases agreeing across Lean, the core and Temporal and each family mutation detected, warm in 115.7 seconds within the 196.3-second budget and over the 75.5-second soft feedback target, at a load of 0.40 to 0.47 per core; the value-domain matrix; and composition parity.

As implemented, where the account above left a choice or a witness changed:

- **Lean owners.** Beyond the four planned body edits, [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) took an interface edit: it exports `structureAdmitted`, `checkedEnvelope?`, `programEnvelope?` and `startBindingsAdmittedBy` so the re-entry leaf reuses the serial analysis per Sub-Process body instead of copying it, and its envelope now also accepts `choose` and `mergeExclusive` operations. Keeping the analysis inside that module instead changed its public `.olean` through private structures and recursive definitions. The `mixedTaskResumptionBounded` body edit of `checkedGraphPolicyValid` also changed `CheckedGraphValidation`'s public `.olean`. The [modularity specification](../LEAN-BUILD-MODULARITY-SPEC.md#current-boundary) records both under body edits that still change the public interface. The leaf proves its one-scope law with `delta` rather than equation lemmas, so it needs no `meta import` of `PrivateEquationLemmas`, which the fan-out guard bounds.
- **Single End.** The core refuses a root body with a second None End, as Lean's single-End rule does; the TypeScript account had admitted it (`e907a9b7`).
- **Stale effect result.** The late effect result of `SRE-STALE-01` is checked only in the core [runtime test](../../packages/bpmn-source/test/scope-reentry-runtime.test.ts). Ordered Activity execution delivers each effect result exactly once, so a pipeline schedule cannot carry a stale one; the stale User Task completion runs in the pipeline across all three targets.
- **CIB conditions.** The probe deploys each model with its two `stringEquals(n,"v")` conditions rendered as `${n == "v"}` and the Simple Boolean v1 `expressionLanguage` removed, and asserts the rendition replaced exactly two conditions.
- **Pipeline budget.** The four cases raised the warm pipeline budget from 191,100 to 196,300 ms and the hosted budget from 286,650 to 294,450 ms, at the unchanged 1,300 ms per-case rate. A fresh direction review and a Rule 2 bound review approved it and a fresh post-check matched the diff; the reviews ran after the commit `e4e6a061` but before any lane built on it. The direction review found per-case warm cost rising, from about 515 ms when the rate was calibrated to 766 ms here; a quiet-host or hosted run above about 85% of its ceiling would make per-case cost reduction a blocker before further cases are added.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): the profile identity, Program and checked shapes, schemas and value arms stay unchanged; admission accepts root graphs under the profile; the profile artifact grows in place; no legacy reader or migration is added.

### Owners this implementation grows

Derived with `node scripts/what-binds.ts` on 2026-11-02; `what-binds` owns every headroom figure.

Build cost is a constraint. Four Lean closed-world or hub owners are touched, each by a body edit only, landed in one commit so the closed-world fixtures rebuild once and priced with the fan-out model before the first compile:

- [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean), `profileGraphPolicy?`: the profile moves from `acyclic` to the existing `mixedTaskResumptionBounded` arm. Generic structural validation refuses every cycle under `acyclic` before any profile analysis runs, and this function alone selects the policy. A new policy arm cutting resumption-bearing Call summary edges would be an interface edit of this hub, which is why cycles cut only inside a called Process stay excluded.
- [`CheckedGraphValidation`](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean), the `mixedTaskResumptionBounded` arm of `checkedGraphPolicyValid`: the checked cut of `SRE-CYCLE-01`, counting a task-bearing Sub-Process vertex as a cut. A new arm instead would again change `ProfileShapeCatalog`'s interface.
- [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), the variable-merge flag passed to `checkedNodeArityValid`: one more profile disjunct, so a Merge may have two or more inputs. A Merge with exactly three inputs, the alternative that needs no edit, would refuse the ordinary two-input rework loop.
- [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), the `StructuredScopeData` routing bodies: a third route to the new account. The file is near its review target; moving the routing namespace to its own module would change `ProfileShapeCatalog`'s imports, so the route stays a body edit plus one private import, and the namespace moves out only when growth would exceed the review target.

`ProgramStructuralValidation` is not touched, because the Choice keeps the existing two-condition arity; neither is any `ValueDomain`, `CommandAdmission`, `CommandStartBindings`, `ScenarioAdmission`, `RuntimeState` or `RuntimeStateWellFormed` declaration: Start bindings already dispatch through `startBindingsRouted`, the profile's value domain is unchanged, and frame validation needs no change. The new analysis and its conformance module are family-owned leaves, private by default.

- Lean: the four owners above, a new re-entry admission leaf and a new executable conformance module.
- TypeScript core: [structured scope-data routing](../../packages/semantic-core/src/structured-scope-data-routing.ts), [graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts), [Start admission](../../packages/semantic-core/src/scope-data-stimulus-admission.ts), and a new re-entry admission module.
- Source: [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts), which accepts root Exclusive Gateways; [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), for the variable Merge arity and the checked cut; and [checked process admission](../../packages/bpmn-source/src/checked-process-admission.ts), whose expression-language rule for this profile becomes model-dependent, Simple Boolean v1 exactly when a conditional flow exists, and whose `hasSelectedConditions` gains an arm admitting this profile's root Choice conditions, which it refuses by default today.
- Temporal: the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts), selecting by the routing predicate.
- Registration: [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes) and [`CIB-EXT-0021`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0021--call-variable-mappings-by-name-across-the-instance-boundary) boundaries, the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) and README, the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts): serial Programs keep every envelope result, re-entry Programs get only the Program-level checks;
- [`host-admission`](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), which must stay unchanged: re-entry Programs are serial;
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts) and [`runtime-state-non-reissue-claims`](../../scripts/runtime-state-non-reissue-claims.test.ts), which must stay unchanged in content;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`contract-artifact-projections`](../../scripts/contract-artifact-projections.test.ts) and [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) for the grown artifact;
- [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts), which binds `CheckedGraphValidation`;
- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and new module;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `c4d87c3c` | `fork-turns-none` | `approve-with-required-edits` | `6da46da8` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
