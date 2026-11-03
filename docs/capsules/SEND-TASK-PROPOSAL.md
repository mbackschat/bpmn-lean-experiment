# Send Task proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a BPMN Send Task whose send is performed by an explicitly configured handler, executing it as the profile's existing mapped effect, wherever the profile admits a mapped Service Task, without inferring a transport from a Message or Message Flow and without changing any other element, profile, command or observation?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (“Plain/Manual, Send, Script, Rule …; reuse effect/control contracts”). Its mechanism is the source reader's projection: today `readScope` refuses `bpmn:SendTask` as outside the contract ([nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts)), and the [executable capability inventory](../../scripts/executable-model-capabilities.ts) rejects it as unclassified. It serves one row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-AUTO-04`, primary: its clauses on an explicitly configured outbound send with typed message data and prescribed completion, a send derived from a committed occurrence snapshot, a wrong result failing, duplicate transport recovery creating no second BPMN activation, and no transport inferred from Message Flow. The row stays open on prescribed failure (technical failure, retry and incidents, which this profile does not admit for any task, `PC-AUTO-03`) and on wrong recipient and correlation, which need a Message-addressed send (`PC-MESSAGE-09`).

Screened out, each with its reason:

- A wait-free branch of a terminal fork (`PC-HUM-04`'s last residual): it needs `ordinaryEnd` and `regional` commutation pair laws beside declared entries, a new Lean proof family, and no pinned CIB model whose shape the profile otherwise admits holds it.
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`): each first needs a language or decision-engine binding, a dependency decision.
- Implicit split and merge and Link Events (`PC-CF-07`, `PC-BASIC-02`): the control place without a Sequence Flow behind it, the kernel extension on which the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected.

Selection, 2026-11-03: of the pinned checkout's 2,458 `*.bpmn` and `*.bpmn20.xml` files outside `target/`, 11 hold a Send Task, every one with a CIB implementation (two `camunda:class`, seven `type="mail"`, one `type="external"`, one connector), none with a `messageRef`; the delegate and expression forms appear only in Java-built test models (`SelfCancellationTest`, `ProcessModels`). Close call against the wait-free terminal branch: it would close `PC-HUM-04` but reaches no pinned model and needs a new commutation proof family, against a Send Task that reuses the approved effect contract unchanged at the cost of one source projection.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.3 defines the Send Task as a Task that sends a Message to an external Participant, with `messageRef`, `operationRef` and `implementation` (default `##WebService`, Table 10.9); it has at most one Data Input whose data populates the Message, and the Participant is identified through a Message Flow of the definitional Collaboration. Clause 13.3.3 has it assign the Message from its Data Input on activation, send it and complete. The standard leaves the sending technology to `implementation`.

CIB Seven `2.2.0` (`BpmnParse.parseSendTask`, `engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/parser/BpmnParse.java:2505-2541`, pinned `5a45b47e`) never reads `messageRef`, `operationRef` or `implementation`. With `camunda:class`, `delegateExpression`, `expression` or `type` it parses the Send Task as a Service Task (`parseServiceTaskLike`, CAM-942, “to allow implementing the send handling yourself”); without one it reports a parse error. It parses `camunda:inputOutput` and `camunda:asyncBefore` as on every activity, and records each activation as a historic activity instance of type `sendTask` (`BpmnParse.java:1912`, `ActivityTypes.TASK_SEND_TASK`).

Classification: a new bounded extension, `CIB-EXT-0023` (Send Task performed by a configured handler): the send is the handler's effect, configured by `camunda:delegateExpression` and bound by the source overlay as the profile's Service Tasks are (`CIB-EXT-0019`), and the Message data are the handler's inputs. No Message is constructed and no Message Flow, Collaboration or `messageRef` is read; the profile refuses each. The asynchronous continuation keeps its existing relationship under this profile.

## Required, optional and excluded scope

Required: a `bpmn:SendTask` in every position the profile admits a mapped Service Task (the serial, re-entry, concurrent and Sub-Process body accounts of the profile, single-scope models included), with exactly the Service Task's source form: `id`, an optional `name`, `implementation` absent or the Activity effect protocol, `camunda:delegateExpression` bound by the source overlay, `camunda:asyncBefore="true"`, and `camunda:inputOutput` input parameters of the admitted grammar.

Optional: none.

Excluded, each refused at admission:

- a Send Task without a delegate expression, or with `camunda:class`, `expression`, `type` (mail, external, connector) or `resultVariable`;
- `messageRef`, `operationRef`, any other `implementation`, a Collaboration, Participant or Message Flow, and Message definitions referenced by a Send Task;
- output parameters: a Send Task has no Data Output (Clause 10.3.3), so its handler's result patch must be empty;
- a boundary Error Event on a Send Task, listeners, loop and Multi-Instance characteristics, and every other exclusion of the Service Task under this profile;
- a Send Task under every other profile.

These bound admission only: a later Message-addressed send (`PC-MESSAGE-09`) or a Send Task with outputs broadens the class without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `send-tasks` and the relationship `CIB-EXT-0023`, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation, wire contracts and the checked-process schema are unchanged: a Send Task's effect is published exactly as a Service Task's (`EFFECT-OBSERVE-01`), an open effect with its occurrence identity and descriptor, which carries no element kind for either.

## Representation and runtime ownership

No kernel type, IL, runtime or Lean change. The source reader projects an admitted Send Task to the checked `serviceTask` node with an empty output list, through the same projection and overlay binding as a Service Task; lowering, admission, execution and publication are the Service Task's.

- The checked graph does not keep the Send Task's source kind. Unlike the pass-through kinds (`PTT-KIND-01`), whose checked notation the pass-through account consumes, no consumer reads it: the Program drops task kinds, no observation publishes one for any effect, CIB's historic activity type lies outside the observation boundary, and the exact source bytes keep it. Adding it would change the checked-process wire contract and the Lean checked-process hub for no consumer. A later account that needs it, such as a Message-addressed send, adds it with that consumer.
- Rejected alternative: a separate checked `sendTask` node. It duplicates every Service Task admission and lowering arm at both levels, which the profile's accounts would each have to name.
- Rejected alternative: admitting output parameters as CIB does. They have no BPMN counterpart on a Send Task, and no pinned model uses them.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Only the nested scope-data reader gains the projection; its foreign-attribute rule admits `camunda:delegateExpression` and `camunda:asyncBefore` on a Send Task as on a Service Task, and the projected-key shape admits no `messageRef`, `operationRef` or other key. The checked and Program analyses are unchanged, since the projected node is a Service Task's.

Nearest wrong algorithms, each with a separating witness below:

1. treating every Send Task as a Service Task, which admits an unbound or mail-typed one;
2. reading `messageRef` as a transport, or accepting it as inert, which infers a send from a Message;
3. admitting the Service Task's output parameters on a Send Task, which accepts a non-empty result patch;
4. adding the projection to a shared reader, which admits a Send Task under another profile.

## Stable rules

| Rule | Statement |
|---|---|
| `SEND-ADMIT-01` | Under the nested scope-data profile a Send Task with an overlay-bound delegate expression, asynchronous continuation and input parameters is admitted in every position a mapped Service Task is, and only there. |
| `SEND-EFFECT-01` | An admitted Send Task executes as the profile's mapped effect: each activation commits one effect occurrence whose descriptor and arguments come from the committed state, and only its result completes it. |
| `SEND-DATA-01` | A Send Task's result patch is empty; a result carrying any binding is refused with exact state preservation. |
| `SEND-REFUSE-01` | A Send Task without a bound delegate, with another CIB implementation, with `messageRef`, `operationRef` or another `implementation`, with output parameters, or under another profile is refused at admission. |

## Newly reachable waits and resumption

None of a new kind. A Send Task's wait is the effect wait of the Service Task account, resumed only by its effect result, and its closures are bounded by the unchanged burst rules.

## Separating witnesses

Each model carries a source overlay binding its handler.

- **Shipping notice** (serial, single scope): Start binds `order`; User Task *Pack order* → Send Task *Send shipping notice*, handler `sendShippingNotice`, inputs `order` from `${order}` and `channel` from the literal `email` → End. Journey: complete *Pack order*, then the effect with an empty result; the Process completes.
- **Claim intake** (Sub-Process body with a fork): Start binds `claim`; Sub-Process *Intake* holds a fork into Send Task *Acknowledge claim*, handler `acknowledgeClaim`, input `claim`, and User Task *Assess claim*, joined before its End; then User Task *Settle claim* → End. Two journeys, in both completion orders of *Assess claim* and the acknowledgement's result.
- **Refused edits** of the shipping notice: the delegate removed (wrong algorithm 1), `type="mail"` instead, a `messageRef` to a declared Message (wrong algorithm 2), an output parameter (wrong algorithm 3), and the unedited model under the embedded completion profile (wrong algorithm 4).
- **Result refusal:** the shipping notice's effect result with one binding is refused and leaves the state unchanged, while the empty result commits (`SEND-DATA-01`).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `SEND-ADMIT-01` | Both models admitted at both levels; the profile edit refused | Source, core, pipeline (Lean and Temporal), CIB probe | Refuse the Send Task projection, or project it under every profile |
| `SEND-EFFECT-01` | Both journeys: one open effect per activation, completed by its result | Core, pipeline (Lean and Temporal), CIB probe | A pipeline mutation removing the open effect from the published state |
| `SEND-DATA-01` | The empty result commits; a one-binding result is refused | Core and source test | Admit output parameters on the projection |
| `SEND-REFUSE-01` | The refused edits | Source test | Drop any one refusal |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family, no runtime law and no Lean code. A Send Task's checked node and Program operation are a Service Task's, so the effect accounts of the profile apply as they stand: [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) admits the node and [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) lowers it to `awaitEffect`. The pipeline cases execute both journeys through the Lean evaluator and compare it with the core.

## Temporal hosting and refinement preflight

No new hosting mechanism. A Send Task's ingress, wait, effect, cancellation, lifecycle and publication are the mapped Service Task's: the adapter derives one Activity from the committed effect intent, and a transport retry reuses that occurrence's identity and idempotency key, so a duplicate delivery never creates another BPMN activation. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. A source test locks the refused edits, and a core test the result refusal. The CIB lane gains a Send Task probe driving both journeys in CIB `2.2.0` with each handler as a delegate bean, calibrating one asynchronous job and one historic activity instance of type `sendTask` per activation and the unchanged Process variables.

Then `PC-AUTO-04` is evidenced on its configured-send, committed-snapshot, wrong-result, duplicate-recovery and no-Message-Flow clauses for this profile, and stays open on prescribed failure and on wrong recipient and correlation.

Nearest unsupported claims:

- a Send Task under any other profile, or with a CIB `class`, expression, mail, external or connector implementation;
- a Message-addressed send, its recipient and correlation;
- technical failure, retry and incidents of the send;
- that every actual closure stays within the admitted burst (not proved in Lean, as for the accounts this family reuses).

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior: every model with a Send Task is refused today.

### Owners this implementation grows

The family touches no Lean source. TypeScript and tooling owners:

- the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts), which gains the projection behind a reader flag set only for this profile, and its foreign-attribute rule;
- the [projected flow-element keys](../../packages/bpmn-source/src/projected-flow-element-keys.ts), which gain the Send Task's key shape;
- the [executable capability inventory](../../scripts/executable-model-capabilities.ts) and the [About catalog](../../model-corpus/mvp-capabilities.ts), which classify and disclose the element;
- the [CIB effect projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEffectProjector.java), which locates a deployed `sendTask` as it does a `serviceTask`, and a new Send Task probe beside it.

Each owner stays below the review target; growth past it means an extraction, never an exception.

Guards the implementation must change or satisfy: the [projected flow-element keys test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), the [foreign-attribute admission test](../../packages/bpmn-source/test/foreign-attribute-admission.test.ts), the [executable model corpus test](../../packages/differential/test/executable-model-corpus.test.ts), the [capability catalog disclosures test](../../scripts/capability-catalog-disclosures.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [document reviewability guard](../../scripts/document-reviewability.test.ts).

Registration: the profile artifact's `features` and relationship list and its README; `CIB-EXT-0023` in the [register](../CIB-BPMN-RELATION-REGISTER.md); scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-MECH-TASK-01`, whose Send entry gains this bounded evidence.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
