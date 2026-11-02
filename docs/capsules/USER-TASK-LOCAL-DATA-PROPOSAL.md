# User Task local data proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit CIB `camunda:inputOutput` on User Tasks, so that a mapped User Task owns its declared locals from entry to completion, a completion may write them, its outputs publish once at completion and the locals retire with the task, while every other scope account, observation and identity stays unchanged?

This is the next family of batch 3 in [PLAN](../PLAN.md#scheduled-delivery-batches). An inventory of the open batch-3 rows on 2026-11-02 left this as the only mechanism that needs neither the held expression lane (`PC-DATA-07`, `PC-DATA-08`, `camunda:in sourceExpression`, literal Call inputs) nor Multi-Instance owners. It shares the frame mechanism of the [nested scope-data specification](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md) and takes every open row that shares it:

- `PC-DATA-04`, its Activity-owner clause for User Tasks: a task-local present null hides an enclosing namesake, a write lands at the nearest declaring owner, and the retired locals disappear without deleting enclosing values;
- `PC-DATA-05`, its Task-entry clause for User Tasks: all inputs read one pre-entry context, reordered declarations agree, and no input reads a sibling input;
- `PC-DATA-06`, its Activity-output clause for User Tasks: outputs to local and enclosing targets, written once, atomically with the completion;
- `PC-HUM-01`, its mapped-result clause: a differently named mapped output updates the intended target, in serial, branch, rework and scoped compositions.

Each row keeps its expression, Multi-Instance and called-Process clauses open. Reach is low and recorded as such: 3 of the 1,545 User Tasks in the pinned CIB resources carry `inputOutput`, all of them engine tests. The rows are on the approved checklist, so low reach lowers this family's cost ceiling rather than removing it.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 10.4.1.** An Activity may own data whose lifetime is the Activity instance's; a new instance starts without the data of the previous one.
- **Clause 13.3.2.** An Activity's inputs are available when the instance starts and its outputs are produced when it completes.

CIB Seven `2.2.0` at the pinned checkout `5a45b47ea2`, whose cited files are unchanged from `v2.2.0`:

- `BpmnParse.checkActivityInputOutputSupported` (`bpmn/parser/BpmnParse.java:4825-4858`) admits `camunda:inputOutput` on every `*task` and refuses output parameters under Multi-Instance; a mapped activity becomes a scope (`:4814`).
- Inputs run at activity-instance entry, in document order, each read from the parent variable scope and written with `setVariableLocal` (`core/variable/mapping/IoParameter.java:50-52`, `InputParameter.java:43-52`, `IoMapping.java:37-41`), so no input reads a sibling.
- Task completion writes its variables with `setVariables` on the task's execution (`persistence/entity/TaskEntity.java:869-874`) before `complete()` runs (`cmd/CompleteTaskCmd.java:71,100`), so a write lands at the nearest holder, the task's own locals first, and the outputs see it.
- Outputs run in document order when the scope is destroyed, each read from the inner scope and written with `setVariable` from the parent (`OutputParameter.java:44-53`, `persistence/entity/ExecutionEntity.java:518-525`); the locals are deleted afterwards (`:554,564-572`).
- An output source absent from the whole chain fails the completion with `ProcessEngineException` (`el/JuelExpression.java:62-63`); an output source that is not a local falls through to the parent chain (`el/VariableScopeElResolver.java:83-86`).

Classification: normative agreement for the lifetime and timing of Clause 10.4.1 and 13.3.2, and the existing extension [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes) for name-based declaration, nearest-owner writes and output publication, whose boundary grows from embedded Sub-Process owners to mapped User Task owners once the probe agrees. No new relationship ID is needed. The profile admits only outputs sourced from a declared local of the same task, as it does for Sub-Processes, so neither the fall-through read nor the missing-source failure is reachable.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, plus a User Task carrying `camunda:inputOutput` with one to eight input parameters, each a String literal of at most 1,024 UTF-8 bytes or an exact `${name}` reference, and zero to eight output parameters, each `${local}` naming an input of the same task, with distinct nonempty names. A mapped User Task may stand wherever a User Task stands today on the root path, on a root Choice branch or cycle of the [scope re-entry](SCOPE-REENTRY-SPEC.md) account, and on the serial path of a Sub-Process body. Its definition scope counts toward the profile's definition-depth bound of three.

Optional: output parameters, several mapped User Tasks in one model, and a mapped User Task re-entered by a cycle.

Excluded: a mapped User Task in a Program that forks, because the concurrent account admits Sub-Process shapes per branch and widening it is a separate step; in a called Process; under Multi-Instance; together with assignment or form metadata; on any other Task type, where the profile's Service Task mapping stays as it is; input lists, maps or scripts; expressions beyond exact `${name}`; and any new observation field. These bound admission only; the representation admits each later without reinterpreting accepted models.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [pre-baseline profile rule](../../contracts/README.md). Its value domain and Start and effect contracts are unchanged. The User Task completion patch of `NSD-TASK-01` keeps its 16,384-byte bound; the names it may carry now include the task's own declared locals.

Observation adds nothing. A mapped User Task keeps its occurrence identity `(processInstanceId, elementId, activation)`; its locals are runtime-only, like every frame. Hosted User Task detail, a Temporal query rather than a semantic observation, changes: it resolves each name through the task's frame chain, the task's own frame first, as CIB's task variable read does through `TaskEntity.getParentVariableScope`. This also repairs the recorded defect of [`implementation-status-owner:ENGINE-DATA-FAMILY`](../ENGINE-DATA-FAMILY-IMPLEMENTATION-MAP.md#nested-embedded-scope-data), where detail read Process bindings only.

## Representation and runtime ownership

No checked, IL, runtime-state, stimulus or observation type changes, so the family needs no kernel type change under [contract item 4](../LEAN-BUILD-MODULARITY-SPEC.md#contract).

- **Checked graph.** A mapped User Task gets a definition scope `scope:<TaskId>` whose `originElementId` is the task and whose parent is the task's scope, and a `scopeLocalData` entry for it. The task node stays in its parent scope, and no node is placed in the task's scope. The checked ownership rule, which today requires every child scope to be owned by an `EmbeddedSubProcess` node, gains this one alternative under the profile. The checked graph thereby records exactly what CIB parses: the activity is a scope owning its locals.
- **Program.** Lowering wraps the task in the existing operations: `enterScope` with origin the task and id `operation:local-scope:<TaskId>`, the unchanged `awaitUserTask` inside the child scope, a `reachNoneEnd` with id `operation:local-scope-end:<TaskId>`, and the existing `completeScope`. The places between them are new `place:local-scope:<TaskId>:entry` and `:exit` places. `ProgramStructuralValidation` checks only nonempty identities and existing places for `enterScope`, so it is expected to stay untouched; if an implementation finds otherwise, the proposal returns to review.
- **Runtime.** The task's frame is an ordinary scope frame: `NSD-INIT-01` installs it at entry, `NSD-READ-01` and `NSD-WRITE-01` resolve through it first, `NSD-OUTPUT-01` publishes from it at completion, and `NSD-RETIRE-01` retires it. Counters already issue the next ordinal per element.

## Admission

`UTL-ADMIT-01`: source admission accepts a User Task's `camunda:inputOutput` under the profile within the required scope above and refuses every excluded shape with a diagnostic, before lowering.

`UTL-SCOPE-01`: checked admission accepts a definition scope whose origin is a mapped User Task, under the profile, exactly when that task is the scope's origin, no node is placed in it, and its parent is the task's scope; the existing alternatives for every other scope are unchanged.

`UTL-BURST-01`: the profile refuses at admission, on the serial route as on the re-entry route, a Program whose longest automatic step sequence from Start or from any resumption exceeds `semanticProcessClosureLimit`. A mapped User Task adds scope entry, the body End and scope completion to every closure through it, which makes the recorded serial stall reachable with fewer nested Sub-Processes; the re-entry account's burst analysis already handles a single root path, so it serves the serial route too. Every retained model of the profile must stay admitted; the corpus test decides it.

`UTL-AVAILABLE-01`: a `${name}` input of a mapped User Task requires `name` exactly as a Sub-Process input does under the routed account (`NSD-AVAILABLE-01`, `SRE-AVAILABLE-01`).

## Stable rules

`UTL-INIT-01`: entering a mapped User Task installs its frame with each input evaluated once, in document order, against the enclosing chain at entry; no input reads another input of the same task.

`UTL-TASK-01`: a completion of a mapped User Task may name only names declared on its frame chain, the task's frame first; each write lands at the nearest declaring owner; the patch commits before any output runs.

`UTL-OUTPUT-01`: completing a mapped User Task runs its outputs once, in document order, each reading the task's own local and writing to the nearest owner from the task's parent, and retires the frame in the same committed step.

`UTL-FRESH-01`: each activation of a mapped User Task gets a fresh frame and the next task ordinal; no frame survives its activation.

`UTL-STALE-01`: a completion naming an earlier activation, or a frame already retired, is rejected unchanged.

`UTL-DETAIL-01`: hosted User Task detail resolves each name through the task's frame chain.

## Newly reachable waits and resumption

No new wait kind. A mapped User Task's wait is the existing User Task wait, armed after scope entry; its completion resumes into the body End and scope completion before the task's outgoing flow, which `UTL-BURST-01` bounds.

## Separating witnesses

Two new retained whole models, each with an exact source overlay where it has a Service Task:

- **Purchase request review.** The root User Task *Review request* declares `summary` from `${request}` and `decision` as `pending`, and outputs `approval` from `${decision}`; a root Choice routes `stringEquals(approval,"rework")` back to *Review request* and otherwise to the mapped Service Task *Place order*, which reads `approval`. Witnesses: the task's locals at arming; a completion writing `summary` changes the local and leaves Process `request` unchanged; `approval` appears at completion and the locals are gone; the second activation starts from `request` again with ordinal two, and the first activation's completion is rejected.
- **Incident review.** A Sub-Process *Investigate incident* declares `notes` from `${report}`; inside it the User Task *Assess severity* declares its own `notes` as a present null and `severity` as `low`, and outputs `rating` from `${severity}`. Witnesses: the task's null `notes` hides the Sub-Process local in the task's reads and in hosted detail; a completion writing `notes` lands in the task's local and leaves the Sub-Process local unchanged; `rating`, undeclared by the Sub-Process, lands at the Process; reordering the two input declarations changes nothing.

Refused one-fact edits: an output naming a non-local; an input that is neither a literal nor an exact reference; a mapped User Task inside a forking body; inside a called Process; carrying form metadata; at definition depth four; and a serial model whose burst through a mapped task exceeds the limit.

Mutations: a completion that keeps the task frame; a patch that writes the Process instead of the task's local; outputs that run before the patch; inputs evaluated against the task's own frame so a sibling is visible; hosted detail that reads Process bindings only; a burst count that omits the task's scope steps.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `UTL-ADMIT-01` | Both models admitted; each refused edit | Source, core, Lean conformance module | Accept an output naming a non-local |
| `UTL-SCOPE-01` | Task-owned scope admitted; a task scope holding a node, or with a wrong parent, refused | Checked admission in Lean and core | Accept any scope origin |
| `UTL-BURST-01` | Exact-limit serial model admitted, one-over refused; every retained model admitted | Conformance module, core, corpus; core runtime test against the actual closure | Omit the task's scope steps |
| `UTL-INIT-01` | Reordered inputs agree; no sibling read | Lean frame laws, core, pipeline, CIB probe | Evaluate against the task's own frame |
| `UTL-TASK-01` | Patch of `summary` and `notes` lands in the task frame | Pipeline, CIB probe | Write to the Process |
| `UTL-OUTPUT-01` | `approval` and `rating` appear once at completion; locals retired | Lean frame laws, pipeline, CIB probe | Run outputs before the patch; keep the frame |
| `UTL-FRESH-01` | Second activation fresh, ordinal two | Pipeline, CIB probe ids | Keep the frame |
| `UTL-STALE-01` | First activation's completion rejected | Pipeline, CIB stale task id | Identity by element only |
| `UTL-DETAIL-01` | Null `notes` shown as null | Temporal protocol test | Read Process bindings only |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. Frame installation, nearest resolution, completion retirement and output publication are already quantified over every scope occurrence of the profile, whatever its origin: [`initializeFrame?_reads_parent_chain`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#initializeFrame?_reads_parent_chain), [`resolveOwner?_frame_nearest`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#resolveOwner?_frame_nearest) and [`completeScopeState?_retires_frame`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#completeScopeState?_retires_frame). The family's own propositions, the ownership alternative, the lowering wrapper and the serial burst, are finite and checked by an executable conformance module over both models and every refused edit.

Not proved, and recorded as such: that every actual closure stays within the computed burst; the runtime closure bound rolls an over-limit closure back atomically.

## Temporal hosting and refinement preflight

No new hosting mechanism: ingress, waits, effects and lifecycle are unchanged, and frames are committed state carried through Continue-As-New. The one hosted change is the detail query of `UTL-DETAIL-01`, a read of committed state. The Start capacity envelope keeps its routing: serial Programs keep every check, re-entry Programs the Program-level ones. The preserved relation is equality of hosted committed state and core state; the smallest witness is the pipeline over both models.

## Evidence and acceptance

Both models run as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, corpus rows and the About disclosure. The CIB lane is a calibration probe beside the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java), with JUEL renditions of the conditions under `CIB-CFG-0005`, asserting the task execution's local variables at each wait, the Process variables after each completion, distinct task ids per activation and failure of the stale task.

Acceptance: Lean, core and pipeline agree on every scenario of the profile; the probe agrees; every retained model stays admitted; the hosted pipeline passes once at family closure. Then the clauses named above are evidenced, and each row's other clauses stay open.

Nearest unsupported claims: mapped User Tasks on concurrent branches and in called Processes, input lists, maps and expressions, and quantified bounded closure.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no shape changes; admission accepts mapped User Tasks under the profile; the profile artifact grows in place; no legacy reader or migration is added.

### Owners this implementation grows

Build cost is a constraint. Before the Lean stage starts, PLAN's [Lean build follow-up](../PLAN.md#lean-build-follow-ups) that makes the fan-out model count public-interface body edits must land, so the edits below are priced by a model that does not under-count them. No kernel type, `ValueDomain`, `ProgramStructuralValidation`, `CommandAdmission` or `RuntimeState` declaration is touched. Three Lean hubs take body edits, landed in one commit:

- [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), the child-scope ownership rule: the `UTL-SCOPE-01` alternative. The alternative to a body edit is a checked node kind, a kernel type change.
- [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), the User Task arm: the wrapper operations. Lowering owns every checked-to-Program mapping, so no leaf can take it.
- [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), the serial route: the `UTL-BURST-01` refusal, calling the existing burst analysis of the [re-entry leaf](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean).

The depth bound and the serial walk's treatment of a one-task body are expected to hold unchanged in [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean); a new conformance module is a family-owned leaf.

- TypeScript: [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts), [checked process admission](../../packages/bpmn-source/src/checked-process-admission.ts), the source lowering, [structured scope-data routing](../../packages/semantic-core/src/structured-scope-data-routing.ts) and the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts) for the serial burst.
- Temporal: [hosted User Task detail](../../packages/temporal-adapter/protocol/src/user-task-detail.ts).
- Registration: [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes), the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) and README, the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and new module;
- [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts), which binds the checked admission and lowering owners;
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts) and [`runtime-state-non-reissue-claims`](../../scripts/runtime-state-non-reissue-claims.test.ts), which must stay unchanged in content, since no operation or runtime field is added;
- the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing stays unchanged;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`contract-artifact-projections`](../../scripts/contract-artifact-projections.test.ts), [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts) for the grown artifact;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
