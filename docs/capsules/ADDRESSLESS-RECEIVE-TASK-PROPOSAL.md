# Addressless Receive Task proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the Receive Task profile admit a Receive Task that names no Message, so that it waits until one explicit command naming its published occurrence resumes it, while a named, correlated or payload Message delivery, a User Task completion and every other command leave it waiting? CIB realizes this wait as an execution signal; the project exposes its own occurrence-addressed ingress instead of cloning that API.

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (task breadth). It serves `PC-HUM-06` of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), primary, for its clauses on the root witness, the classified CIB execution-signal realization, the project-owned ingress, the wrong or stale occurrence refusing unchanged, and the Message or Signal broadcast that cannot resume the wait. Its repeated, embedded and both Multi-Instance witnesses stay open: they need the wait inside the nested scope-data profile's analyses, whose Lean proofs case on the User Task wait in about 25 modules, many at their size ceilings.

Selection, 2026-11-04. Over the pinned CIB checkout, outside `target/` and `model-api`, 167 model files hold a Receive Task without `messageRef`; 60 of them carry no boundary, timer, message, signal, error, escalation, compensation, conditional, link, terminate or Multi-Instance definition, no Inclusive, Event-Based or Complex Gateway, no Script or Rule Task, no Collaboration and no Java class, expression, asynchronous continuation or listener. Of those 60, 29 are exactly Start, one Receive Task and End; 24 of them are CIB's input/output-mapping fixtures, which carry `camunda:inputOutput` and stay refused. Activity fan-in (`PC-CF-07`) reaches 3 such models and Link Events (`PC-BASIC-02`) none, both executable Link models needing this wait first.

Close call, decided on reach: the wait is task breadth in the checklist's Human, Receive and pass-through section, so it belongs to batch 4 rather than to batch 5's event breadth.

## Normative basis and CIB classification

- **Clause 10.3.3 and Table 10.10.** A Receive Task "is designed to wait for a Message to arrive from an external Participant … Once the Message has been received, the Task is completed." Its `messageRef` is `[0..1]`: a Message "MAY be entered".
- **Clause 13.3.3.** "Upon activation, the Receive Task begins waiting for the associated Message. When the Message arrives … Receive Task completes."

With `messageRef` absent the associated Message is unspecified: BPMN states that the Task waits for and completes on a Message, but not how an unspecified Message is addressed. That is a gap, not a choice CIB contradicts.

CIB Seven `2.2.0`, pinned: `BpmnParse.parseReceiveTask` (`BpmnParse.java:2745-2757`) gives every Receive Task a `ReceiveTaskActivityBehavior` and declares a Message event subscription only when `messageRef` is present. The behavior's `performExecution` does nothing, a wait state, and `signal` calls `leave` (`ReceiveTaskActivityBehavior.java:31-41`; its doc names "the external trigger, given by calling the `RuntimeService#signal(String)` operation" as the only Message supported). `SignalCmd` (`SignalCmd.java:50-68`) finds the execution by ID, sets optional process variables and signals it. `ReceiveTaskTest#testReceiveTaskWithoutMessageReference` exercises this path.

Classification: a new interpretation, `CIB-INT-0004` (a Receive Task without a Message waits for an occurrence-addressed external trigger): the profile resolves the gap as CIB does, with one restriction. The trigger names the published Receive Task occurrence, never a CIB execution, and carries no variables; CIB's variable-setting signal and signals to other activities stay outside the profile.

## Required, optional and excluded scope

Required: in the Receive Task profile, a non-instantiating Receive Task with only `id` and optional `name`, no `messageRef`, `operationRef`, `implementation`, data output, extension elements or Camunda attributes, as the profile's one Receive Task between its None Start and None End, with the Process as the only root definition.

Optional: none.

Excluded, each refused at admission:

- `instantiate="true"`, `operationRef`, a non-default `implementation`, data inputs or outputs, `camunda:inputOutput`, listeners and asynchronous continuations;
- a Receive Task without a Message under every other profile;
- a root Message definition beside an addressless Receive Task, and a model holding both kinds of Receive Task;
- variables carried by the trigger, CIB's signal-to-any-activity and signal names.

These bound admission only: the repeated, embedded and Multi-Instance witnesses (`PC-HUM-06`'s other clauses) broaden the class into the nested scope-data profile without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-message-addressed-receive-task-draft` grows in place, under the [owner direction of 2026-10-14](../../contracts/README.md): the widening is additive, and every model, command and observation it admits today keeps its exact meaning. It gains the feature `addressless-receive-task`, loses that entry from `excluded`, and names `CIB-INT-0004`; its claim string widens to name both Receive Task variants, and its id keeps its name because the identity rule ties the id to unchanged meaning of what is already admitted, which holds.

The public contract gains one arm of the closed Message channel, `unspecifiedMessage`, with no fields. It appears wherever a channel appears: the checked Receive Task node, the `awaitMessage` operation, the runtime Message wait, the public open subscription, the enabled interaction and the `DeliverMessage` stimulus. No `StimulusKind`, `WaitKind`, `CommandOutcome`, runtime-state collection, IL operation kind, Temporal Signal, Update or client function is added. The existing [`submitMessageDelivery`](../../packages/temporal-adapter/client/src/process-client.ts) is the project-owned ingress: a caller resumes the wait by delivering `{ kind: "deliverMessage", subscriptionId, channel: { kind: "unspecifiedMessage" } }` for the published occurrence.

## Representation and runtime ownership

- **Source.** `projectReceiveTask` (`receive-task-source.ts`) projects a Receive Task without `messageRef` to the checked node with channel `unspecifiedMessage`, under this profile only. The profile's root-definition selection admits the Process alone when its Receive Task names no Message.
- **Checked node and IL.** The checked `receiveTask` channel widens from the direct arm to direct or unspecified; lowering is unchanged and copies the channel into `awaitMessage`.
- **Runtime.** The existing Message wait records the channel. `sameMessageChannel` gains the arm: two unspecified channels are equal, and no unspecified channel equals a direct or operation channel.
- **Delivery.** The existing `deliverMessage` evaluator and Lean `MessageDeliveryStep` already require the delivered channel to equal the wait's channel and the subscription to name the waiting occurrence; they gain no case of their own.

The checklist's "without a Message subscription" is met in the sense that decides it: no named, correlatable subscription exists, so no Message name, correlation or broadcast can reach the wait. What the profile publishes is the occurrence address the checklist requires ("naming its published occurrence"); it reuses the existing open-subscription record because that record already is the project's occurrence-addressed passive wait, and a parallel record kind would duplicate it.

No runtime-only or synthetic construct is introduced: the channel arm is source-derived, owned by the wait it addresses, published with it and removed when the delivery consumes it.

## Admission

- **TypeScript.** The source reader projects the addressless node only under this profile; the profile shape `Start → ReceiveTask → End` already admits one Receive Task; the operation admission accepts `awaitMessage` with either channel arm of a Receive Task.
- **Lean.** The checked-process profile control and the Program-level profile shape accept the unspecified arm exactly where they accept the direct one.
- **Host.** Host admission already classifies `awaitMessage` as passive external ingress; the new arm changes no host-admission predicate.

## Stable rules

- `ARECV-ADDRESS-01`: a Receive Task without `messageRef` under this profile is admitted with channel `unspecifiedMessage`; a Message root beside it, any excluded attribute, and the same model under another profile are refused.
- `ARECV-WAIT-01`: activation creates exactly one Message wait for the Receive Task occurrence with channel `unspecifiedMessage`, published as an open subscription and an enabled `deliverMessage` interaction.
- `ARECV-RESUME-01`: a `DeliverMessage` naming that subscription with channel `unspecifiedMessage` consumes the wait and completes the Receive Task occurrence once; the Process then completes at its None End.
- `ARECV-REFUSE-01`: a delivery naming another occurrence, the consumed occurrence or another instance, a delivery with a direct, operation, payload or correlated channel, and every other stimulus kind are refused and leave the state unchanged.

## Newly reachable waits and resumption

The only new stable state is the profile's one live Message wait with the unspecified arm; it resumes only through `ARECV-RESUME-01`. The host wait-set shape is the existing single passive Message wait, already admitted.

## Separating witnesses

The retained whole model is a parcel handover: *Handover requested* starts, *Await courier pickup* waits, *Parcel handed over* ends; the courier's scanner resumes the wait by its published occurrence.

- **Resume.** Start, observe one wait with channel `unspecifiedMessage`, deliver it, observe completion.
- **Named delivery first.** Deliver a direct Message naming the same occurrence: refused, state unchanged; then resume.
- **Stale.** Resume, then deliver again: refused; another occurrence ID: refused.
- **Admission.** Adding a root Message, `instantiate="true"`, `camunda:inputOutput`, or the same model under the nested scope-data profile: refused.
- **Separation from the direct slice.** The existing Message-addressed scenarios keep their exact results; the direct channel still refuses an unspecified delivery.

## Rule-to-evidence matrix

| Rule | Witness | Evidence | Mutation that must fail |
|---|---|---|---|
| `ARECV-ADDRESS-01` | Admission edits | Source test, Lean conformance module, CIB probe | Admit the model with a root Message; project a direct channel for an addressless task |
| `ARECV-WAIT-01` | Resume | Pipeline, core runtime test, hosted witness, CIB probe | Auto-complete at activation; publish no wait |
| `ARECV-RESUME-01` | Resume | Pipeline, Lean `MessageDeliveryStep` soundness, hosted witness with Worker replacement and replay, CIB probe | Leave the wait after delivery; complete twice |
| `ARECV-REFUSE-01` | Named delivery first, stale | Pipeline, core runtime test, Lean conformance, CIB probe | Match channels by kind only on the direct side; let a direct delivery resume an unspecified wait |

## Lean assurance lane

Lane shape: proved

Evidence: the delivery law [`deliverMessage_sound`](../../BpmnSemantics/SemanticProcess/Message.lean#deliverMessage_sound) relates every committed delivery to `MessageDeliveryStep`, whose premise `wait.channel = channel` is quantified over the whole channel union, so the new arm is covered by the existing proof; the [Receive Task conformance module](../../BpmnSemantics/ReceiveTaskConformance.lean) adds proved admission, wait and refusal laws for the unspecified arm in the shape of its direct-Message laws, including every mismatched address preserving state. Guaranteeing declarations: [`deliverMessage_sound`](../../BpmnSemantics/SemanticProcess/Message.lean#deliverMessage_sound).

The family adds no transition family. It touches the `MessageChannel` inductive in `BpmnSemantics/Scenario.lean`, a hub, because the channel is part of the public wait and stimulus; the alternative, a synthetic Message ID, would fabricate an identity the source does not have. The edit is one arm; exhaustive matches over the channel gain one case, and every fixture that merely constructs a channel is untouched.

## Temporal hosting and refinement preflight

The state relation is unchanged: the Workflow holds the admitted Program and the core runtime state, and every Query and result is derived from committed core state.

- **Durable ingress:** the existing Message Signal `bpmn-deliver-message` and its result Query; the client's [`submitMessageDelivery`](../../packages/temporal-adapter/client/src/process-client.ts) accepts the stimulus unchanged.
- **Wait:** passive; no Timer, Activity, Child Workflow, cancellation or outbound command.
- **Deduplication:** content-bound over the complete stimulus, channel included; reusing a command ID with a direct channel conflicts before semantic application.
- **Ordering, retry, replay:** as for the direct Receive Task, whose hosted cases run on [`receive-task-message-temporal-cases.ts`](../../packages/temporal-adapter/testkit/test/receive-task-message-temporal-cases.ts).

Smallest refinement witness: start the parcel handover, observe the unspecified wait, stop the Worker, deliver while it is absent, start a replacement Worker, recover the committed result, assert completion and the exact Signal history, and replay the history.

## Evidence and acceptance

- Pipeline cases for the resume and named-delivery-first scenarios, agreeing across Lean, core, Temporal and CIB.
- A CIB probe: deploying the model creates no Message event subscription, the execution waits at the Receive Task, `RuntimeService.signal(executionId)` completes the Process, and `correlateMessage` for any name finds no target.
- The hosted witness above.
- A corpus row for the parcel handover under the [model-corpus guard](../../model-corpus/README.md).

## Versioning consequences

One current representation: the channel union gains its arm in every producer and consumer atomically, with no compatibility reader. The [Message-addressed Receive Task specification](RECEIVE-TASK-MESSAGE-SPEC.md#closed-message-address-representation) states the closed union, says the Receive Task source always produces `directMessage`, and excludes a Receive Task without `messageRef`; the change amends those three statements, and its other rules keep their meaning. The new arm carries no field, so the caller's channel assertion degenerates to naming the variant; the occurrence stays selected by `subscriptionId` alone, as it is for the direct arm.

### Owners this implementation grows

- Source: [`receive-task-source.ts`](../../packages/bpmn-source/src/receive-task-source.ts), [`root-definition-selection.ts`](../../packages/bpmn-source/src/root-definition-selection.ts).
- Core: [`semantic-value-contract.ts`](../../packages/semantic-core/src/semantic-value-contract.ts), [`message-channel.ts`](../../packages/semantic-core/src/message-channel.ts), [`checked-process-contract.ts`](../../packages/semantic-core/src/checked-process-contract.ts).
- Lean: [`Scenario.lean`](../../BpmnSemantics/Scenario.lean) (420/800 nonblank lines), [`Lowering.lean`](../../BpmnSemantics/SemanticProcess/Lowering.lean) (777/800, 23 lines of headroom), [`ReceiveTaskConformance.lean`](../../BpmnSemantics/ReceiveTaskConformance.lean).
- Contracts: [`scenario.schema.json`](../../contracts/schemas/scenario.schema.json), [`checked-process.schema.json`](../../contracts/schemas/checked-process.schema.json), [`semantic-process.schema.json`](../../contracts/schemas/semantic-process.schema.json), the [profile](../../profiles/cibseven-2.2.0-message-addressed-receive-task-draft/profile.json).
- Host: [`command-identity.ts`](../../packages/temporal-adapter/protocol/src/command-identity.ts), [`host-admission.ts`](../../packages/temporal-adapter/protocol/src/host-admission.ts).

Guards it must satisfy: [`lean-fanout.test.ts`](../../scripts/lean-fanout.test.ts), [`lean-module-cost.test.ts`](../../scripts/lean-module-cost.test.ts), [`source-hygiene.test.ts`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census.test.ts`](../../scripts/semantic-operation-consumer-census.test.ts), [`lean-source-contracts.test.ts`](../../scripts/lean-source-contracts.test.ts).

## Epistemic closure

- **Established after implementation:** the root addressless wait, its occurrence-addressed resumption and refusals, across Lean, core, Temporal and CIB.
- **Nearest unsupported claim:** the wait inside a Sub-Process, a loop or a Multi-Instance body (`PC-HUM-06`'s other clauses).
- **Common-mode risk:** Lean and the core consume the same TypeScript-produced checked source, so the source projection is checked by the admission edits and the CIB probe, not by target agreement.
- **Nearest realistic counterexample:** a client that delivers a direct Message to an addressless wait; it is refused, not silently accepted.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
