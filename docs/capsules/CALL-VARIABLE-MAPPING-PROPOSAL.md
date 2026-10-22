# Call variable mapping proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can a business process hand named values to a reusable called Process through CIB Seven's `camunda:in` and `camunda:out` mappings, keep the caller's and callee's data isolated while the call is live, and receive the declared outputs exactly at normal return, with an absent source and a present null kept apart where CIB keeps them apart?

This proposal opens `PC-SCOPE-04` from the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#embedded-sub-processes-and-calls), the next action in [PLAN](../PLAN.md#exact-resume-point). It serves the normal-return clause of that row and the called-owner clauses of `PC-DATA-04` to `PC-DATA-06`, restricted to one serial call. Exceptional return and propagated output stay with `PC-SCOPE-06`, `PC-ERROR-03` and `PC-ESCALATION-03`; repeated, nested and concurrent calls with `PC-SCOPE-05`; the general called-definition resolution and version policy with `PC-SCOPE-03`; expression mappings with `PC-DATA-05` and `PC-DATA-07`.

The existing [Call data account](CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md) is the vendor-neutral BPMN account of scalar Call ports and selects no CIB data relationship. This proposal neither changes nor supersedes it: the two accounts answer different questions, for different profiles, and share only the Call control mechanism of the [Call specification](CALL-ACTIVITY-SPEC.md).

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.6 transfers data into and out of a called Process only through matching Call Activity and CallableElement inputs and outputs, and Clause 13.3.4 gives the called Process its own instance, so BPMN has no name-based transfer and no inheritance of caller data. Name-based mapping is therefore a CIB extension layered on the BPMN Call lifecycle, not a reinterpretation of it.

CIB Seven `2.2.0` (tag `v2.2.0`, commit `834a987`; every file cited here is unchanged at the pinned `5a45b47`) implements the extension as follows. Paths abbreviate `engine/src/main/java/org/cibseven/bpm/engine/impl` as `E`.

- Parsing: `E/bpmn/parser/BpmnParse.java:4071-4182` reads `camunda:in` and `camunda:out`; `source` wins silently over `sourceExpression`, and under the default strict validation a missing or empty `source`/`sourceExpression` or `target` is a parse error (`BpmnParse.java:4143-4176`).
- Input: `E/bpmn/behavior/CallableElementActivityBehavior.java:115-130` evaluates every input in document order against the Call Activity's execution before the called instance starts, and `CallActivityBehavior.java:55-64` starts it with exactly that variable map. `E/core/model/CallableElementParameter.java:42-66` reads a constant `source` with `getVariableTyped`, which returns null for a missing name, so the target is created with a present null (`CallActivityTest.java:521-559`).
- Isolation: the called instance's parent variable scope is null (`E/pvm/runtime/PvmExecutionImpl.java:1697-1699`), so nothing outside the mapped variables is visible to it, and a change to a called variable leaves the caller's namesake unchanged until return (`CallActivityTest.java:313-337`).
- Output: `CallableElementActivityBehavior.java:133-150` reads every output from the called process-instance scope at normal end (`E/pvm/runtime/operation/PvmAtomicOperationProcessEnd.java:57-62`) and writes them with `setVariables` on the Call Activity's execution, which updates the nearest existing binding in the caller hierarchy and otherwise creates it at the caller Process (`E/core/variable/scope/AbstractVariableScope.java:327-346`). A source the callee never set therefore overwrites the caller target with a present null (`CallActivityTest.java:642-663`).
- Typed values and transient flags survive both directions; a typed null keeps its type (`CallActivityTest.java:376-451`, `1840-1897`).

Candidate `CIB-EXT-0021` records this account, registered with the profile metadata and its verifier coverage in the implementation change. It composes with the nearest-owner write of `CIB-EXT-0020` in the [relation register](../CIB-BPMN-RELATION-REGISTER.md) without changing that entry. CIB also runs outputs when an Error or Escalation leaves the called instance (`E/tree/OutputVariablesPropagator.java:36-43`, `CallActivityTest.java:1315-1425`); this profile admits no exceptional exit, so outputs at normal return are an admission restriction and `PC-SCOPE-06` decides the exceptional output policy.

## Required, optional and excluded scope

Required: one `Definitions` document with exactly two private executable Processes, a caller and a called Process. The caller is any model the nested scope-data profile admits today, extended by exactly one Call Activity placed on the serial path of the root or of one embedded Sub-Process. The called Process is one serial path from a None Start through one to three User Tasks to a None End. The Call Activity carries `calledElement` equal to the called Process's `id`, at least one `camunda:in` and at most eight, and at most eight `camunda:out`, each with exactly a nonempty `source` and a nonempty `target`.

Optional: a caller Process binding or frame local with the same name as a called variable; one source mapped to several targets; Call input targets that the called Process never reads.

Excluded: `sourceExpression`, `variables="all"`, `local="true"`, `businessKey`, `camunda:inputOutput` on the Call Activity, `camunda:variableMappingClass` and `camunda:variableMappingDelegateExpression`, the `calledElementBinding`, `calledElementVersion`, `calledElementVersionTag` and `calledElementTenantId` attributes, a prefixed or foreign `calledElement`, duplicate input targets or duplicate output targets on one Call, any data, boundary Event, loop or Multi-Instance on the Call Activity, called Processes with Sub-Processes, Service Tasks, Gateways or a second Call, more than one Call per caller, exceptional return, cancellation and the non-strict CIB validation configuration. These bound admission only; the representation below admits repeated, nested and concurrent calls later without reinterpreting accepted models.

## Profile and value domain

Profile family: the mapping is data flow across a scope boundary, and the nested scope-data profile already owns the CIB name-resolution account, the value domain and the Start and completion-patch policies it needs, while the embedded completion profile carries no data. The `DATA` family's cumulative profile `cibseven-2.2.0-nested-embedded-scope-data-draft` therefore grows in place under the [cumulative profile rule](../../contracts/README.md): every model it admits today keeps its exact admission, commands and observations, and only models with one Call become additionally admissible. The `SCOPE` family's embedded completion profile is unchanged.

Values stay `SingletonBusinessItem` from the [portable values capsule](PORTABLE-BUSINESS-VALUES-PROPOSAL.md#public-value-contract) with the 1,024-byte root-String bound, at every surface the [nested scope-data profile](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#profile-and-value-domain) defines and at both mapping directions. Every copy across the instance boundary is by value.

`CVM-START-01`: Start keeps the required bindings of `NSD-AVAILABLE-01` and additionally admits, optionally and at most once each, a binding for every Call input source that resolves to the Process binding, that is, one no enclosing frame of the Call declares and no earlier step definitely produces. Because an absent input source yields a present null by `CVM-IN-01`, no Call input makes a Start binding required. Any other name is `rejected`.

`CVM-RESOLVE-01`: admission binds `calledElement` to the other executable Process of the same document by exact identifier equality and records that binding in the Program's definition forest. CIB resolves the key to the latest deployed version, which is this co-deployed definition when both Processes are deployed together; recovery and every later command use the recorded binding and never resolve again. `PC-SCOPE-03` owns every other selector.

## Representation and runtime ownership

The checked Call node and the paired `invokeProcess` and `returnProcess` operations already carry the closed `data` variant introduced by the [Call data account](CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md#checked-representation-and-runtime-ownership), with arms `empty` and `scalar`. A third arm, `variableMappings`, carries `inputs: VariableMapping[]` and `outputs: VariableMapping[]`, each record `{ source, target }`, in document order, since CIB evaluates them in that order. Lowering copies both lists exactly; pairing compares the complete arm; the empty and scalar arms keep their meaning and every existing Program stays byte-identical.

The called Process instance's variables live in one frame of the existing occurrence-keyed `variables.scopes`, owned by the called root occurrence. That frame is the called instance's Process store and differs from an embedded frame in two respects. First, resolution from any called-owned occurrence ends at it: the called root is parentless and the [Call record](CALL-ACTIVITY-SPEC.md#runtime-only-call-record-and-semantic-identity), not a parent pointer, links it to the caller, so no read or write from inside the call reaches a caller frame or the caller's Process binding. Second, a write that no inner frame declares updates or creates its binding there, as CIB's `setVariable` does on a process instance. The caller's Process binding stays the hosting instance's store. The hidden Call record gains no data field.

Invocation evaluates every input against the Call's enclosing chain by `NSD-READ-01`, turns an absent source into a present null, and installs the called-root frame in the same transition that creates the Call record and called root. Return reads every output source from that frame, turning an absent source into a present null, writes the values by `NSD-WRITE-01` starting at the Call's enclosing occurrence, disposes the frame, the called root and the Call record, and emits the caller token atomically.

## Runtime-only and synthetic constructs

The called-root frame is runtime-only: created by invocation, owned by the called root, read and written only by called-owned work, never part of public observation except through called-task detail below, and removed exactly with its root by return or by the existing ownership-based removal. No other synthetic construct is added.

## Stable rules

`CVM-ADMIT-01`: admission accepts exactly the required and optional scope above, rejects every exclusion and every parser warning, and rejects a mapping with a missing or empty `source` or `target`.

`CVM-START-01` and `CVM-RESOLVE-01`: as stated under the profile above.

`CVM-IN-01`: invocation evaluates every input against the Call's enclosing chain before the called instance exists. A present value, including a present null, is copied; an absent source yields a present null target. The called-root frame holds exactly the input targets.

`CVM-ISOLATE-01`: while the call is live, every called-owned read and write resolves within the called instance and ends at its root frame, and no called-owned transition changes a caller frame or the caller's Process binding.

`CVM-TASK-01`: a called User Task completion patch may carry only names among the Call's input targets and output sources, each at most once and in the value domain, and writes them into the called-root frame. Caller User Tasks keep `NSD-TASK-01`. A wrong patch is `rejected`.

`CVM-OUT-01`: at normal return, every output reads its source from the called-root frame, with an absent source yielding a present null, and writes its target by `NSD-WRITE-01` from the Call's enclosing occurrence. Reading all sources precedes every write, and validation, writes, disposal and the caller token commit atomically. No output reaches the caller before return.

`CVM-RETIRE-01`: return disposes exactly the called-root frame together with the called root and the Call record; no called variable remains readable.

`CVM-OBSERVE-01`: the detail of a called User Task resolves requested input names in the called-root frame only; the detail of a caller User Task is unchanged. A caller binding is never visible through a called task by name.

`CVM-REFUSE-01`: every refusal leaves the predecessor state unchanged. Start with an undeclared name, a wrong patch and a stale or caller-addressed called completion are `rejected`; no invocation or return step can fail after an accepted command, because absent sources become present nulls and every value is already in the domain.

## Separating witnesses

| Rule | Witness | Mutant it kills |
|---|---|---|
| `CVM-IN-01` | Start with `applicant` present, present null, and absent: the called task sees `customer` as the value, as null, and as null, and the called-root frame holds `customer` in all three. | Skip an absent source; share the caller binding instead of copying. |
| `CVM-ISOLATE-01` | The caller holds `amount`; the called Process has two serial tasks, and the first completion writes `amount` into the called frame. While the second task is live, the caller's `amount` is unchanged. | Write called patches through the caller hierarchy; apply outputs on each called step. |
| `CVM-OUT-01` | The caller holds `decision = "old"`; an output maps `verdict` to `decision`. When the callee sets `verdict`, `decision` takes it; when the callee never sets it, `decision` becomes null rather than staying `"old"`. A Call inside a Sub-Process that declares `decision` lands the write in that frame and leaves the Process binding untouched. | Skip missing outputs; write outputs to the Process instead of the nearest owner. |
| `CVM-OBSERVE-01` | The caller holds `secret`, which no input maps; a called-task detail request for `secret` returns nothing, and one for a mapped target returns its called value. | Resolve called-task detail through the caller's Process store. |
| `CVM-RETIRE-01` | After return, a caller task detail request for a called-only name returns nothing, and a stale completion of a called task is `rejected`. | Leave the called frame behind after return. |
| `CVM-ADMIT-01` | Each excluded attribute, a duplicate target, a prefixed `calledElement` and a called Process with a Service Task are refused; the retained models compile. | Accept `variables="all"` or `sourceExpression` with silent fallback. |

## Lean assurance lane

Lane shape: proved

Evidence: isolation is a property of every reachable state while a call is live, which no finite test covers, so the lane extends the frame laws in [NestedScopeDataLaws](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean), whose read law is [`resolveOwner?_frame_nearest`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#resolveOwner?_frame_nearest), and reuses the Call control evaluators of [CallDataTransfer](../../BpmnSemantics/SemanticProcess/CallDataTransfer.lean) as starting owners.

The planned laws are: input installation yields exactly the mapped snapshot with absent sources as present nulls (`CVM-IN-01`); resolution from a called-owned occurrence never selects a caller frame or the caller Process binding, and every called-owned transition preserves both (`CVM-ISOLATE-01`); return writes each output exactly at its nearest caller owner and disposes exactly the called frame, root and record (`CVM-OUT-01`, `CVM-RETIRE-01`). The nearest checked non-law is that resolving a called read through the caller hierarchy is not the isolated read when the caller holds a namesake. Admission and the remaining rules are checked by a conformance fixture. The declarative invocation and return arms take the evaluator result as premise, so their soundness bridge is a dispatcher check and the laws above carry the semantic evidence.

## Temporal hosting and refinement preflight

No new hosting mechanism is added. Durable ingress stays the existing Start and User Task completion Updates; called tasks are addressed by their called semantic instance identity as the [Call specification](CALL-ACTIVITY-SPEC.md#data-and-public-boundary-constraints) already requires, with the caller instance selecting the hosting Workflow. Waits are one User Task at a time; there are no timers, effects, Message waits or BPMN cancellation, and host termination fabricates no return or output. Invocation and return are internal closure steps inside the command that reaches them, so a mapping is evaluated exactly once, deterministically, from committed state, and replay re-derives it. The called-root frame is ordinary runtime state carried through Continue-As-New and restored by ownership; the continuation decoder must reject a frame without its called root, a called root without its frame and a frame owned by the caller.

The preserved relation is the existing one between hosted committed state and the semantic core's state; the profile only adds frames to it. The hosting risk is size: the profile's [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts) must count the called tasks among its journey steps and the called-root frame, bounded by sixteen names at the portable value bound, and keep refusing a Start whose journey exceeds a budget. [Called-task detail](../../packages/temporal-adapter/protocol/src/user-task-detail.ts) changes its source for called tasks only.

One unresolved hosted risk is inherited: the [Call data closure review](CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md#independent-cold-review-receipt) observed a public String journey whose publication read returned `unavailable` after a correct terminal receipt, without proven attribution. This profile's public journeys run the same Call hosting path; if that failure reproduces, it blocks this closure and is recorded, not worked around.

The smallest executable refinement witness is one live call with two called tasks, Worker replacement between them, Continue-As-New across the live call, completion, return with outputs into a caller frame, and every-Run replay.

## Evidence and acceptance

One retained whole model with a business purpose carries the witnesses: a loan application caller passes applicant data into a reusable identity-verification Process whose two tasks collect a document and record a verdict, and the caller's decision task reads the returned verdict inside a review Sub-Process that declares it. A second model holds the absent-source and never-set-output cases. Both run as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain rows, a corpus row and the About disclosure. The CIB lane is a calibration probe in the existing CIB runner covering the six witnesses above against `2.2.0`. Acceptance: Lean, core and pipeline agree on every scenario, the probe agrees with the retained observations at its declared fidelity, and the hosted pipeline passes once at family acceptance.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): the closed Call `data` variant gains one arm in the current checked and Program shapes, their schemas, codecs, lowering and pairing; no profile identity changes and no legacy reader or migration is added. Existing models of every profile stay byte-identical. Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards and owner headroom. The decisive ones are listed here.

- Schema and IL: [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and [internal commutation census](../../scripts/internal-commutation-census.test.ts).
- Call state: [Call state validation](../../packages/semantic-core/test/call-data-state-validation.test.ts) and the [Call continuation controls](../../packages/temporal-adapter/workflow/test/call-data-recovery.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) and the [nested scope-data capacity envelope](../../packages/temporal-adapter/protocol/test/nested-scope-data-capacity-envelope.test.ts).
- Values: [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts).
- Registration: [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) for `CIB-EXT-0021` and the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- Source: the `camunda:in`/`camunda:out` reader and profile admission in [`@bpmn-lean/bpmn-source`](../../packages/bpmn-source/README.md).
- Contracts: the Call data arm in the [IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), the [IL schema](../../contracts/schemas/semantic-process.schema.json) and both codecs.
- Semantic core and Lean: the called-root frame rule, invocation and return evaluators, and the nested scope-data resolution, write and Start rules.
- Hosting: [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), the Start capacity envelope, the continuation decoder and called-task detail.
- Evidence: the CIB runner probe, scenarios, pipeline cases, model corpus, profile README and `CIB-EXT-0021`.

## Open question

The profile lane: this proposal grows the `DATA` family's cumulative profile because the mapping reuses its data account, while the checklist files `PC-SCOPE-04` under `SCOPE`. The review should confirm that choice or require the alternative, a Call-data arm added to the `SCOPE` family's embedded completion profile, which would first have to import the whole data account.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
