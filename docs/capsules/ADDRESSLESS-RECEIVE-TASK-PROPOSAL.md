# Addressless Receive Task proposal

## Status

Lifecycle: draft
Review: approved

## Question and delivery boundary

Can a Receive Task profile admit a Receive Task that names no Message, so that it waits until one explicit command naming its published occurrence resumes it, while a named, correlated or payload Message delivery, a User Task completion and every other command leave it waiting? CIB realizes this wait as an execution signal; the project exposes its own occurrence-addressed ingress instead of cloning that API.

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (task breadth). It serves `PC-HUM-06` of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), primary, for its root clauses: the root witness resuming exactly once, the classified CIB execution-signal realization, the project-owned ingress, the wrong or stale occurrence refusing unchanged, and the Message or Signal broadcast that cannot resume the wait. The family establishes the channel arm, the CIB mapping, the Temporal path and the Product 2 decoding that the remaining clauses reuse.

The repeated, embedded and both Multi-Instance clauses stay open, with two blockers. The repeated and embedded clauses need the Message wait in the nested scope-data profile, which admits task-separated cycles, repeated scope activations and embedded Sub-Processes but excludes Messages; its Lean analyses case on the User Task wait in many modules, about 46 by a rough count, many at their size ceilings. A follow-up family admitting the wait there is scheduled in PLAN directly after this one lands. The two Multi-Instance clauses additionally need a profile admitting a Multi-Instance Receive Task body in both modes, which no profile does today (the nested scope-data profile excludes `multi-instance`, and the `PC-MI` contracts select User, Service, Call and Sub-Process bodies); they stay open behind that separate prerequisite, unless the follow-up family's proposal finds a Receive Task inside a Multi-Instance Sub-Process body (`PC-MI-04` to `PC-MI-06`) an adequate witness.

Selection, 2026-11-04. Over the pinned CIB checkout, outside `target/` and `model-api`, 167 model files hold a Receive Task without `messageRef`; 60 of them carry no boundary, timer, message, signal, error, escalation, compensation, conditional, link, terminate or Multi-Instance definition, no Inclusive, Event-Based or Complex Gateway, no Script or Rule Task, no Collaboration and no Java class, expression, asynchronous continuation or listener. Of those 60, 29 are exactly Start, one Receive Task and End, and 24 of those carry `camunda:inputOutput`, which stays refused, so this family admits at most 5 pinned models, a heuristic count that source admission confirms during implementation; the other 31 compose the wait with chains, User or Service Tasks or Parallel forms and wait for the follow-up family. Activity fan-in (`PC-CF-07`) admits 3 such models and needs a kernel extension; Link Events (`PC-BASIC-02`) admit none, both executable Link models needing this wait first.

Close call, decided on reach and reuse: at most 5 admitted models against 3 for Activity fan-in, with the channel, CIB, Temporal and Product 2 foundations carried into the 31 composed models; the wait is task breadth, so it belongs to batch 4 rather than to batch 5's event breadth.

## Normative basis and CIB classification

- **Clause 10.3.3 and Table 10.10.** A Receive Task "is designed to wait for a Message to arrive from an external Participant … Once the Message has been received, the Task is completed." Its `messageRef` is `[0..1]`: a Message "MAY be entered".
- **Clause 13.3.3.** "Upon activation, the Receive Task begins waiting for the associated Message. When the Message arrives … Receive Task completes."

With `messageRef` absent the associated Message is unspecified: BPMN states that the Task waits for and completes on a Message, but not how an unspecified Message is addressed. That is a gap, not a choice CIB contradicts.

CIB Seven `2.2.0`, pinned: `BpmnParse.parseReceiveTask` (`BpmnParse.java:2745-2766`) gives every Receive Task a `ReceiveTaskActivityBehavior` and declares a Message event subscription only when `messageRef` is present. The behavior's `performExecution` does nothing, a wait state, and `signal` calls `leave` (`ReceiveTaskActivityBehavior.java:31-41`; its doc names "the external trigger, given by calling the `RuntimeService#signal(String)` operation" as the only Message supported). `SignalCmd` (`SignalCmd.java:50-68`) finds the execution by ID, sets optional process variables and signals it. `ReceiveTaskTest#testReceiveTaskWithoutMessageReference` exercises this path.

Two register entries classify the realization, added with the implementation:

- `CIB-INT-0004`, interpretation: a Receive Task without a Message waits for an occurrence-addressed external trigger, resolving the gap as CIB's execution signal does. An unspecified delivery addresses only an addressless wait. CIB's signal also completes a Message-addressed Receive Task (`ReceiveTaskTest#testSupportsLegacySignalingOnSingleReceiveTask`); the profile refuses an unspecified delivery to a direct wait, a project restriction for which no CIB agreement is claimed. The trigger carries no variables, and CIB's variable-setting signal stays outside the profile.
- `CIB-OP-0011`, operational mapping: the oracle adapter projects the one CIB execution waiting at an addressless Receive Task, found by an execution query on its activity ID, to the open wait `(stable instance, element, activation 1)` with channel `unspecifiedMessage`, and maps its delivery to `RuntimeService#signal(executionId)`, keeping the execution ID local to the call. Missing, multiple or consumed executions are refused before the call. Its boundary mirrors `CIB-OP-0005`'s: one live activation-`1` wait in one Process instance.

## Required, optional and excluded scope

Required: in the new addressless Receive Task profile, a non-instantiating Receive Task with only `id` and optional `name`, no `messageRef`, `operationRef`, `implementation`, data output, extension elements or Camunda attributes, as the profile's one Receive Task between its None Start and None End, with the Process as the only root definition.

Optional: none.

Excluded, each refused at admission:

- `instantiate="true"`, `operationRef`, a non-default `implementation`, data inputs or outputs, `camunda:inputOutput`, listeners and asynchronous continuations;
- a Receive Task without a Message under every other profile;
- a root Message definition beside an addressless Receive Task, and a model holding both kinds of Receive Task;
- variables carried by the trigger, CIB's signal-to-any-activity and signal names.

These bound admission only: the repeated, embedded and Multi-Instance clauses broaden the class into the nested scope-data profile without reinterpreting an admitted model.

## Profile and public contract

A new profile, `cibseven-2.2.0-addressless-receive-task-draft`, selects the shape; it names `CIB-INT-0004`, `CIB-OP-0011` and `CIB-CFG-0001`, and excludes the Message-addressed Receive Task. Growing `cibseven-2.2.0-message-addressed-receive-task-draft` in place instead was rejected after approval: the cyclic-control-flow specification's non-updatable preservation baseline binds that profile's digest and authorizes one projection exception only, so in-place growth would need a second guard exception, while the owner direction of 2026-10-14 permits but does not require in-place growth for a new family. The Message-addressed profile, its retained evidence and that baseline stay unchanged.

The public contract gains one arm of the closed Message channel, `unspecifiedMessage`, with no fields. It is admitted in exactly four positions: the checked Receive Task node, its `awaitMessage` operation, the runtime Message wait with its open wait and enabled `deliverMessage` interaction, and the `DeliverMessage` stimulus. Every other position the channel types refuses it (`ARECV-ADDRESS-02`): the Message Start trigger, the correlated Message address of publication and delivery, the payload Message wait, delivery and interaction, the Intermediate Catch and boundary Message arms, the event-race arms, the Message initiation and the Event Sub-Process Message subscription.

No `StimulusKind`, `WaitKind`, `CommandOutcome`, runtime-state collection, IL operation kind, Temporal Signal, Update or client function is added. The existing [`submitMessageDelivery`](../../packages/temporal-adapter/client/src/process-client.ts) is the project-owned ingress: a caller resumes the wait by delivering `{ kind: "deliverMessage", subscriptionId, channel: { kind: "unspecifiedMessage" } }` for the published occurrence. The project has no Signal ingress, so no Signal broadcast exists to reach the wait.

## Representation and runtime ownership

- **Source.** `projectReceiveTask` (`receive-task-source.ts`) projects a Receive Task without `messageRef` to the checked node with channel `unspecifiedMessage`, under this profile only. The profile's root-definition selection admits the Process alone when its Receive Task names no Message.
- **Checked node and IL.** The checked `receiveTask` channel widens from the direct arm to direct or unspecified; lowering copies the channel into `awaitMessage` and is unchanged.
- **Runtime.** The existing Message wait records the channel. `sameMessageChannel` gains the arm: two unspecified channels are equal, and no unspecified channel equals a direct or operation channel.
- **Delivery.** The existing `deliverMessage` evaluator and Lean `MessageDeliveryStep` already require the delivered channel to equal the wait's channel and the subscription to name the waiting occurrence; they gain no case of their own.

The wait is published in `openMessageSubscriptions` because that record is already the project's occurrence-addressed passive wait; a parallel record kind would duplicate it. The checklist's "without a Message subscription" excludes a named, correlatable or broadcast-reachable subscription, which neither CIB nor the profile creates; this proposal amends the `PC-HUM-06` row visibly to say so, under the checklist's amendment rule and this review, and the [CIB observation policy](../CIB-OBSERVATION-POLICY.md) states that an `unspecifiedMessage` entry is no BPMN or CIB Message subscription.

No runtime-only or synthetic construct is introduced: the channel arm is source-derived, owned by the wait it addresses, published with it and removed when the delivery consumes it.

## Admission

- **TypeScript.** The source reader projects the addressless node only under this profile, and selects no root Message for it; the profile reuses the shape `Start → ReceiveTask → End`; Program admission accepts an `awaitMessage` with the unspecified arm under this profile only and requires that arm there, and every other channel position keeps its positive kind check.
- **Lean.** The checked-process profile control and the Program-level profile shape admit the unspecified arm under this profile only, and every other channel match refuses it.
- **Host.** Host admission already classifies `awaitMessage` as passive external ingress without a channel predicate; the new arm changes no host-admission predicate.

## Stable rules

- `ARECV-ADDRESS-01`: a Receive Task without `messageRef` under this profile is admitted with channel `unspecifiedMessage`; a Message root beside it, any excluded attribute, and the same model under another profile are refused.
- `ARECV-ADDRESS-02`: the `unspecifiedMessage` arm is refused in every channel position other than the Receive Task node, its `awaitMessage` operation, its wait and the `DeliverMessage` stimulus.
- `ARECV-WAIT-01`: activation creates exactly one Message wait for the Receive Task occurrence with channel `unspecifiedMessage`, published as an open wait and an enabled `deliverMessage` interaction.
- `ARECV-RESUME-01`: a `DeliverMessage` naming that subscription with channel `unspecifiedMessage` consumes the wait and completes the Receive Task occurrence once; the Process then completes at its None End.
- `ARECV-REFUSE-01`: a delivery naming another occurrence, the consumed occurrence or another instance, a delivery with a direct, operation, payload or correlated channel, a correlated publication addressed to the definition, and every other stimulus kind are refused and leave the state unchanged.

## Newly reachable waits and resumption

The only new stable state is the profile's one live Message wait with the unspecified arm; it resumes only through `ARECV-RESUME-01`. The host wait-set shape is the existing single passive Message wait, already admitted.

## Separating witnesses

The retained whole model is a parcel handover: *Handover requested* starts, *Await courier pickup* waits, *Parcel handed over* ends; the courier's scanner resumes the wait by its published occurrence.

- **Resume.** Start, observe one wait with channel `unspecifiedMessage`, deliver it, observe completion.
- **Named delivery first.** Deliver a direct Message naming the same occurrence: refused, state unchanged; then resume.
- **Stale.** Resume, then deliver again: refused; another occurrence ID: refused.
- **Broadcast.** A correlated address carrying the unspecified arm is refused by address admission in the core and Lean; a correlated delivery with an operation address naming this definition is refused because no correlated wait exists, and the host's correlated-ingress admission refuses a publication to a definition without one; the CIB probe shows that Message correlation and Signal broadcast do not reach CIB's wait.
- **Admission.** Adding a root Message, `instantiate="true"`, `camunda:inputOutput`, the same model under the Message-addressed or nested scope-data profile, and a Message-addressed task under this profile: refused.
- **Separation from the direct slice.** The existing Message-addressed scenarios keep their exact results; the direct channel still refuses an unspecified delivery, a project restriction where CIB's legacy signal would complete the task.

## Rule-to-evidence matrix

| Rule | Witness | Evidence | Mutation that must fail |
|---|---|---|---|
| `ARECV-ADDRESS-01` | Admission edits | Source test, Lean conformance module, CIB probe | Admit the model with a root Message; project a direct channel for an addressless task |
| `ARECV-ADDRESS-02` | Arm in other positions | Core admission tests, Lean structural-validation and correlation-address checks | Accept the arm in a Message Start trigger, a correlated address or a payload wait |
| `ARECV-WAIT-01` | Resume | Pipeline, core runtime test, hosted witness, CIB probe | Auto-complete at activation; publish no wait |
| `ARECV-RESUME-01` | Resume | Pipeline, Lean `MessageDeliveryStep` soundness, hosted witness with Worker replacement and replay, CIB probe | Leave the wait after delivery; complete twice |
| `ARECV-REFUSE-01` | Named delivery first, stale, broadcast | Pipeline, core runtime test, Lean conformance, CIB probe | Match channels by kind only on the direct side; let a direct delivery resume an unspecified wait |

## Lean assurance lane

Lane shape: proved

Evidence: the delivery law [`deliverMessage_sound`](../../BpmnSemantics/SemanticProcess/Message.lean#deliverMessage_sound) relates every committed delivery to `MessageDeliveryStep`, whose premise `wait.channel = channel` is quantified over the whole channel union, so soundness of the new arm is covered by the existing proof; refusal completeness is not, and rests on the finite proved laws the [Receive Task conformance module](../../BpmnSemantics/ReceiveTaskConformance.lean) adds for the unspecified arm in the shape of its direct-Message laws, including every mismatched address preserving state. Guaranteeing declarations: [`deliverMessage_sound`](../../BpmnSemantics/SemanticProcess/Message.lean#deliverMessage_sound).

The family adds no transition family. It edits the `MessageChannel` inductive in `BpmnSemantics/Scenario.lean`, the kernel hub, because the channel is part of the public wait and stimulus; a synthetic Message ID instead would fabricate an identity the source does not have. The repository's fan-out model puts the interface edit at 1,022 of 1,046 modules, so every global fixture rebuilds. Each exhaustive channel match decides the new arm, refusing it everywhere except the Receive Task positions:

- admission and validation: `CheckedProcessAdmission`, `ProgramStructuralValidation` (a closed-world function) and its laws, `ProfileShapeCatalog`, `RepeatableSubscriptionAdmission`, `MessageStart`, `MessageKeyCorrelation` and `MessageKeyCorrelationProfileAdmission`;
- runtime order and proofs: `InternalCommutationCore` (channel order), `MessageBoundedTask` and `InternalMessageTaskPreparation` (proofs by cases on the channel);
- wire: `JsonSupport` and `SemanticProcessJson/Observation`;
- the arm and `identifiersNonempty`: `Scenario`.

`MessageMonitoredTask` and both Interrupting Message Event Sub-Process admissions match the operation arm positively and already refuse the new one. These edits land in one commit, so the fixtures rebuild once.

## Temporal hosting and refinement preflight

The state relation is unchanged: the Workflow holds the admitted Program and the core runtime state, and every Query and result is derived from committed core state.

- **Durable ingress:** the existing Message Signal `bpmn-deliver-message` and its result Query; the client's [`submitMessageDelivery`](../../packages/temporal-adapter/client/src/process-client.ts) accepts the stimulus unchanged.
- **Wait:** passive; no Timer, Activity, Child Workflow, cancellation or outbound command.
- **Deduplication:** content-bound over the complete stimulus, channel included; reusing a command ID with a direct channel conflicts before semantic application.
- **Ordering, retry, replay:** as for the direct Receive Task, whose hosted cases run on [`receive-task-message-temporal-cases.ts`](../../packages/temporal-adapter/testkit/test/receive-task-message-temporal-cases.ts).

Smallest refinement witness: start the parcel handover, observe the unspecified wait, stop the Worker, deliver while it is absent, start a replacement Worker, recover the committed result, assert completion and the exact Signal history, and replay the history.

## Evidence and acceptance

- Pipeline cases for the resume and named-delivery-first scenarios, agreeing across Lean, core, Temporal and CIB; the CIB side's open wait is adapter-derived under `CIB-OP-0011`, not engine-observed.
- A CIB probe: deploying the model creates no event subscription, the execution waits at the Receive Task, `RuntimeService.signal(executionId)` completes the Process and a second signal is refused, and neither `correlateMessage` nor `signalEventReceived` reaches the wait.
- The hosted witness above.
- Product 2 decodes a publication of the parcel handover, its open wait and its delivery; its history shows the delivery by occurrence, as it does today.
- A corpus row for the parcel handover under the [model-corpus guard](../../model-corpus/README.md).

## Versioning consequences

One current representation: the channel union gains its arm in every producer and consumer atomically, with no compatibility reader. The new arm carries no field, so the caller's channel assertion degenerates to naming the variant; the occurrence stays selected by `subscriptionId` alone, as it is for the direct arm.

These owners state the closed two-arm union or exclude the addressless task, and are amended in the same change: the [Message-addressed Receive Task specification](RECEIVE-TASK-MESSAGE-SPEC.md#closed-message-address-representation) (closed union and "always produces `directMessage`"; its exclusion of the addressless task stays true for its own profile and gains a pointer here), [contracts/README.md](../../contracts/README.md), the [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), the [CIB observation policy](../CIB-OBSERVATION-POLICY.md) rows for `openMessageSubscriptions` and `enabledInteractions`, and the Receive Task conformance module's documentation.

### Owners this implementation grows

- Source: [`receive-task-source.ts`](../../packages/bpmn-source/src/receive-task-source.ts), [`root-definition-selection.ts`](../../packages/bpmn-source/src/root-definition-selection.ts).
- Core: [`semantic-value-contract.ts`](../../packages/semantic-core/src/semantic-value-contract.ts), [`message-channel.ts`](../../packages/semantic-core/src/message-channel.ts), [`checked-process-contract.ts`](../../packages/semantic-core/src/checked-process-contract.ts).
- Lean: [`Scenario.lean`](../../BpmnSemantics/Scenario.lean) (420/800 nonblank lines), the modules listed in the Lean lane, [`ReceiveTaskConformance.lean`](../../BpmnSemantics/ReceiveTaskConformance.lean).
- Contracts: [`scenario.schema.json`](../../contracts/schemas/scenario.schema.json), [`checked-process.schema.json`](../../contracts/schemas/checked-process.schema.json), [`semantic-process.schema.json`](../../contracts/schemas/semantic-process.schema.json), the new [profile](../../profiles/cibseven-2.2.0-addressless-receive-task-draft/profile.json).
- Host: [`command-identity.ts`](../../packages/temporal-adapter/protocol/src/command-identity.ts).
- CIB runner: [`ScenarioMessageProtocol.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioMessageProtocol.java), [`CibSevenMessageSubscriptionGateway.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenMessageSubscriptionGateway.java), [`CibSevenMessageProjector.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenMessageProjector.java), [`CibSevenScenarioCommandExecutor.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioCommandExecutor.java).
- Product 2: [`execution-publications.ts`](../../platform/contracts/src/execution-publications.ts), [`execution-publication-semantic-value-decoders.ts`](../../platform/contracts/src/execution-publication-semantic-value-decoders.ts).
- Register: [`CIB-BPMN-RELATION-REGISTER.md`](../CIB-BPMN-RELATION-REGISTER.md) for `CIB-INT-0004` and `CIB-OP-0011`.

Guards it must satisfy: [`lean-fanout.test.ts`](../../scripts/lean-fanout.test.ts), [`lean-module-cost.test.ts`](../../scripts/lean-module-cost.test.ts), [`source-hygiene.test.ts`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census.test.ts`](../../scripts/semantic-operation-consumer-census.test.ts), [`lean-source-contracts.test.ts`](../../scripts/lean-source-contracts.test.ts).

## Epistemic closure

- **Established after implementation:** the root addressless wait, its occurrence-addressed resumption and refusals, across Lean, core, Temporal, Product 2 decoding and CIB.
- **Nearest unsupported claim:** that `PC-HUM-06` is near closure; its repeated, embedded and Multi-Instance clauses need the follow-up family in the nested scope-data profile, which reuses only the channel arm, the CIB classification, the Temporal path and the Product 2 decoding.
- **Common-mode risks:** Lean and the core consume the same TypeScript-produced checked source, so the exclusions of a root Message beside the task and of both Receive Task kinds in one model rest on the TypeScript source reader alone, checked by the admission edits and the CIB probe; the CIB side's open wait is projected by the adapter, so its agreement on `openMessageSubscriptions` is adapter-decided.
- **Nearest realistic counterexample:** a client that delivers a direct Message to an addressless wait; it is refused, not silently accepted.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ba5192c6` | `fork-turns-none` | `approve-with-required-edits` | `4a757db0` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
