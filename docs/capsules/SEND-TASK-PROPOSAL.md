# Send Task proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a BPMN Send Task whose send is performed by an explicitly configured handler, executing it as the profile's existing mapped effect, wherever the profile admits a mapped Service Task, without inferring a transport from a Message or Message Flow and without changing any other element, profile, command or observation?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (“Plain/Manual, Send, Script, Rule …; reuse effect/control contracts”). Its mechanism is the source reader's projection: today `readScope` refuses `bpmn:SendTask` as outside the contract ([nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts)), and the [executable capability inventory](../../scripts/executable-model-capabilities.ts) rejects it as unclassified. It serves one row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-AUTO-04`, primary: its clauses on an explicitly configured outbound send with typed message data and prescribed completion, a send derived from a committed occurrence snapshot, a wrong recipient, correlation or result failing, duplicate transport recovery creating no second BPMN activation, and no transport inferred from Message Flow. In a handler-configured send the recipient and the correlation key are typed send data, inputs of the handler, so a wrong one is a wrong published argument. The row stays open on prescribed failure: technical failure, retry and incidents, which this profile admits for no task and `PC-AUTO-03` owns.

Screened out, each with its reason:

- A wait-free branch of a terminal fork (`PC-HUM-04`'s last residual): it needs `ordinaryEnd` and `regional` commutation pair laws beside declared entries, a new Lean proof family, and no pinned CIB model whose shape the profile otherwise admits holds it.
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`): each first needs a language or decision-engine binding, a dependency decision.
- Implicit split and merge and Link Events (`PC-CF-07`, `PC-BASIC-02`): the control place without a Sequence Flow behind it, the kernel extension on which the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected.

Selection, 2026-11-03: of the pinned checkout's 2,458 `*.bpmn` and `*.bpmn20.xml` files outside `target/`, 11 hold a Send Task, every one with a CIB implementation (two `camunda:class`, seven `type="mail"`, one `type="external"`, one connector), none with a `messageRef`; the delegate and expression forms appear only in Java-built test models (`SelfCancellationTest`, `ProcessModels`). Close call against the wait-free terminal branch, decided on cost and semantic risk, since neither reaches a pinned model as it stands (every pinned Send Task uses a CIB implementation this profile refuses, and no pinned model needs the wait-free branch): the branch would close `PC-HUM-04` but carries the higher concurrency risk and needs a new commutation proof family, against a Send Task that reuses the approved effect contract unchanged at the cost of one source projection.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.3 defines the Send Task as a Task that sends a Message to an external Participant, with `messageRef`, `operationRef` and `implementation` (default `##WebService`, Table 10.9); when it references a Message it has at most one inputSet and one Data Input, whose data populates the Message, and the Participant is identified through a Message Flow of the definitional Collaboration. Clause 13.3.3 has it assign the Message from its Data Input on activation, send it and complete, and assigns no output. The standard leaves the sending technology to `implementation`.

CIB Seven `2.2.0` (`BpmnParse.parseSendTask`, `engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/parser/BpmnParse.java:2505-2541`, pinned `5a45b47e`) never reads `messageRef`, `operationRef` or `implementation`. With `camunda:class`, `delegateExpression`, `expression` or `type` it parses the Send Task as a Service Task (`parseServiceTaskLike`, CAM-942, “to allow implementing the send handling yourself”); without one it reports a parse error. It parses `camunda:inputOutput` and `camunda:asyncBefore` as on every activity, and records each activation as a historic activity instance of type `sendTask` (`BpmnParse.java:1912`, `ActivityTypes.TASK_SEND_TASK`).

Classification: a new bounded extension, `CIB-EXT-0023` (Send Task performed by a configured handler): the send is the handler's effect, configured by `camunda:delegateExpression` and bound by the source overlay as the profile's Service Tasks are (`CIB-EXT-0019`), and the Message data are the handler's inputs. Those `camunda:inputParameter` declarations are CIB extension locals (`CIB-EXT-0015`), not BPMN Data Inputs, so the one-Data-Input constraint of a Message-referencing Send Task does not bound them. No Message is constructed and no Message Flow, Collaboration or `messageRef` is read; the profile refuses each. The asynchronous continuation keeps its existing relationship under this profile.

## Required, optional and excluded scope

Required: a `bpmn:SendTask` in every position the profile admits a mapped Service Task (the serial, re-entry, concurrent and Sub-Process body accounts of the profile, single-scope models included), with exactly the Service Task's source form: `id`, an optional `name`, `implementation` the Activity effect protocol, `camunda:delegateExpression` bound by the source overlay, `camunda:asyncBefore="true"`, and `camunda:inputOutput` input parameters of the admitted grammar.

Optional: none.

Excluded, each refused at admission:

- a Send Task without a delegate expression, or with `camunda:class`, `expression`, `type` (mail, external, connector) or `resultVariable`;
- `messageRef`, `operationRef`, any other `implementation`, a Collaboration, Participant or Message Flow, and Message definitions referenced by a Send Task;
- output parameters, a restriction of this profile: Clause 13.3.3 assigns no output when a Send Task completes, and CIB gives a Send Task no output semantics of its own, so the profile admits none and the handler's result patch must be empty;
- a boundary Error Event on a Send Task, listeners, loop and Multi-Instance characteristics, and every other exclusion of the Service Task under this profile;
- a Send Task under every other profile.

These bound admission only: a later Message-addressed send (`PC-MESSAGE-09`) or a Send Task with outputs broadens the class without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `send-tasks` and the relationship `CIB-EXT-0023`, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation, wire contracts and the checked-process schema are unchanged: a Send Task's effect is published exactly as a Service Task's (`EFFECT-OBSERVE-01`), an open effect with its occurrence identity and descriptor, which carries no element kind for either.

## Representation and runtime ownership

No kernel type, IL, runtime or Lean change. The source reader projects an admitted Send Task to the checked `serviceTask` node with an empty output list, through the same projection and overlay binding as a Service Task; lowering, admission, execution and publication are the Service Task's.

- The checked graph does not keep the Send Task's source kind. Unlike the pass-through kinds (`PTT-KIND-01`), whose checked notation the pass-through account consumes, no consumer reads it: the Program drops task kinds, no observation publishes one for any effect, CIB's historic activity type lies outside the observation boundary, and the exact source bytes keep it. Adding it would change the checked-process wire contract and the Lean checked-process hub for no consumer. A later account that needs it adds it with that consumer.
- Rejected alternative: a separate checked `sendTask` node. It duplicates every Service Task admission and lowering arm at both levels, which the profile's accounts would each have to name.
- Rejected alternative: admitting output parameters as CIB's generic activity mapping permits. Clause 13.3.3 assigns none, no pinned model uses them, and a later account can admit them without reinterpreting an admitted model.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Only the nested scope-data reader gains the projection; its foreign-attribute rule admits `camunda:delegateExpression` and `camunda:asyncBefore` on a Send Task as on a Service Task, and the projected-key shape admits no other enumerable key. bpmn-moddle defines `messageRef` and `operationRef` as non-enumerable reference properties, which a key inventory never sees (as `default` and `eventDefinitionRef` before them), so the projection refuses both by name. Today the reader's root check already refuses every Process root that declares a Message or an Interface, so the by-name refusal is witnessed at the projection, and keeps the refusal exact once the profile admits root Messages. The checked and Program analyses are unchanged, since the projected node is a Service Task's.

Nearest wrong algorithms, each with a separating witness below:

1. admitting an unbound Send Task as pass-through or fire-and-forget, or with a mail, external or class implementation, which sends without a configured handler;
2. reading `messageRef` as a transport, or accepting it as inert, which infers a send from a Message;
3. admitting the Service Task's output parameters on a Send Task, which accepts a non-empty result patch;
4. adding the projection to the shared business-task reader, which admits a Send Task under the serial business-task profile.

## Stable rules

| Rule | Statement |
|---|---|
| `SEND-ADMIT-01` | Under the nested scope-data profile a Send Task with an overlay-bound delegate expression, asynchronous continuation and input parameters is admitted in every position a mapped Service Task is, and only there. |
| `SEND-EFFECT-01` | An admitted Send Task executes as the profile's mapped effect: each activation commits one effect occurrence whose descriptor and arguments come from the committed state, and only its result completes it. |
| `SEND-DATA-01` | Under this profile a Send Task declares no output, so its result patch is empty; a result carrying any binding is refused with exact state preservation. |
| `SEND-REFUSE-01` | A Send Task without a bound delegate, with another CIB implementation, with `messageRef`, `operationRef` or another `implementation`, with output parameters, or under another profile is refused at admission. |

## Newly reachable waits and resumption

None of a new kind. A Send Task's wait is the effect wait of the Service Task account, resumed only by its effect result, and its closures are bounded by the unchanged burst rules.

## Separating witnesses

Each model carries a source overlay binding its handler.

- **Shipping notice** (serial, single scope): Start binds `order` and `customerEmail`; User Task *Pack order* → Send Task *Send shipping notice*, handler `sendShippingNotice`, inputs `recipient` from `${customerEmail}`, `correlationId` from `${order}` and `channel` from the literal `email` → End. Journey: complete *Pack order*, then the effect with an empty result; the Process completes. The open effect publishes the recipient and correlation key as its arguments.
- **Claim acknowledgement** (Sub-Process body with a fork): Start binds `claim`; Sub-Process *Intake* holds a fork into Send Task *Acknowledge claim*, handler `acknowledgeClaim`, input `claim`, and User Task *Assess claim*, joined before its End; then User Task *Settle claim* → End. Two journeys, in both completion orders of *Assess claim* and the acknowledgement's result.
- **Refused edits** of the shipping notice: the delegate removed, and `type="mail"` or `camunda:class` instead (wrong algorithm 1); `messageRef` or `operationRef` set on the Send Task, refused at the projection (wrong algorithm 2); an output parameter (wrong algorithm 3); and the model with its overlay retargeted under the serial business-task profile, where its Service Task twin is admitted (wrong algorithm 4).
- **Result refusal:** the shipping notice's effect result with one binding is refused and leaves the state unchanged, while the empty result commits (`SEND-DATA-01`).
- **Reused evidence** for the projected effect, which is the Service Task's node and operation: the committed argument snapshot that a sibling's later write cannot change, owned by the [concurrent structured scope data specification](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#normative-basis-and-cib-classification) with its schedule boundary against CIB (`CIB-EXT-0015`), and duplicate delivery after a detached first attempt reusing the occurrence's `idempotencyKey`, locked by the [concurrent scope Service Task recovery test](../../packages/temporal-adapter/testkit/test/concurrent-scope-service-tasks-recovery.temporal-test.ts). Both carry over unchanged because a Send Task reaches the core and the adapter only as that node and operation.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `SEND-ADMIT-01` | Both models admitted; the serial business-task edit refused beside its admitted Service Task twin | Source test only, a single TypeScript source decision; the core, Lean and Temporal see only the projected node | Refuse the Send Task projection, or add it to the shared business-task reader |
| `SEND-EFFECT-01` | Both journeys: one open effect per activation whose arguments carry the recipient and correlation key, completed by its result | Core, pipeline (Lean and Temporal), CIB probe | Pipeline mutations of the published recipient argument and of the open effect's presence |
| `SEND-DATA-01` | The empty result commits; a one-binding result is refused | Core test; Lean holds no separate refusal theorem for an output-free effect, so the Lean lane evaluates only the committed journeys | Admit output parameters on the projection |
| `SEND-REFUSE-01` | The refused edits | Source test only | Drop any one refusal |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family, no runtime law and no Lean code. Lean receives only the projected node, so it neither sees nor refuses a Send-specific projection: `SEND-ADMIT-01` and `SEND-REFUSE-01` are single-implementation TypeScript source decisions. A Send Task's checked node and Program operation are a Service Task's, so the effect accounts of the profile apply as they stand: [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) admits the node and [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) lowers it to `awaitEffect`. The pipeline cases execute both journeys through the Lean evaluator and compare it with the core.

## Temporal hosting and refinement preflight

No new hosting mechanism. A Send Task's ingress, wait, effect, cancellation, lifecycle and publication are the mapped Service Task's: the adapter derives one Activity from the committed effect intent, and a transport retry reuses that occurrence's identity and idempotency key, so a duplicate delivery never creates another BPMN activation. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged. A handler result that the core refuses (`SEND-DATA-01`) fails the hosted Workflow as a typed host failure, not as a state-preserving refusal, as for every effect. The smallest witness is the hosted pipeline over both models' journeys at family closure, with duplicate delivery reused from the recovery test named under the witnesses.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. A source test locks the refused edits, and a core test the result refusal. The CIB lane gains a test-only Send Task probe driving both journeys in CIB `2.2.0` with each handler as a delegate bean, calibrating one asynchronous job and one historic activity instance of type `sendTask` per activation, the handler's received inputs and the unchanged Process variables; its journeys run every continuation job before the next command, the schedule within the `CIB-EXT-0015` boundary.

Then `PC-AUTO-04` is evidenced on its configured-send, committed-snapshot, wrong recipient, correlation and result, duplicate-recovery and no-Message-Flow clauses for this profile, the snapshot and recovery clauses through the reused evidence above, and stays open on prescribed failure.

Nearest unsupported claims:

- a Send Task under any other profile, or with a CIB `class`, expression, mail, external or connector implementation;
- a Message-addressed send through `messageRef`, which CIB never reads;
- technical failure, retry and incidents of the send;
- that every actual closure stays within the admitted burst (not proved in Lean, as for the accounts this family reuses).

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior: every model with a Send Task is refused today.

### Owners this implementation grows

The family touches no Lean source. TypeScript and tooling owners:

- the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts), which gains the projection behind a reader flag set only for this profile, and its foreign-attribute rule;
- the [projected flow-element keys](../../packages/bpmn-source/src/projected-flow-element-keys.ts), which gain the Send Task's key shape;
- the [executable capability inventory](../../scripts/executable-model-capabilities.ts) and the [About catalog](../../model-corpus/mvp-capabilities.ts), which classify and disclose the element;
- a new test-only Send Task probe beside the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with its own session, since the nested-profile pipeline cases carry no CIB oracle and the engine scenario runner's effect projector serves another protocol.

Each owner stays below the review target; growth past it means an extraction, never an exception.

Guards the implementation must change or satisfy: the [projected flow-element keys test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), the [foreign-attribute admission test](../../packages/bpmn-source/test/foreign-attribute-admission.test.ts), the [contract artifact projections test](../../scripts/contract-artifact-projections.test.ts), which requires the register entry and its verifier coverage together, the [profile value-domain test](../../packages/semantic-core/test/semantic-profile-value-domain.test.ts), the [requirement ledger consistency test](../../scripts/requirement-ledger-consistency.test.ts), the [normative reference resolution test](../../scripts/normative-reference-resolution.test.ts), the [executable model capabilities test](../../scripts/executable-model-capabilities.test.ts), both executable model corpus tests ([corpus](../../model-corpus/test/executable-model-corpus.test.ts) and [differential](../../packages/differential/test/executable-model-corpus.test.ts)), the [capability catalog disclosures test](../../scripts/capability-catalog-disclosures.test.ts), the [capabilities panel test](../../platform/apps/web/test/capabilities-panel.test.ts), the [delivery progress test](../../scripts/delivery-progress.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [document reviewability guard](../../scripts/document-reviewability.test.ts).

Detail maps that record the implemented and absent scope: [`implementation-status-owner:ENGINE-CONTRACTS-SOURCE`](../ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [`implementation-status-owner:ENGINE-DATA-FAMILY`](../ENGINE-DATA-FAMILY-IMPLEMENTATION-MAP.md) and [`implementation-status-owner:ASSURANCE-ADOPTION`](../ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md).

Registration: the profile artifact's `features`, relationship list and normative references, which gain Clause 10.3.3, and its README; `CIB-EXT-0023` in the [register](../CIB-BPMN-RELATION-REGISTER.md); scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-MECH-TASK-01`, whose Send entry gains this bounded evidence.

## Implementation notes

Implemented as proposed, with these deviations:

- **Key shape.** The projection delegates to the mapped Service Task's projection after refusing `messageRef`, `operationRef` and any output, so it shares that projection's key shape; the projected-key inventory gains no entry, since a second entry would repeat the same five keys.
- **`implementation`.** The overlay binding matches the attribute exactly, so a Send Task, like its Service Task twin, needs the Activity effect protocol; the proposal's "absent or" was wrong and is corrected above.
- **Embedded completion control.** That profile shares the reader, so the [source test](../../packages/bpmn-source/test/send-task-source.test.ts) also refuses the claim acknowledgement under it beside its admitted data-bearing Service Task twin; setting the reader flag for it fails exactly that test.
- **Correlation key.** The registered shipping-notice mutation moves the recipient; a further [pipeline-case test](../../packages/differential/test/send-task-pipeline-cases.test.ts) shows a correlation key read from the wrong variable is named by the comparison.
- **Maps.** The [`implementation-status-owner:ASSURANCE-ADOPTION`](../ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) map, at its word backstop, gains no line: its case relations across every implemented family, its CIB-backed family probes and the executable corpus already cover these schedules, the probe and the `sendTask` capability. The source map makes room by dropping two review-state restatements that their receipts own.
- **Value domain.** The claim acknowledgement joins the concurrent one-name Start cases; the shipping notice requires two Start names, which that builder does not cover, so it has no matrix row.

Every refusal clause of the projection, the output restriction and the reader flag has a mutation the source test kills. The [CIB probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSendTaskProbeTest.java) passes three of three in CIB `2.2.0`.

Closure gates, green at `e9f0753d` (2026-11-03):

- `./scripts/verify.sh`: the Lean library and `BpmnConformance`, 939 and 920 jobs; the CIB runtime stage, 173 tests with the Send Task probe; the complete Temporal gate; the pipeline over all 177 registered cases, warm in 132.4 s against the 88.5 s soft target at a start load of 0.61 per core;
- the research doctor and `test:model-corpus`, 30 tests;
- the platform guards that bind the capability inventory: the process showcase catalog, showcase diagrams, showcase preparation and capabilities panel, 21 tests.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `8044864b` | `fork-turns-none` | `approve-with-required-edits` | `bca60629` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
