# Pass-through Task proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a plain BPMN Task and a Manual Task, so that each, on arrival of a token, publishes one occurrence of its own element that starts and ends in the same step and moves the token on, with no wait, effect, receipt command or data access, and keeps its source kind in the checked graph? Every model, command and observation the profile admits today must keep its meaning.

This is the first family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). It takes every open checklist row that shares the pass-through mechanism:

- `PC-HUM-04`, except its Parallel-branch clause: Plain Task pass-through in serial, Choice-branched and scoped graphs. Parallel branches stay open with the concurrent account's widening, which `PC-CF-07` must make for every Activity kind.
- `PC-HUM-05`, except its implicit split and merge clause: Manual Task pass-through with a distinct source kind. That clause stays open on `PC-CF-07`, which owns implicit Activity split and merge for every Activity kind.

The research denominator, the 1,144 model files under the pinned engine's `test/resources/org/cibseven/bpm/engine/test/bpmn`, holds plain Tasks in 33 files (41 occurrences) and Manual Tasks in 19 files (36 occurrences).

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 13.1.** Manual Task and Abstract Task are *non-operational*. An implementation MAY extend their semantics to make them executable, as an optional extension, and a Process Execution Conformance implementation MAY ignore them.
- **Clause 13.3.3.** "Upon activation, the Abstract Task completes." A Manual Task "is distributed to the assigned person or group of people" and completes when that work is done. Both are "a conceptual model only", never executed by an IT system.
- **Clause 10.3.4.1.** A Manual Task is "unmanaged in the sense of that the business process engine doesn’t track the start and completion of such a Task".

CIB Seven `2.2.0` at the pinned checkout `5a45b47ea2`, whose cited files are unchanged from `v2.2.0`:

- **Parsing.** `BpmnParse.parseTask` and `parseManualTask` (`bpmn/parser/BpmnParse.java:2711-2739`) give the activity a `TaskActivityBehavior` or a `ManualTaskActivityBehavior`. The second is an empty subclass of the first. Asynchronous continuations and execution listeners are parsed on both.
- **Execution.** `TaskActivityBehavior.execute` calls `leave` (`bpmn/behavior/TaskActivityBehavior.java`). `leave` runs `BpmnActivityBehavior.performDefaultOutgoingBehavior` (`:54-118`), which takes every outgoing flow whose condition holds, else the default flow, else fails.
- **History.** The activity instance starts and ends inside the command that reached it. Its activity type is `task` or `manualTask` (`ActivityTypes.java:40,44`). No task entity and no job is created.

Classification: a new extension, `CIB-EXT-0022`. CIB executes both non-operational Task types as an immediate pass-through, as Clause 13.1 permits. It records each as a started and ended activity instance. For a Manual Task this goes beyond the conceptual tracking of Clause 10.3.4.1, and it does not distribute the work. The abstract Task's pass-through agrees with the conceptual model of Clause 13.3.3. The register entry and its verifier coverage are added together. The ledger row `BPMN-ABSTRACT-TASK-01` moves from `unsupported` to this profile's bounded evidence. A new row `BPMN-MANUAL-TASK-01` records the Manual Task the same way.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, plus a `bpmn:task` or `bpmn:manualTask` with:

- only `id` and an optional `name`;
- exactly one incoming Sequence Flow of any kind the profile admits, a Choice's conditional candidate or default flow included;
- exactly one outgoing Sequence Flow, unconditioned and not a default flow.

Such a Task may stand:

- on the root path of the serial account;
- in the root graph of the [scope re-entry](SCOPE-REENTRY-SPEC.md) account, on a Choice branch or a cycle;
- on the serial path of a Sub-Process body at any admitted depth.

Optional: several pass-through Tasks in one model, and one re-entered by a cycle.

Excluded, each refused at admission:

- a pass-through Task in a Program that forks: the concurrent account refuses every `mergeExclusive` and has no pass-through vertex;
- in a called Process, whose body stays one to three User Tasks;
- several incoming or outgoing flows, or a conditional or default outgoing flow (`PC-CF-07`);
- a pass-through Task on a Parallel branch, the open clause of `PC-HUM-04`;
- `camunda:asyncBefore` or `asyncAfter`, execution listeners, `camunda:inputOutput` or other extension elements;
- loop or Multi-Instance characteristics;
- attached boundary events, and `isForCompensation`.

These bound admission only. Each later widening changes the lowering or arity of the same checked node without reinterpreting an accepted model. An implicit merge, for example, lowers to a many-input `mergeExclusive`, which is CIB's per-token activation. That widening must also replace the Program-level classifier of [Admission](#admission), because a many-input `mergeExclusive` is then indistinguishable from an Exclusive merge.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [pre-baseline profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged, and its artifact adds `CIB-EXT-0022`.

Observation adds no field. A pass-through Task publishes one flow-node occurrence `(processId, elementId, owner)` that starts and ends in the same publication, as an Exclusive merge does today. Enabled external interactions change only through the Task's successor. The source kind is not a published field; consumers resolve it from the admitted source, as they do for every element.

## Representation and runtime ownership

This family makes one kernel type change, allowed once per family by [contract item 4](../LEAN-BUILD-MODULARITY-SPEC.md#contract).

- **Checked graph.** A new arm `nonOperationalTask (id : NodeId) (notation : TaskNotation)` with `TaskNotation := abstractTask | manualTask`. In TypeScript this is `CheckedNodeKind.NonOperationalTask` with `notation`, and the checked-process schema adds the variant. The arm names the source kind, not the CIB behavior: the profile's lowering selects pass-through, so a later account that distributes Manual Task work needs no new kernel arm. The arm keeps the source kind, so neither erasure nor a reading as a User Task can pass the checked relation.
  - Rejected alternative: projecting the Task as a checked `exclusiveMerge`. This erases the kind the row requires, and a later Activity feature (mappings, boundaries, Multi-Instance) would have no Activity node to attach to.
- **Program.** Lowering emits the existing `mergeExclusive` with the Task's one input place, its one output place and the Task as origin. No IL type changes. `mergeExclusive` is the IL's nonsynchronizing token move, and `ProgramStructuralValidation` already admits one input. With one input it is exactly an Activity lifecycle that does no work.
  - Program-level analyses identify a pass-through Task as a one-input `mergeExclusive`. This is unambiguous because every checked Exclusive merge any profile admits has at least two incoming flows: the Lean checked invariant [`CheckedProcessAdmission.lean:390-392`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and its TypeScript projection `checked-element-projection.ts:305-308`.
  - Rejected alternative: a new `passThrough` operation. It would be a second kernel type change, and every operation consumer of the census would need it.
- **Runtime.** Unchanged. The scheduler fires the operation as one step, and the occurrence projection already publishes an instantaneous occurrence for an operation-origin `mergeExclusive`. Each activation gets a fresh occurrence identity.

## Admission

The shared scope-data vertex model gains a `PassThrough` vertex with no reads or writes and one output. It is projected from the checked arm, and on the Program side from a one-input `mergeExclusive`.

- **Serial walk.** Accepts the vertex on the root path and on Sub-Process paths. The called-path rule is unchanged, so a called Process refuses it.
- **Re-entry route, amended.** Today the Program-level predicate of `SRE-ROUTE-01` counts every root `mergeExclusive` (`scope-reentry-admission.ts:32-38`; Lean `ScopeReentry.programReentry`, consumed at `NestedScopeControlAdmission.lean:834`). This family amends it to count only a `mergeExclusive` with at least two inputs, so a serial model with a root pass-through Task stays on the serial route at both levels and the [Start capacity envelope](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts) keeps its routing. The amendment is additive: every model admitted today has no one-input `mergeExclusive`. The [scope re-entry specification](SCOPE-REENTRY-SPEC.md#admission) records it, and *Close return ticket* at the root of Equipment return is the witness that locks the route.
- **Burst.** The re-entry burst (`SRE-BURST-01`) gives the vertex a cost of one, without stopping.
- **Serial-route burst.** A serial-route model holding a pass-through Task is admitted only when the same burst computation stays within the closure limit of eight (`PTT-BURST-01`). The serial route's recorded lack of a burst rule stays as disclosed for models without one. Adding the rule to those models would narrow admitted behavior and needs a new profile identity.
- **Concurrent account.** Refuses the checked arm and the one-input `mergeExclusive`, unchanged.

## Stable rules

| Rule | Statement |
|---|---|
| `PTT-ADMIT-01` | The profile admits a pass-through Task with one incoming flow of any admitted kind and one unconditioned, non-default outgoing flow, exactly in the required scope, and refuses each excluded form. |
| `PTT-KIND-01` | The checked node keeps `abstractTask` or `manualTask` as written in the source; lowering is the same for both. |
| `PTT-PASS-01` | A token arriving at a pass-through Task is consumed, one occurrence of the Task starts and ends in that step at the token's scope occurrence, and one token reaches the outgoing flow; no wait, effect, receipt or data change occurs. |
| `PTT-BURST-01` | A pass-through Task costs one burst step; a serial-route model holding one is admitted only when its maximum burst is at most the closure limit. |
| `PTT-FRESH-01` | Each activation of a re-entered pass-through Task publishes a distinct occurrence. |

## Newly reachable waits and resumption

None. A pass-through Task never waits, so every resumption point and command of the profile is unchanged. It only lengthens the automatic steps between waits, which `PTT-BURST-01` bounds.

## Separating witnesses

- **Equipment return** (serial and scoped):
  - Path: *Return requested* → User Task *Schedule pickup* → Sub-Process *Inspect returned equipment* → plain Task *Close return ticket* → End.
  - The Sub-Process holds Start → Manual Task *Unpack equipment* → User Task *Record condition* → End.
  - The longest burst is five.
- **Document intake** (branched and cyclic, re-entry account):
  - Path: *Document received* → Merge *Intake requested* → User Task *Classify document* → Choice *Document format*.
  - The `paper` branch goes to Manual Task *File paper original* and Merge *Filed*.
  - The `illegible` branch goes to Manual Task *Phone sender for a better copy* and back to *Intake requested*.
  - The default branch goes to plain Task *Register digital copy* and *Filed*.
  - *Filed* goes to End. The longest burst is five.
  - Journeys: illegible, illegible, then paper, which re-enters the Manual Task *Phone sender* and gives it two occurrences; and digital.
- **Refused edits:** each excluded form above, applied to one of these models; a pass-through Task in a forking Sub-Process body; and a serial chain whose burst is nine. A chain whose burst is exactly eight is admitted.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `PTT-ADMIT-01` | Both models admitted; each refused edit refused | Source, core, Lean conformance module | Accept an asynchronous or two-outgoing Task |
| `PTT-KIND-01` | `manualTask` and `abstractTask` survive the checked JSON round trip | Core, Lean codec check | Erase the notation to `abstractTask` |
| `PTT-PASS-01` | The first publication after *Schedule pickup* shows *Unpack equipment* started and ended, with *Record condition* open | Pipeline, CIB probe | Lower the Task as `awaitUserTask` |
| `PTT-BURST-01` | Burst-eight chain admitted, burst-nine refused; the core runtime closure agrees at the limit | Conformance module, core, runtime test | Cost zero for the vertex |
| `PTT-FRESH-01` | *Phone sender* has two occurrences with distinct identities | Pipeline, CIB probe | Reuse the first occurrence |
| `SRE-ROUTE-01`, amended | Equipment return stays on the serial route at checked and Program level; a one-input `mergeExclusive` never routes to re-entry | Core, conformance module, Start capacity envelope test | Count a one-input merge as a Merge |

## Lean assurance lane

Lane shape: checked

Evidence:

- The family adds no transition family and no runtime law, because the Program it produces uses only `mergeExclusive`.
- A `rfl` lowering lemma for the new arm states its exact operation.
- An executable conformance module checks the admission, kind, lowering and burst over both models and every refused edit.

Not proved, and recorded as such: that every actual closure stays within the computed burst. The runtime closure bound rolls an over-limit closure back atomically.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress, waits, timers, effects, cancellation and lifecycle are unchanged, and `mergeExclusive` is already hosted. Delivery, ordering, deduplication, retry, replay and cancellation risks: none new, because a pass-through Task introduces no wait, so no ingress can address it and a cancellation finds no state of it to remove. The occurrence projection is the existing one. The preserved relation is equality of hosted committed state and core state. The smallest witness is the hosted pipeline over both models at family closure.

## Evidence and acceptance

Both models run as answer-free scenarios. Each has a registered pipeline case, seeded mutations, value-domain matrix rows, corpus rows and the About disclosure. The CIB lane is a calibration probe beside the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java), with JUEL renditions of the conditions under `CIB-CFG-0005`. It asserts, for each pass-through Task:

- a historic activity instance of type `task` or `manualTask`, ended within the command that reached it;
- no task entity and no job;
- the Process standing at the next wait;
- two distinct activity instances for the re-entered Manual Task.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile.
- The probe agrees.
- Every retained model stays admitted.
- The hosted pipeline passes once at family closure.

Then `PC-HUM-04` is evidenced except its Parallel-branch clause, and `PC-HUM-05` except its implicit split and merge clause; both rows stay open on those clauses.

Nearest unsupported claims:

- pass-through Tasks on Parallel branches, with token multiplicity above one, in called Processes and with several flows;
- asynchronous continuations, listeners and mappings on them;
- quantified bounded closure.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy):

- the checked-process schema and its producers, consumers and fixtures change atomically to add the variant;
- admission accepts pass-through Tasks under the profile, and the amended `SRE-ROUTE-01` routes one-input merges to the serial account;
- the profile artifact grows in place;
- no legacy reader or migration is added.

### Owners this implementation grows

Build cost is a constraint. The kernel arm rebuilds nearly the whole library once, the price [contract item 4](../LEAN-BUILD-MODULARITY-SPEC.md#contract) sets for an increment that adds a kernel type, so every Lean edit lands in that one commit. Because that complete rebuild, not fan-out, prices this family, PLAN's [Lean build follow-up](../PLAN.md#lean-build-follow-ups) that repairs the fan-out model is not its prerequisite and stays scheduled for the next family whose plan prices its edits by fan-out.

PLAN's two follow-ups scheduled "at the next kernel-type change" ride in the same rebuild window, as their own commit before it. Both are library-wide mechanical passes, so each runs under [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change): a declaration with its cost extrapolated from timed samples of its heaviest units, a fresh review before it runs and a fresh check after. If the declared cost exceeds 90 minutes, they do not run and are recorded for the next kernel change.

No `ValueDomain`, `ProgramStructuralValidation`, `CommandAdmission`, `RuntimeState`, `SemanticProcessContract` or `TransitionRecord` declaration is touched. The Lean owners:

- [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean): the arm and `TaskNotation`, the kernel type change.
- [`SemanticProcessJson/CheckedProcess`](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean): the codec arm.
- [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean): the lowering arm and its `rfl` lemma. Lowering owns every checked-to-Program mapping.
- [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean): the one-in, one-out arity of the arm, beside the existing per-kind arity rules (`:385-392`).
- [`CheckedGraphValidation`](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean), [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) and [`ProfileCardinalities`](../../BpmnSemantics/SemanticProcess/ProfileCardinalities.lean): only the new arm in their exhaustive matches over checked nodes. `CheckedGraphValidation` is a hub with a 503-module interface cone, touched because its matches are exhaustive; the kernel arm rebuilds that cone anyway.
- [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean): the `passThrough` vertex kind, an interface edit, plus its checked and Program vertices and the walk.
- [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) and [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean): the Program route predicate, the burst cost and the serial `PTT-BURST-01` refusal. The burst computation moves into a family-owned leaf both import, so neither route imports the other.
- The provisional `Experiments/CheckedSource*` modules: their exhaustive matches.
- A new executable conformance module: a family-owned leaf.

TypeScript owners:

- the semantic core: [checked process contract](../../packages/semantic-core/src/checked-process-contract.ts), [profile shape](../../packages/semantic-core/src/checked-process-profile-shape.ts), [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), [nested scope control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) and [structured scope-data routing](../../packages/semantic-core/src/structured-scope-data-routing.ts);
- the source package: [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts), [checked process admission](../../packages/bpmn-source/src/checked-process-admission.ts), [graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) and [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts);
- the [checked-process schema](../../contracts/schemas/checked-process.schema.json);
- the bounded [metamodel manifest](../../packages/bpmn-source/src/bpmn-2.0.2-semantic-process-metamodel.json) and its [checker](../../scripts/check-bpmn-semantic-process-metamodel.ts), run by `test:bpmn-source`: `ManualTask` and its compiler projection type join `Task`, re-derived from the OMG CMOF.

Registration:

- `CIB-EXT-0022` in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- the `SRE-ROUTE-01` amendment in the [scope re-entry specification](SCOPE-REENTRY-SPEC.md#admission);
- the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) and README;
- [ledger](../BPMN-REQUIREMENT-LEDGER.md) rows `BPMN-ABSTRACT-TASK-01` and `BPMN-MANUAL-TASK-01`;
- scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and new module;
- [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts), which binds the checked admission and lowering owners;
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts) and [`runtime-state-non-reissue-claims`](../../scripts/runtime-state-non-reissue-claims.test.ts), which must stay unchanged in content, since no operation or runtime field is added;
- the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing stays unchanged;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`contract-artifact-projections`](../../scripts/contract-artifact-projections.test.ts), [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts), for the grown artifact;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
